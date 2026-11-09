#!/usr/bin/env node
/* Narc as an MCP server (stdio). Lets Claude Code, Claude Desktop or any MCP client ask Narc
   "where does this app send its users' data?" as a tool call.

     node mcp.js            # speaks MCP (JSON-RPC 2.0, one message per line) on stdin/stdout

   Uses the same analysis as the web app (lib/pipeline.js), so results match the Privacy tab.
   Zero dependencies. stdout carries protocol messages only; all logging goes to stderr. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './lib/pipeline.js';
import { parseRepoUrl } from './lib/github.js';
import { scanPrivacy, researchRecipient } from './lib/privacy.js';
import { scanText } from './lib/security.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Anything printed to stdout would corrupt the protocol stream, so route console output to stderr.
console.log = console.info = (...a) => console.error(...a);

// Same minimal .env loader as server.js: values already in the environment win.
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const env = process.env;

/* ------------------------------------------------------------------ analysis cache */

const CACHE_MS = 30 * 60e3;
const analyses = new Map(); // "owner/repo" -> { at, promise }

const keyOf = (repo) => { const { owner, repo: name } = parseRepoUrl(repo); return `${owner}/${name}`.toLowerCase(); };

/** Run (or reuse) a full Narc analysis. Concurrent calls for the same repo share one run. */
function getAnalysis(repo, { refresh = false, maxPRs, onProgress } = {}) {
  const key = keyOf(repo);
  const hit = analyses.get(key);
  if (hit && !refresh && Date.now() - hit.at < CACHE_MS) return hit.promise;
  // Local AI (NARC_LOCAL_AI=1) keeps every AI call on this machine via Ollama, as in the web app.
  const local = env.NARC_LOCAL_AI === '1';
  const opts = {
    repoUrl: repo,
    openaiKey: local ? 'local' : env.OPENAI_API_KEY,
    model: local ? env.LOCAL_MODEL || 'qwen2.5:7b' : env.OPENAI_MODEL || 'gpt-5-mini',
    fastModel: local ? env.LOCAL_FAST_MODEL || env.LOCAL_MODEL || 'qwen2.5:7b' : env.OPENAI_FAST_MODEL || '',
    openaiBaseUrl: local ? env.LOCAL_BASE_URL || 'http://127.0.0.1:11434/v1' : env.OPENAI_BASE_URL,
    githubToken: env.GITHUB_TOKEN,
    tavilyKey: env.TAVILY_API_KEY, exaKey: env.EXA_API_KEY,
    maxPRs: maxPRs || 12,
    includeIssues: true,
    jira: { site: env.JIRA_SITE, email: env.JIRA_EMAIL, token: env.JIRA_TOKEN, jql: env.JIRA_JQL },
  };
  const emit = (ev) => { if (ev.type === 'progress' && onProgress) onProgress(ev.message); };
  const promise = analyze(opts, emit).then(({ result }) => result);
  analyses.set(key, { at: Date.now(), promise });
  promise.catch(() => analyses.delete(key)); // never cache a failure
  return promise;
}

/* ------------------------------------------------------------------ result shaping */

const link = (r, file, line) => (file ? `${r.repo.url}/blob/${r.repo.defaultBranch}/${file}${line ? `#L${line}` : ''}` : null);
const where = (file, line) => (file ? `${file}${line ? `:${line}` : ''}` : null);
const SEV = ['', 'info', 'low', 'medium', 'high', 'critical'];

function overview(r) {
  const p = r.privacy, s = r.security;
  return {
    repo: { name: r.repo.fullName, url: r.repo.url, description: r.repo.description, language: r.repo.language, stars: r.repo.stars },
    analyzedAt: r.analyzedAt,
    privacy: {
      grade: p.grade, score: p.score, verdict: p.verdict,
      recipients: p.recipients.map((x) => `${x.name} (${x.category})`),
      flows: p.totals.flows, criticalFlows: p.totals.critical, openPRsChangingPrivacy: p.totals.prs,
      topFlows: p.flows.slice().sort((a, b) => b.severity - a.severity).slice(0, 8).map((f) => ({ title: f.title, severity: SEV[f.severity], where: where(f.file, f.line), link: link(r, f.file, f.line) })),
    },
    security: s ? { exposureScore: s.score, verdict: s.posture?.verdict, findings: s.findings.length, highOrCritical: s.findings.filter((f) => f.severity >= 4).length, knownCVEs: s.vulns.length, openEndpointsWithoutAuth: s.surface?.open } : null,
    techDebt: { index: r.summary.index, index90d: r.summary.index90, headline: r.summary.headline, openPRs: r.summary.openPRs },
    scoring: 'Privacy score is 100 minus points for data flows (max 55), recipients (max 30) and open-PR changes (max 15). Grades: A 90+, B 75+, C 60+, D 40+, F below 40. Findings are pattern-based leads to review, not verdicts.',
    warnings: r.warnings,
    next: 'Call privacy_report, security_report or pr_risks for details (the analysis is cached for 30 minutes).',
  };
}

function privacyReport(r) {
  const p = r.privacy;
  return {
    repo: r.repo.fullName, grade: p.grade, score: p.score, verdict: p.verdict, totals: p.totals,
    recipients: p.recipients.map((x) => ({ name: x.name, domain: x.domain, category: x.category, typicalUse: x.typical, files: x.files, flows: x.flows, personalData: x.pii, evidence: (x.evidence || []).slice(0, 3) })),
    flows: p.flows.slice().sort((a, b) => b.severity - a.severity).slice(0, 60).map((f) => ({ title: f.title, kind: f.kind, severity: SEV[f.severity], personalData: f.pii, where: where(f.file, f.line), link: link(r, f.file, f.line), code: f.snippet, whoCanRead: f.who, fix: f.fix })),
    personalDataInventory: p.inventory.map((i) => `${i.label}: ${i.files} files`),
    comingInOpenPRs: p.prChanges.map((c) => ({ pr: c.number, title: c.title, url: c.url, author: c.author, items: c.items.map((i) => ({ title: i.title, severity: SEV[i.severity], file: i.file, code: i.snippet })) })),
  };
}

function securityReport(r, minSeverity = 1) {
  const s = r.security;
  if (!s) return { repo: r.repo.fullName, error: 'No security results for this analysis.' };
  return {
    repo: r.repo.fullName, exposureScore: s.score, verdict: s.posture?.verdict, categories: s.categories,
    findings: s.findings.filter((f) => f.severity >= minSeverity).sort((a, b) => b.severity - a.severity).slice(0, 60).map((f) => ({ title: f.title, severity: SEV[f.severity], category: f.category, cwe: f.cwe, mitre: f.attack, where: where(f.file, f.line), link: link(r, f.file, f.line), code: f.snippet, fix: f.fix })),
    knownCVEs: s.vulns.slice(0, 40).map((v) => ({ id: v.aliases?.[0] || v.id, package: `${v.package}@${v.version || v.spec}`, ecosystem: v.ecosystem, severity: v.severityLabel, fixedIn: v.fixed, summary: v.summary, url: v.url })),
    attackSurface: s.surface ? { endpoints: s.surface.total, withoutAuth: s.surface.open, sensitiveWithoutAuth: s.surface.sensitiveOpen, webhooks: s.surface.webhooks } : null,
    threatScenarios: (s.threats?.scenarios || []).slice(0, 5).map((t) => t.title),
  };
}

function prRisks(r) {
  const privacyByPr = new Map(r.privacy.prChanges.map((c) => [c.number, c]));
  return {
    repo: r.repo.fullName, openPRs: r.summary.openPRs, analyzed: r.prs.length,
    note: r.prs.length ? undefined : 'No open PRs were analysed (none open, PRs disabled on the repo, or GitHub could not be reached; see warnings).',
    warnings: r.warnings,
    prs: r.prs.map((p) => ({
      pr: p.number, title: p.title, url: p.url, debtRisk: p.risk, mergeAdvice: p.mergeAdvice, summary: p.summary,
      debtItems: (p.items || []).slice(0, 5).map((i) => i.title),
      privacyChanges: (privacyByPr.get(p.number)?.items || []).map((i) => ({ title: i.title, severity: SEV[i.severity], file: i.file, code: i.snippet })),
    })),
  };
}

/** Local-only check of one file or snippet: no network, nothing leaves this machine. */
function checkCode({ path: file = 'snippet.ts', code = '' }) {
  if (!code.trim()) throw new Error('code is empty');
  if (code.length > 400_000) throw new Error('code is too large (max 400 KB per call)');
  const privacy = scanPrivacy(file, code, {});
  const security = scanText(file, code, { isAi: /openai|anthropic|langchain|@ai-sdk|generativeai/i.test(code) });
  return {
    file, ranLocally: true,
    note: privacy.length || security.length ? undefined : (/\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|java|kt|php|cs|rs|swift)$/i.test(file) ? 'No privacy flows or security findings detected.' : 'No findings. Privacy checks only run on source files: pass a path with a code extension such as .ts or .py.'),
    privacyFlows: privacy.map((f) => ({ title: f.title, severity: SEV[f.severity], line: f.line, code: f.snippet, whoCanRead: f.who, fix: f.fix })),
    securityFindings: security.map((f) => ({ title: f.title, severity: SEV[f.severity], cwe: f.cwe, line: f.line, code: f.snippet, fix: f.fix })),
  };
}

/* ------------------------------------------------------------------ tools */

const REPO = { type: 'string', description: 'GitHub repo as owner/repo or https://github.com/owner/repo' };
const TOOLS = [
  {
    name: 'scan_repo',
    title: 'Scan a GitHub repo',
    description: "Run Narc on a public GitHub repo: privacy grade (A-F), every company that receives the app's user data, the riskiest personal-data flows with links to the exact line, security exposure, known CVEs and tech-debt index. Takes 10-60 s on first call; results are cached for 30 minutes so follow-up tools are instant.",
    inputSchema: { type: 'object', properties: { repo: REPO, refresh: { type: 'boolean', description: 'Ignore the cache and re-analyse' }, max_prs: { type: 'integer', minimum: 1, maximum: 40, description: 'Open PRs to analyse (default 12; each costs a GitHub request)' } }, required: ['repo'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a, ctx) => overview(await getAnalysis(a.repo, { refresh: a.refresh, maxPRs: a.max_prs, onProgress: ctx.progress })),
  },
  {
    name: 'privacy_report',
    title: 'Privacy report',
    description: "Full privacy-debt report for a repo: each data recipient (analytics, AI models, CRMs, email, payments, error tracking) with evidence, each personal-data flow (shared with third parties, put in AI prompts, written to logs, stored in the browser, put in URLs) with file:line, who can read it and how to fix it, the personal-data inventory, and open PRs that add new trackers or flows.",
    inputSchema: { type: 'object', properties: { repo: REPO }, required: ['repo'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a, ctx) => privacyReport(await getAnalysis(a.repo, { onProgress: ctx.progress })),
  },
  {
    name: 'security_report',
    title: 'Security report',
    description: 'Security findings for a repo: static rules (secrets, injection, SSRF, XSS, weak crypto, CI/CD, LLM prompt injection) mapped to CWE and MITRE ATT&CK/ATLAS with file:line links, known CVEs in declared dependencies (OSV.dev), unauthenticated endpoints and threat scenarios.',
    inputSchema: { type: 'object', properties: { repo: REPO, min_severity: { type: 'integer', minimum: 1, maximum: 5, description: 'Only findings at or above this severity (1 info ... 5 critical)' } }, required: ['repo'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a, ctx) => securityReport(await getAnalysis(a.repo, { onProgress: ctx.progress }), a.min_severity || 1),
  },
  {
    name: 'pr_risks',
    title: 'Open PR risks',
    description: "Open pull requests ranked by the debt they would add, each with merge advice and any privacy changes (a new tracker, or new personal data sent to a third party), so you can catch them before they merge.",
    inputSchema: { type: 'object', properties: { repo: REPO }, required: ['repo'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a, ctx) => prRisks(await getAnalysis(a.repo, { onProgress: ctx.progress })),
  },
  {
    name: 'check_code',
    title: 'Check code locally',
    description: 'Check one file or snippet for privacy flows (personal data sent to trackers, AI models, logs, browser storage, URLs) and security issues. Runs entirely on this machine: no network calls, nothing is uploaded. Use it on code you are about to commit.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'Source code to check' }, path: { type: 'string', description: 'File path, used to pick language rules (e.g. src/api/users.ts). Default snippet.ts' } }, required: ['code'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a) => checkCode(a),
  },
  {
    name: 'research_recipient',
    title: 'Research a data recipient',
    description: 'Dossier on a company that receives user data: does it sell data, use it for ads, train AI on it, how long it keeps it, with links to its own policy pages. Uses Tavily/Exa (keys in .env); only the company name and domain are searched.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Company name, e.g. Segment' }, domain: { type: 'string', description: 'Company website, e.g. segment.com' } }, required: ['name'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a) => researchRecipient({ name: String(a.name).slice(0, 60), domain: /^[\w.-]+$/.test(a.domain || '') ? a.domain : undefined, tavilyKey: env.TAVILY_API_KEY, exaKey: env.EXA_API_KEY }),
  },
];

/* ------------------------------------------------------------------ JSON-RPC over stdio */

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
const reply = (id, result) => send({ id, result });
const fail = (id, code, message) => send({ id, error: { code, message } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const isRequest = id !== undefined && id !== null;
  if (!isRequest) return; // notifications (initialized, cancelled, ...) need no answer

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'narc', title: 'Narc: who is watching your users', version: PKG.version },
        instructions: "Narc finds where an app sends its users' data. Start with scan_repo; then privacy_report, security_report or pr_risks reuse the cached analysis. check_code runs fully offline on a snippet. Findings are pattern-based: cite the file:line link and treat them as leads to verify.",
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`);
      const token = params._meta?.progressToken;
      let n = 0;
      const progress = token === undefined ? undefined : (message) => send({ method: 'notifications/progress', params: { progressToken: token, progress: ++n, message } });
      try {
        const out = await tool.run(params.arguments || {}, { progress });
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        // Tool failures go back as results so the model can read them and react (e.g. rate limit -> add a token)
        return reply(id, { isError: true, content: [{ type: 'text', text: `Narc ${tool.name} failed: ${e.message || e}` }] });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    // Each request runs on its own, so a slow scan never blocks ping or check_code
    for (const m of Array.isArray(msg) ? msg : [msg]) handle(m).catch((e) => { console.error(e); if (m?.id != null) fail(m.id, -32603, e.message || String(e)); });
  }
});
process.stdin.on('end', () => process.exit(0));
// A stray rejection must not kill the server mid-session (the web server crashed this way)
process.on('unhandledRejection', (e) => console.error('[narc-mcp] unhandled:', e));
console.error(`[narc-mcp] ready · ${TOOLS.length} tools · GitHub token: ${env.GITHUB_TOKEN ? 'yes' : 'no (60 req/h)'} · Local AI: ${env.NARC_LOCAL_AI === '1' ? 'on' : 'off'}`);

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { analyze, deepDive } from './lib/pipeline.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// Minimal .env loader
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const env = process.env;

/* Every request Narc makes off this machine, logged with what it sent (the "What Narc sent" tab).
   Local calls (Ollama on 127.0.0.1) are recorded too, marked as staying on the laptop. */
const egress = [];
const PURPOSE = [[/api\.github\.com|codeload\.github\.com|github\.com/, 'GitHub', 'Read public repo data (code archive, PRs, CI runs)'], [/api\.tavily\.com/, 'Tavily', 'Web search'], [/api\.exa\.ai/, 'Exa', 'Web search'],
  [/api\.openai\.com/, 'OpenAI', 'AI analysis: code and PR text are in this request'], [/127\.0\.0\.1|localhost/, 'Local AI', 'Stays on this laptop'], [/api\.osv\.dev/, 'OSV.dev', 'Look up package versions for known CVEs'],
  [/githubstatus\.com|status\.npmjs\.org|status\.python\.org/, 'Status pages', 'Check for vendor outages'], [/registry\.npmjs\.org|api\.npmjs\.org|pypi\.org/, 'Package registries', 'Check if a new package is real']];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  try {
    const u = new URL(typeof url === 'string' ? url : url.url);
    if (!(u.port === String(env.PORT || 4317) && /^(127\.0\.0\.1|localhost)$/.test(u.hostname))) {
      const [, who, why] = PURPOSE.find(([re]) => re.test(u.hostname)) || [null, u.hostname, 'Other'];
      const body = typeof init.body === 'string' ? init.body : '';
      let sent = '';
      try { const j = JSON.parse(body || '{}'); sent = j.query || (j.messages ? `${j.messages.length} messages, ${body.length.toLocaleString()} characters` : ''); } catch {}
      egress.push({ ts: Date.now(), host: u.hostname, path: u.pathname.slice(0, 80), method: (init.method || 'GET').toUpperCase(), bytes: body.length, who, why, sent: String(sent).slice(0, 300), local: /^(127\.0\.0\.1|localhost)$/.test(u.hostname) });
      if (egress.length > 3000) egress.splice(0, egress.length - 3000);
    }
  } catch {}
  return realFetch(url, init);
};
const PORT = Number(env.PORT || 4317);
const jobs = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 5e6) { bad(new Error('Body too large')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } }); });

function startJob(input) {
  const id = crypto.randomBytes(6).toString('hex');
  const job = { id, events: [], listeners: new Set(), status: 'running', result: null, private: null, created: Date.now(), egressFrom: egress.length ? egress.at(-1).ts + 1 : Date.now() };
  const emit = (ev) => {
    if (ev.type === 'partial') { job.result = ev.result; job.private = ev.private; ev.result.jobId = id; ev = { type: 'partial', phase: ev.phase, result: ev.result }; job.events = job.events.filter((e) => e.type !== 'partial'); }
    job.events.push(ev); for (const l of job.listeners) l(ev);
  };
  jobs.set(id, job);
  // Local AI: analysis runs on Ollama on this laptop, so code and PR text never leave it.
  const local = input.localAi ?? env.NARC_LOCAL_AI === '1';
  const opts = {
    repoUrl: input.repoUrl,
    openaiKey: local ? 'local' : input.openaiKey || env.OPENAI_API_KEY,
    model: local ? env.LOCAL_MODEL || 'qwen2.5:7b' : input.model || env.OPENAI_MODEL || 'gpt-5-mini',
    fastModel: local ? env.LOCAL_FAST_MODEL || env.LOCAL_MODEL || 'qwen2.5:7b' : input.fastModel || env.OPENAI_FAST_MODEL || '',
    openaiBaseUrl: local ? env.LOCAL_BASE_URL || 'http://127.0.0.1:11434/v1' : input.openaiBaseUrl || env.OPENAI_BASE_URL,
    githubToken: input.githubToken || env.GITHUB_TOKEN,
    tavilyKey: input.tavilyKey || env.TAVILY_API_KEY, exaKey: input.exaKey || env.EXA_API_KEY,
    maxPRs: input.maxPRs || 12,
    includeIssues: input.includeIssues !== false,
    docText: input.docText, docName: input.docName,
    docs: Array.isArray(input.docs) ? input.docs.slice(0, 10).map((d) => ({ name: String(d.name || 'doc'), text: String(d.text || '') })) : [],
    jira: {
      site: input.jira?.site || env.JIRA_SITE, email: input.jira?.email || env.JIRA_EMAIL,
      token: input.jira?.token || env.JIRA_TOKEN, jql: input.jira?.jql || env.JIRA_JQL,
    },
  };
  analyze(opts, emit)
    .then(({ result, private: priv }) => { job.status = 'done'; job.egressTo = Date.now(); job.result = result; job.private = priv; result.jobId = id; result.localAi = local; emit({ type: 'done', result }); })
    .catch((e) => { job.status = 'error'; console.error(e); emit({ type: 'error', message: e.message || String(e) }); });
  return job;
}

// Evict old jobs hourly
setInterval(() => { const cut = Date.now() - 6 * 3600e3; for (const [k, j] of jobs) if (j.created < cut) jobs.delete(k); }, 3600e3).unref();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, localAi: env.NARC_LOCAL_AI === '1', localModel: env.LOCAL_MODEL || 'qwen2.5:7b', openai: !!env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-5-mini', fastModel: env.OPENAI_FAST_MODEL || '', github: !!env.GITHUB_TOKEN, tavily: !!env.TAVILY_API_KEY, exa: !!env.EXA_API_KEY, jira: !!(env.JIRA_SITE && env.JIRA_TOKEN) });

    if (url.pathname === '/api/jobs' && req.method === 'POST') {
      const input = await body(req);
      if (!input.repoUrl) return send(res, 400, { error: 'repoUrl required' });
      const job = startJob(input);
      return send(res, 200, { id: job.id });
    }

    const sm = url.pathname.match(/^\/api\/jobs\/(\w+)\/stream$/);
    if (sm) {
      const job = jobs.get(sm[1]);
      if (!job) return send(res, 404, { error: 'job not found' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const write = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
      job.events.forEach(write);
      if (job.status !== 'running') return res.end();
      const l = (ev) => { write(ev); if (ev.type === 'done' || ev.type === 'error') res.end(); };
      job.listeners.add(l);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { job.listeners.delete(l); clearInterval(ping); });
      return;
    }

    // What Narc sent while analysing this repo (and anything since, e.g. recipient research)
    if (url.pathname === '/api/egress') {
      const job = jobs.get(url.searchParams.get('jobId'));
      const from = job?.egressFrom || 0;
      return send(res, 200, { local: !!job?.result?.localAi, calls: egress.filter((e) => e.ts >= from) });
    }

    // Privacy: who is this data recipient, what do they keep (Tavily + Exa, only the company name is searched)
    if (url.pathname === '/api/privacy/research' && req.method === 'POST') {
      const input = await body(req);
      const { researchRecipient } = await import('./lib/privacy.js');
      try { return send(res, 200, await researchRecipient({ name: String(input.name || '').slice(0, 60), domain: /^[\w.-]+$/.test(input.domain || '') ? input.domain : undefined, tavilyKey: input.tavilyKey || env.TAVILY_API_KEY, exaKey: input.exaKey || env.EXA_API_KEY })); }
      catch (e) { return send(res, 502, { error: e.message }); }
    }

    if (url.pathname === '/api/demo') {
      const { demoResult } = await import('./lib/demo.js');
      return send(res, 200, demoResult());
    }

    // Live investigations of the analyzed repo's CI failures (lib/investigate.js). Cached per analysis; refresh re-reads GitHub.
    if (url.pathname === '/api/investigate' && req.method === 'POST') {
      const input = await body(req);
      const job = jobs.get(input.jobId);
      if (!job?.result) return send(res, 404, { error: 'Analysis not found (server restarted?). Re-run the analysis.' });
      if (job.investigation && !input.refresh) return send(res, 200, job.investigation);
      const token = input.githubToken || env.GITHUB_TOKEN;
      const [{ makeGithub }, { investigateRepo }] = await Promise.all([import('./lib/github.js'), import('./lib/investigate.js')]);
      const r = job.result.repo;
      try {
        job.investigating ||= investigateRepo({ gh: makeGithub(token), repo: { owner: r.owner, name: r.name, defaultBranch: r.defaultBranch, url: r.url }, ctx: job.private?.incidentCtx, token, refresh: !!input.refresh }).finally(() => { job.investigating = null; });
        job.investigation = await job.investigating;
      } catch (e) { return send(res, 502, { error: e.message || String(e), rateLimited: /rate limit/i.test(e.message) }); }
      return send(res, 200, job.investigation);
    }

    // Demo-mode incident investigations, attack chains and blast radius (exported by scripts/export_incidents.py)
    if (url.pathname === '/api/incidents') {
      const file = path.join(ROOT, 'data', 'incidents.json');
      if (!existsSync(file)) return send(res, 404, { error: 'data/incidents.json missing. Run scripts/export_incidents.py' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(await readFile(file));
    }

    if (url.pathname === '/api/deep-dive' && req.method === 'POST') {
      const input = await body(req);
      if (input.jobId === 'demo') { const { demoDeepDive } = await import('./lib/demo.js'); return send(res, 200, demoDeepDive(input.layerId)); }
      const job = jobs.get(input.jobId);
      if (!job?.result) return send(res, 404, { error: 'Analysis not found (server restarted?) — re-run the analysis.' });
      const out = await deepDive({ job, layerId: input.layerId, openaiKey: input.openaiKey || env.OPENAI_API_KEY, model: input.model || env.OPENAI_MODEL, openaiBaseUrl: input.openaiBaseUrl || env.OPENAI_BASE_URL });
      return send(res, 200, out);
    }

    // Static
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\') p = '/index.html';
    const file = path.join(PUBLIC, p);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Narc — tech-debt radar  →  http://localhost:${PORT}`);
  console.log(`  OpenAI: ${env.OPENAI_API_KEY ? `on (${env.OPENAI_MODEL || 'gpt-5-mini'})` : 'off (heuristic mode — add a key in Settings or .env)'} · GitHub token: ${env.GITHUB_TOKEN ? 'yes' : 'no (60 req/h; ~4 per analysis)'}\n`);
});

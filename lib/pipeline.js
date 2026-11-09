import { parseRepoUrl, makeGithub } from './github.js';
import { ingestTarball } from './ingest.js';
import { fileMetrics } from './metrics.js';
import { extractImports, buildResolver, isAiLib } from './deps.js';
import { classifyFile, refineLayersWithLLM, LAYER_BY_ID } from './layers.js';
import { analyzeStructure } from './graph.js';
import { parseDiff, prHeuristics, prRisk, llmPr } from './prs.js';
import { fetchJira, parseDocText, issuesToTasks, heuristicTask, llmBacklog, heuristicOverview, llmExtractDocTasks } from './backlog.js';
import { forecast, repoIndex, DAYS } from './forecast.js';
import { makeLLM, CACHE_DIR } from './llm.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, daysBetween, median, round, truncate, clamp } from './util.js';
import { scanRepo, scanText, attackSurface, parseDependencies, queryOsv, scoreSecurity, mitreRollup, heuristicThreats, posture, aiThreatModel } from './security.js';
import { intelQueries, gatherIntel } from './intel.js';
import { analyzePrivacy, privacyByLayer } from './privacy.js';
import { gatherPeople } from './people.js';
import { loadHistory, snapshotOf, saveSnapshot, diffSnapshots } from './history.js';

export async function analyze(opts, emit) {
  const t0 = Date.now();
  const timings = {};
  const since = (k, t) => { timings[k] = round((Date.now() - t) / 1000, 1); };
  const step = (stage, message, extra = {}) => emit({ type: 'progress', stage, message, ...extra });
  const { owner, repo: name } = parseRepoUrl(opts.repoUrl);
  const gh = makeGithub(opts.githubToken);
  const llm = makeLLM({ apiKey: opts.openaiKey, model: opts.model || 'gpt-5-mini', fastModel: opts.fastModel, baseUrl: opts.openaiBaseUrl, onEvent: (e) => emit({ type: 'agent', ...e, at: Date.now() }) });
  const warnings = [];
  const maxPRs = clamp(+opts.maxPRs || 12, 1, 40);

  step('meta', `Reading ${owner}/${name}`);
  let t = Date.now();
  const meta = await gh.repo(owner, name);
  since('meta', t);
  const historyP = loadHistory(meta.full_name);

  // ---- Phase 1: every network fetch at once (source, PRs + diffs, issues, Jira)
  step('source', `Downloading ${meta.default_branch} source, PRs and backlog in parallel`);
  t = Date.now();
  const srcP = cachedTarball(gh, owner, name, meta).then((tgz) => { step('source', `Archive ${(tgz.length / 1048576).toFixed(1)} MB downloaded — unpacking`); return tgz; });
  const prsP = (async () => {
    const [open, closed] = await Promise.all([gh.pulls(owner, name, 'open', 50).catch((e) => { warnings.push(`PRs: ${e.message}`); return []; }), gh.pulls(owner, name, 'closed', 60).catch(() => [])]);
    const chosen = open.slice(0, maxPRs);
    const diffs = await pool(chosen, 8, async (pr) => parseDiff(await gh.prDiff(owner, name, pr.number)));
    return { open, closed, chosen, diffs };
  })();
  const issuesP = opts.includeIssues !== false ? gh.issues(owner, name, 60).then(issuesToTasks).catch((e) => { warnings.push(`Issues: ${e.message}`); return []; }) : Promise.resolve([]);
  const jiraP = opts.jira?.site && opts.jira?.email && opts.jira?.token ? fetchJira(opts.jira).catch((e) => { warnings.push(e.message); return []; }) : Promise.resolve([]);

  const tgz = await srcP;
  const { files, docs, manifests, sensitive, total, skipped } = ingestTarball(tgz);
  if (!files.length) throw new Error('No analysable source files found in this repository.');
  since('download+unpack', t);

  // ---- Phase 2: static analysis
  step('parse', `Measuring ${files.length.toLocaleString()} files & parsing imports`);
  t = Date.now();
  const resolve = buildResolver(files, manifests);
  for (const f of files) {
    f.metrics = fileMetrics(f);
    const imps = f.isCode ? extractImports(f.path, f.text, f.ext) : [];
    const to = new Set(), ext = new Set();
    for (const imp of imps) { const r = resolve(f.path, imp); (r.to || []).forEach((p) => to.add(p)); if (r.external) ext.add(r.external); }
    f.imports = [...to]; f.externals = [...ext];
    f.layer = classifyFile(f.path, f.externals);
  }
  since('parse', t);

  // Dependency CVE lookup (OSV.dev) starts immediately — it only needs the manifests
  const deps = parseDependencies(manifests);
  emit({ type: 'agent', agent: 'OSV.dev', state: 'start', engine: true, at: Date.now() });
  const osvP = queryOsv(deps).then((v) => { emit({ type: 'agent', agent: 'OSV.dev', state: 'done', engine: true, at: Date.now() }); return v; }).catch((e) => { warnings.push(`OSV lookup failed: ${e.message}`); emit({ type: 'agent', agent: 'OSV.dev', state: 'error', engine: true, error: e.message }); return []; });

  // Docs → work items (AI extraction starts now and runs in the background)
  const userDocs = [...(opts.docs || []), ...(opts.docText?.trim() ? [{ name: opts.docName || 'Pasted doc', text: opts.docText }] : [])].filter((d) => d.text?.trim());
  const isCsv = (x) => /,/.test(x.split('\n')[0]) && /summary|title|issue key/i.test(x.split('\n')[0]);
  const csvTasks = userDocs.filter((d) => isCsv(d.text)).map((d) => ({ name: d.name, tasks: parseDocText(d.text, 'doc', d.name) }));
  const proseDocs = userDocs.filter((d) => !isCsv(d.text));
  const designDocs = docs.filter((d) => !/^readme/i.test(d.path.split('/').pop()) || docs.length < 3).slice(0, 8);
  const repoProse = designDocs.filter((d) => /roadmap|todo|plan|design|rfc|adr|architecture|decision/i.test(d.path)).map((d) => ({ name: d.path, text: d.text }));
  const allProse = [...proseDocs, ...repoProse];
  const bulletDocTasks = () => allProse.flatMap((d) => parseDocText(d.text, 'doc', d.name).slice(0, 30));
  const docAiP = llm && allProse.length ? llmExtractDocTasks(llm, allProse, meta).catch((e) => { warnings.push(`Doc extraction failed, using bullet parsing: ${e.message}`); return null; }) : Promise.resolve(null);
  const allDesignDocs = [...proseDocs.map((d) => ({ path: d.name, text: d.text })), ...designDocs];

  let archNotes = '';
  if (llm) {
    step('layers', `Asking ${llm.model} to sanity-check layer boundaries`);
    t = Date.now();
    try {
      const { overrides, listed, notes } = await refineLayersWithLLM(llm, files, meta);
      archNotes = notes;
      const dirs = [...listed].sort((a, b) => b.length - a.length);
      let moved = 0;
      for (const f of files) {
        if (f.layer === 'tests') continue;
        // Use the most specific listed directory; a parent's override never sweeps a listed child.
        const d = dirs.find((d) => f.path.startsWith(d + '/'));
        const to = d && overrides[d];
        if (to && to !== f.layer && !(f.layer === 'ai' && f.externals.some(isAiLib))) { f.layer = to; moved++; }
      }
      if (moved) step('layers', `Re-assigned ${moved} files across ${Object.keys(overrides).length} directories`);
    } catch (e) { warnings.push(`Layer refinement skipped: ${e.message}`); }
    since('ai-layers', t);
  }

  step('graph', 'Building dependency graph, cycles & layering rules');
  t = Date.now();
  const S = analyzeStructure(files);
  const layerOf = (p) => files[S.fileIndex.get(p)]?.layer;
  const fileLayers = Object.fromEntries(files.map((f) => [f.path, f.layer])); // for incident investigations
  const hotspotSet = new Set(S.hotspots.slice(0, 25).map((h) => h.path));
  const present = new Set(S.layers.map((l) => l.id));
  since('graph', t);

  // ---- Security: static rules, attack surface, dependency CVEs
  step('security', 'Scanning for security debt, attack surface and vulnerable dependencies');
  t = Date.now();
  const findings = scanRepo(files, sensitive).slice(0, 500);
  const endpoints = attackSurface(files);
  const aiLibs = [...new Set(files.filter((f) => f.layer === 'ai').flatMap((f) => f.externals.filter(isAiLib)))];
  const frameworks = [...new Set(deps.filter((d) => !d.dev && /^(express|fastify|koa|next|react|vue|@nestjs\/core|django|flask|fastapi|rails|spring-boot|gin|laravel\/framework|hono)$/i.test(d.name)).map((d) => d.name))];
  const vulnsEarly = await Promise.race([osvP, new Promise((r) => setTimeout(() => r(null), 4000))]);
  let vulns = vulnsEarly || [];
  let intel = [];
  let threatAi = null;
  const secState = () => {
    const sc = scoreSecurity({ layers: S.layers, findings, vulns, endpoints, files });
    const heur = heuristicThreats({ layers: S.layers.map((l) => ({ ...l })), edges: S.edges, findings, vulns, endpoints });
    const scenarios = threatAi?.scenarios?.length ? threatAi.scenarios : heur;
    const pos = posture({ score: sc.score, findings, vulns, endpoints, scenarios });
    if (threatAi?.verdict) Object.assign(pos, { verdict: threatAi.verdict.exploitable || pos.verdict, aiWhy: threatAi.verdict.why, firstProbe: threatAi.verdict.firstProbe });
    const cats = {}; findings.forEach((f) => (cats[f.category] = (cats[f.category] || 0) + 1));
    return {
      score: sc.score, layers: sc.layers, posture: pos, findings, vulns, categories: cats, sensitiveFiles: sensitive,
      deps: { total: deps.length, ecosystems: [...new Set(deps.map((d) => d.ecosystem))], unpinned: deps.filter((d) => d.unpinned && !d.dev).slice(0, 40).map((d) => ({ name: d.name, spec: d.spec, ecosystem: d.ecosystem, manifest: d.manifest })), vulnerablePackages: new Set(vulns.map((v) => v.package)).size, pending: !vulnsEarly && !vulns.length },
      surface: { endpoints, total: endpoints.length, open: endpoints.filter((e) => e.auth === 'none').length, sensitiveOpen: endpoints.filter((e) => e.auth === 'none' && e.sensitive).length, webhooks: endpoints.filter((e) => e.webhook).length },
      threats: { scenarios, source: threatAi?.scenarios?.length ? 'ai' : 'heuristic', heuristic: heur },
      mitre: mitreRollup(findings, vulns, scenarios), intel, prFindings: prSecurity,
    };
  };
  since('security', t);

  // Who touched the riskiest files (hotspots + security findings)
  const traceFiles = [...S.hotspots.slice(0, 6).map((h) => h.path), ...findings.filter((f) => f.severity >= 3 && f.line).slice(0, 8).map((f) => f.file)];
  let people = null;
  const peopleP = gatherPeople(gh, owner, name, { files: traceFiles, budget: opts.githubToken ? 30 : 8, warnings }).then((p) => (people = p)).catch((e) => { warnings.push(`People: ${e.message}`); });

  // ---- PR heuristics
  step('prs', 'Scoring unmerged pull requests');
  t = Date.now();
  const { open, closed, chosen, diffs } = await prsP;
  const merged = closed.filter((p) => p.merged_at);
  const velocity = {
    mergeRate: closed.length ? round(merged.length / closed.length, 2) : 0.6,
    medianDaysToMerge: round(median(merged.map((p) => daysBetween(p.created_at, p.merged_at))) ?? 10, 1),
    closedSample: closed.length, openCount: open.length,
  };
  // Kept server-side for incident investigations (lib/investigate.js): no extra GitHub calls for PR diffs
  const incidentCtx = { fileLayers, prs: chosen.map((pr, k) => ({ number: pr.number, title: pr.title, url: pr.html_url, sha: pr.head?.sha, body: pr.body || '', author: pr.user?.login, association: pr.author_association, created: pr.created_at, diff: diffs[k]?.error ? null : diffs[k] })) };
  const otherPrFiles = new Map(chosen.map((pr, k) => [pr.number, new Set((diffs[k]?.error ? [] : diffs[k]).map((f) => f.path))]));
  // Privacy debt: who receives user data, what they receive, and which open PRs change that (lib/privacy.js)
  const privacy = analyzePrivacy({ files, deps, prs: chosen.map((pr, k) => ({ pr, diff: diffs[k]?.error ? null : diffs[k] })) });
  const privacyLayers = privacyByLayer({ privacy, fileLayers });
  const depLayer = (deps) => (deps.some(isAiLib) ? 'ai' : null);
  const prCtx = [];
  const prSecurity = [];
  for (let k = 0; k < chosen.length; k++) {
    const pr = chosen[k], df = diffs[k];
    if (!df || df.error) { warnings.push(`PR #${pr.number}: diff unavailable (${df?.error || 'unknown'})`); continue; }
    const h = prHeuristics(pr, df, { layerOf, resolve, hotspotSet, otherPrFiles, depLayer });
    for (const f of df) {
      if (!f.added.length) continue;
      const lyr = h.files.find((x) => x.path === f.path)?.layer || 'service';
      for (const sf of scanText(f.path, f.added.join('\n'), { layer: lyr, isAi: lyr === 'ai' })) {
        prSecurity.push({ ...sf, pr: pr.number, prTitle: pr.title, author: pr.user?.login, avatar: pr.user?.avatar_url, url: pr.html_url, line: null });
        h.items.push({ layer: lyr, category: 'Security', severity: sf.severity, title: `${sf.title} introduced`, detail: `${sf.cwe} · ${sf.snippet}`, file: f.path, fix: sf.fix, source: 'heuristic', attack: sf.attack });
      }
    }
    prCtx.push({ pr, df, h });
  }
  const buildPr = ({ pr, h }, ai) => {
    const items = [...(ai?.items || []), ...h.items].sort((a, b) => b.severity - a.severity);
    const heurRisk = prRisk(h.items, h.changed);
    const pMerge = round(clamp((velocity.mergeRate || 0.6) * (pr.draft ? 0.55 : 1) * (h.ageDays > 90 ? 0.5 : h.ageDays > 30 ? 0.8 : 1), 0.05, 0.95), 2);
    return {
      number: pr.number, title: pr.title, url: pr.html_url, author: pr.user?.login, avatar: pr.user?.avatar_url, draft: pr.draft,
      createdAt: pr.created_at, ageDays: h.ageDays, additions: h.files.reduce((a, f) => a + f.additions, 0), deletions: h.files.reduce((a, f) => a + f.deletions, 0),
      fileCount: h.files.length, files: h.files.slice(0, 80), layers: h.layers, primaryLayer: h.primary, conflicts: h.conflicts,
      labels: (pr.labels || []).map((l) => l.name), items, paydown: ai?.paydown || [],
      risk: ai?.risk != null ? Math.round(0.65 * ai.risk + 0.35 * heurRisk) : heurRisk, pMerge,
      summary: ai?.summary || autoPrSummary(pr, h), forecast: ai?.forecast || '', mergeAdvice: ai?.mergeAdvice || (heurRisk > 65 ? 'rework' : heurRisk > 35 ? 'merge-with-fixes' : 'merge'),
      analyzedBy: ai ? 'ai' : 'heuristic', pending: !!llm && !ai,
    };
  };
  let prs = prCtx.map((c) => buildPr(c, null)).sort((a, b) => b.risk - a.risk);

  // ---- Backlog (heuristic first)
  const [issueTasks, jiraTasks] = await Promise.all([issuesP, jiraP]);
  const sources = [];
  if (jiraTasks.length) sources.push(`Jira (${jiraTasks.length})`);
  csvTasks.forEach((c) => sources.push(`${c.name} (${c.tasks.length})`));
  if (issueTasks.length) sources.push(`GitHub Issues (${issueTasks.length})`);
  const baseTasks = [...jiraTasks, ...csvTasks.flatMap((c) => c.tasks)];
  const mkBacklog = (docTasks, analyzed, overview) => {
    const src = [...sources];
    if (allProse.length) src.push(`Design docs: ${allProse.map((d) => d.name.split('/').pop()).join(', ')} (${docTasks.length})`);
    const tasks = analyzed || [...baseTasks, ...docTasks, ...issueTasks].slice(0, 160).map((x) => heuristicTask(x, present));
    tasks.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { tasks, overview: overview || heuristicOverview(tasks, S.layers), sources: src, designDocs: allDesignDocs.map((d) => ({ path: d.path, size: d.text.length })) };
  };
  let backlog = mkBacklog(bulletDocTasks());
  since('heuristics', t);

  const stats = { totalFiles: total, analysedFiles: files.length, skipped, githubCalls: gh.calls };
  const snippets = {};
  const finish = (r) => {
    for (const l of r.layers) snippets[l.id] = l.hotspots.slice(0, 3).map((h) => { const f = files[S.fileIndex.get(h.path)]; return { path: h.path, head: f ? f.text.split('\n').slice(0, 90).join('\n') : '' }; });
    r.stats.timings = { ...timings }; r.stats.seconds = round((Date.now() - t0) / 1000, 1);
    if (llm) r.usage = { ...llm.usage };
    return r;
  };
  const prevSnaps = await historyP;
  const mergedPrs = closed.filter((p) => p.merged_at).slice(0, 40).map((p) => ({ number: p.number, title: p.title, author: p.user?.login, avatar: p.user?.avatar_url, mergedAt: p.merged_at, createdAt: p.created_at, url: p.html_url }));
  const build = (phase) => {
    const r = assemble({ meta, S, prs, backlog, velocity, warnings: [...warnings], archNotes, mode: llm ? 'ai' : 'heuristic', model: llm?.model, phase, stats: { ...stats } });
    r.security = secState();
    r.privacy = privacy;
    for (const l of r.layers) l.privacy = privacyLayers[l.id] || { score: 0, flows: 0, critical: 0, pii: [], recipients: [], prItems: 0, top: [] };
    for (const l of r.layers) l.security = r.security.layers[l.id];
    r.people = people; r.merged = mergedPrs;
    const snap = snapshotOf(r);
    r.history = { snapshots: [{ ...slim(snap), current: true }, ...prevSnaps.slice(0, 12).map(slim)], diff: diffSnapshots(prevSnaps[0], snap) };
    r.engines = { osv: { packages: deps.length, queried: deps.filter((d) => d.version).length }, tavily: !!opts.tavilyKey, exa: !!opts.exaKey, github: { traced: people?.traced || 0 } };
    return finish(r);
  };
  const intelP = (async () => {
    if (!opts.tavilyKey && !opts.exaKey) return [];
    const v = await osvP;
    emit({ type: 'agent', agent: 'Threat intel', state: 'start', engine: true, at: Date.now() });
    const res = await gatherIntel({ tavilyKey: opts.tavilyKey, exaKey: opts.exaKey, queries: intelQueries({ vulns: v, frameworks, aiLibs, repo: meta }), warnings });
    emit({ type: 'agent', agent: 'Threat intel', state: 'done', engine: true, at: Date.now() });
    return res;
  })();

  if (!llm) {
    step('forecast', 'Propagating debt through the dependency graph');
    [vulns, intel] = await Promise.all([osvP, intelP, peopleP]);
    const r = build('final');
    await saveSnapshot(meta.full_name, snapshotOf(r));
    return { result: r, private: { snippets, incidentCtx } };
  }

  // Everything static is ready: let the UI render now.
  await Promise.race([peopleP, new Promise((r) => setTimeout(r, 1500))]);
  emit({ type: 'partial', phase: 'static', result: build('static'), private: { snippets, incidentCtx } });

  // ---- Phase 3: AI work in parallel (PR reviews ∥ doc extraction → backlog mapping)
  t = Date.now();
  let prDone = 0;
  step('ai', `AI review of ${prCtx.length} PRs and ${allProse.length + baseTasks.length + issueTasks.length ? 'the backlog' : 'no backlog'} in parallel`, { done: 0, total: prCtx.length });
  const prAiP = pool(prCtx, 8, async (c) => {
    try { const ai = await llmPr(llm, { repo: meta, layers: S.layers, pr: c.pr, h: c.h, diffFiles: c.df }); return buildPr(c, ai); }
    catch (e) { warnings.push(`PR #${c.pr.number}: AI analysis failed (${e.message})`); return buildPr(c, null); }
    finally { step('ai', `PR #${c.pr.number} reviewed`, { done: ++prDone, total: prCtx.length }); }
  });
  const backlogAiP = (async () => {
    const docTasks = (await docAiP) || bulletDocTasks();
    const tasks = [...baseTasks, ...docTasks, ...issueTasks].slice(0, 160);
    if (!tasks.length) return mkBacklog(docTasks);
    try {
      const r = await llmBacklog(llm, { repo: meta, layers: S.layers, tasks, docs: allDesignDocs, overview: false });
      step('ai', `Mapped ${tasks.length} planned items to layers`);
      const overview = await aiBacklogOverview(llm, { meta, layers: S.layers, tasks: r.tasks, docs: allDesignDocs }).catch((e) => { warnings.push(`Backlog overview failed: ${e.message}`); return null; });
      return mkBacklog(docTasks, r.tasks, overview);
    }
    catch (e) { warnings.push(`Backlog AI failed: ${e.message}`); return mkBacklog(docTasks); }
  })();
  const threatP = (async () => {
    [vulns, intel] = await Promise.all([osvP, intelP]);
    step('ai', `Threat modelling ${findings.length} findings, ${vulns.length} vulnerable deps, ${endpoints.length} endpoints`);
    try { threatAi = await aiThreatModel(llm, { repo: meta, layers: S.layers.map((l) => ({ ...l, dependsOn: S.edges.filter((e) => e.source === l.id).map((e) => ({ layer: e.target })) })), edges: S.edges, findings, vulns, endpoints, sensitive, intel, heuristic: heuristicThreats({ layers: S.layers, edges: S.edges, findings, vulns, endpoints }) }); }
    catch (e) { warnings.push(`Threat model failed: ${e.message}`); }
  })();
  const [prsAi, backlogAi] = await Promise.all([prAiP, backlogAiP, threatP, peopleP]);
  prs = prsAi.filter((p) => p && !p.error).map((p) => ({ ...p, pending: false })).sort((a, b) => b.risk - a.risk);
  backlog = backlogAi;
  since('ai-reviews', t);
  emit({ type: 'partial', phase: 'reviews', result: build('reviews'), private: { snippets, incidentCtx } });

  step('summary', 'Writing executive summary & layer narratives');
  t = Date.now();
  const result = build('final');
  await aiSummary(llm, result);
  since('ai-summary', t);
  await saveSnapshot(meta.full_name, snapshotOf(result));
  return { result: finish(result), private: { snippets, incidentCtx } };
}

const slim = (s) => ({ at: s.at, headSha: s.headSha, mode: s.mode, index: s.index, index90: s.index90, security: s.security, findings: Object.keys(s.findings || {}).length, vulns: (s.vulns || []).length, prs: (s.prs || []).length, endpoints: s.endpoints });

/** Re-use the source archive while the repo has not been pushed to. */
async function cachedTarball(gh, owner, name, meta) {
  const key = `${owner}__${name}__${String(meta.pushed_at || '').replace(/[^\w]/g, '')}.tgz`;
  const p = join(CACHE_DIR, 'src', key);
  try { return await readFile(p); } catch {}
  const buf = await gh.tarball(owner, name, meta.default_branch);
  try { await mkdir(join(CACHE_DIR, 'src'), { recursive: true }); await writeFile(p, buf); } catch {}
  return buf;
}

function autoPrSummary(pr, h) {
  const ls = h.layers.map((l) => LAYER_BY_ID[l]?.name).filter(Boolean);
  return `Touches ${h.files.length} files across ${ls.join(', ') || 'the repo'} (${h.changed} changed lines). ${h.items.length ? `${h.items.length} debt signals detected.` : 'No strong debt signals detected.'}`;
}

/** Combine structure + PRs + backlog into the final client payload. Also used by demo mode. */
export function assemble({ meta, S, prs, backlog, velocity, warnings = [], archNotes = '', mode, model, phase = 'final', stats = {} }) {
  const fc = forecast({ layers: S.layers, edges: S.edges, prs, tasks: backlog.tasks, velocity });
  const layers = S.layers.map((l) => {
    const f = fc[l.id];
    const prItems = prs.flatMap((p) => p.items.filter((i) => i.layer === l.id).map((i) => ({ ...i, pr: p.number, prTitle: p.title })));
    const tasks = backlog.tasks.filter((t) => t.layers.includes(l.id)).map((t) => ({ key: t.key, title: t.title, delta: t.delta, category: t.category, url: t.url }));
    return { ...l, ...f, score: f.series[0].total, score90: f.series.at(-1).total, prItems, prCount: new Set(prItems.map((i) => i.pr)).size, tasks };
  });
  const idx0 = repoIndex(layers, fc, 0), idx90 = repoIndex(layers, fc, DAYS.length - 1);
  const worst = [...layers].filter((l) => !['tests', 'config'].includes(l.id)).sort((a, b) => b.score90 - a.score90)[0];
  const fastest = [...layers].sort((a, b) => b.score90 - b.score - (a.score90 - a.score))[0];
  return {
    repo: { owner: meta.owner?.login, name: meta.name, fullName: meta.full_name, url: meta.html_url, description: meta.description, language: meta.language, stars: meta.stargazers_count, defaultBranch: meta.default_branch, pushedAt: meta.pushed_at },
    mode, model, phase, analyzedAt: new Date().toISOString(), days: DAYS, archNotes,
    summary: {
      index: idx0, index90: idx90, series: DAYS.map((_, k) => repoIndex(layers, fc, k)),
      openPRs: velocity.openCount ?? prs.length, analyzedPRs: prs.length, velocity,
      hotspotCount: S.hotspots.filter((h) => h.score >= 70).length, cycles: S.cycles.length, violations: S.edges.filter((e) => e.violation).length,
      loc: layers.reduce((a, l) => a + l.loc, 0), files: layers.reduce((a, l) => a + l.files, 0),
      headline: worst ? `${worst.name} is on track to reach a debt index of ${worst.score90} in 90 days${fastest && fastest.id !== worst.id ? `; ${fastest.name} is accruing fastest (+${fastest.score90 - fastest.score}).` : '.'}` : '',
      narrative: '', topRisks: [], recommendations: [],
    },
    layers, edges: S.edges, moduleEdges: S.moduleEdges, cycles: S.cycles, hotspots: S.hotspots, prs, backlog, warnings, stats,
  };
}

const SUMMARY_RULES = 'Scores are 0-100 where higher = MORE debt. Bands: 0-29 Healthy, 30-49 Watch, 50-69 At risk, 70-100 Critical; describe a score with its band word (e.g. 16 is Healthy, never "moderate-high"). forecast90d values are predictions for 90 days in the future, not history. Recommend process changes (branching, CI, review rules) only if the PR data shows a process problem; with few or no open PRs focus on code and design. Name concrete files, PR numbers and backlog keys. No generic advice.';

const layerCtx = (r) => r.layers.map((l) => ({ id: l.id, name: l.name, today: l.score, forecast90d: l.score90, static: l.staticScore, drivers: l.staticDrivers.slice(0, 3).map((d) => `${d.label}: ${d.detail}`), dependsOn: l.dependsOn.map((d) => d.layer), dependents: l.dependents.map((d) => d.layer), inherited: l.series[0].inherited, pendingPrDebtItems: l.prItems.length, topPrFindings: l.prItems.slice(0, 3).map((i) => `#${i.pr} ${i.title}`), hotspots: l.hotspots.slice(0, 3).map((h) => h.path) }));

/** Final AI pass, split into two focused calls that run in parallel (was one ~30s call). */
export async function aiSummary(llm, r) {
  const shared = { repo: r.repo, debtIndexToday: r.summary.index, debtIndexForecast90d: r.summary.index90, openPRsAnalyzed: r.prs.length, layers: layerCtx(r) };
  const briefP = llm.json(
    `You are a CTO-level advisor writing a sharp executive briefing on a repository's technical debt. ${SUMMARY_RULES} Be concise: respect the word limits.`,
    JSON.stringify({
      ...shared, security: r.security ? { exposureScore: r.security.score, verdict: r.security.posture?.verdict, top: r.security.findings.slice(0, 6).map((f) => `${f.title} (${f.cwe}) ${f.file}`), vulns: r.security.vulns.slice(0, 4).map((v) => `${v.aliases[0] || v.id} ${v.package}`), scenarios: r.security.threats.scenarios.slice(0, 3).map((x) => x.title) } : null, prVelocity: r.summary.velocity, cycles: r.cycles.slice(0, 3).map((c) => ({ size: c.size, layers: c.layers })),
      topPRs: r.prs.slice(0, 6).map((p) => ({ number: p.number, title: p.title, risk: p.risk, layers: p.layers, top: p.items.slice(0, 3).map((i) => i.title) })),
      backlog: { sources: r.backlog.sources, overview: r.backlog.overview?.summary, topTasks: r.backlog.tasks.slice(0, 12).map((t) => ({ key: t.key, title: t.title, delta: t.delta, layers: t.layers })) },
      outputSchema: { headline: 'one sentence, max 30 words', narrative: 'max 90 words', topRisks: [{ title: 'max 10 words', layer: 'layer id', why: 'max 30 words', action: 'max 20 words', horizon: 'now|30d|90d' }], recommendations: ['max 5 items, each max 25 words, ordered'] },
    }),
    { effort: 'minimal', agent: 'Executive Briefer' }
  );
  const narrP = llm.json(
    `You write a short assessment for each architecture layer of a repository: current state, 90-day trajectory, and the single most useful next action. ${SUMMARY_RULES}`,
    JSON.stringify({ ...shared, outputSchema: { layerNarratives: { '<layer id>': 'one string, max 45 words' } } }),
    { effort: 'minimal', fast: true, agent: 'Layer Narrator' }
  );
  const [brief, narr] = await Promise.allSettled([briefP, narrP]);
  if (brief.status === 'fulfilled') {
    const b = brief.value;
    Object.assign(r.summary, { headline: b.headline || r.summary.headline, narrative: b.narrative || '', topRisks: (b.topRisks || []).slice(0, 5), recommendations: (b.recommendations || []).slice(0, 6) });
  } else r.warnings.push(`Executive briefing failed: ${brief.reason?.message}`);
  if (narr.status === 'fulfilled') { const map = pickNarratives(narr.value); for (const l of r.layers) l.narrative = map[l.id] || ''; }
  else r.warnings.push(`Layer narratives failed: ${narr.reason?.message}`);
}

/** Models don't always follow the requested shape: accept {layerNarratives|layers|…: {id: string|object}} or [{id, …}]. */
function pickNarratives(res) {
  const flat = (v) => {
    if (typeof v === 'string') return v;
    if (!v || typeof v !== 'object') return '';
    const direct = v.narrative || v.assessment || v.summary || v.text;
    if (typeof direct === 'string') return direct;
    // {state, trajectory, action, band: "Healthy"} → keep only sentence-like fields, end each with a period
    return Object.entries(v).filter(([k, x]) => typeof x === 'string' && !/^(id|name|band|status|score)$/i.test(k) && x.trim().split(/\s+/).length >= 4)
      .map(([, x]) => x.trim().replace(/([^.!?])$/, '$1.')).join(' ');
  };
  const src = res.layerNarratives || res.layers || res.narratives || Object.values(res).find((v) => v && typeof v === 'object') || {};
  const out = {};
  if (Array.isArray(src)) for (const it of src) { if (it?.id) out[it.id] = flat(it); }
  else for (const [k, v] of Object.entries(src)) out[k] = flat(v);
  return out;
}

/** Backlog overview — runs as soon as the backlog is mapped, in parallel with PR reviews. */
async function aiBacklogOverview(llm, { meta, layers, tasks, docs }) {
  const o = await llm.json(
    `You are a staff engineer summarising how a backlog/design will change technical debt across architecture layers over the next quarter. Refer to items by key AND short title. ${SUMMARY_RULES}`,
    JSON.stringify({
      repo: { name: meta.full_name, description: meta.description },
      layers: layers.map((l) => ({ id: l.id, name: l.name, debtToday: l.staticScore, topDrivers: l.staticDrivers.slice(0, 2).map((d) => d.label), hotspots: l.hotspots.slice(0, 2).map((h) => h.path) })),
      designDocs: docs.slice(0, 4).map((d) => ({ path: d.path, excerpt: truncate(d.text, 1200) })),
      tasks: tasks.slice(0, 60).map((t) => ({ key: t.key, title: t.title, layers: t.layers, delta: t.delta, category: t.category })),
      outputSchema: { summary: 'max 70 words', themes: [{ name: 'max 6 words', layers: ['ids'], impact: 'accrual|paydown', detail: 'max 20 words' }], forecast: 'max 40 words', missingWork: ['max 4 items, each max 20 words'] },
    }),
    { effort: 'minimal', fast: true, agent: 'Backlog Strategist' }
  );
  return o?.summary ? { summary: o.summary, themes: (o.themes || []).slice(0, 6), forecast: o.forecast || '', missingWork: (o.missingWork || []).slice(0, 5) } : null;
}

export async function deepDive({ job, layerId, openaiKey, model, openaiBaseUrl }) {
  const llm = makeLLM({ apiKey: openaiKey, model: model || 'gpt-5-mini', baseUrl: openaiBaseUrl });
  if (!llm) throw new Error('Deep dive needs an OpenAI API key (Settings → OpenAI).');
  const r = job.result; const l = r.layers.find((x) => x.id === layerId);
  if (!l) throw new Error('Unknown layer');
  const res = await llm.json(
    `You are a principal engineer doing an in-depth technical-debt review of ONE architecture layer, including risk it inherits from the layers it depends on and the risk it pushes onto layers that depend on it. Use the code excerpts as evidence. Be specific: file names, patterns, concrete refactors with effort estimates (S/M/L).`,
    JSON.stringify({
      repo: r.repo, layer: { id: l.id, name: l.name, files: l.files, loc: l.loc, today: l.score, in90d: l.score90, staticDrivers: l.staticDrivers, coverage: l.coverage, externals: l.externals, modules: l.modules.slice(0, 12).map((m) => ({ path: m.path, loc: m.loc, score: m.score })) },
      dependsOn: l.inheritedFrom.map((c) => ({ layer: c.layer, depth: c.depth, via: c.via, inheritedPoints: c.points, theirScore: r.layers.find((x) => x.id === c.layer)?.score })),
      dependents: l.dependents.map((d) => ({ layer: d.layer, weight: d.weight, violation: d.violation })),
      hotspots: l.hotspots.slice(0, 6), codeExcerpts: (job.private?.snippets?.[l.id] || []).map((s) => ({ path: s.path, head: truncate(s.head, 3500) })),
      pendingPrDebt: l.prItems.slice(0, 15).map((i) => ({ pr: i.pr, title: i.title, detail: i.detail, severity: i.severity })),
      backlog: l.tasks.slice(0, 12),
      outputSchema: {
        assessment: '3-4 sentences', interestRate: 'low|medium|high|critical — how fast this layer\'s debt compounds and why',
        rootCauses: ['...'], debtItems: [{ title: '', severity: '1-5', file: '', detail: '', fix: '', effort: 'S|M|L' }],
        dependencyRisk: 'how upstream layers degrade this one and how this one threatens its dependents',
        refactorPlan: [{ step: '', why: '', effort: 'S|M|L', reducesScoreBy: 'estimated points' }],
        forecastNarrative: '90-day forecast if nothing changes vs if the plan is executed',
      },
    })
,
    { agent: 'Deep Diver' }
  );
  return { ...res, model: llm.model, usage: llm.usage };
}

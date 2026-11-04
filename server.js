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
const PORT = Number(env.PORT || 4317);
const jobs = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 5e6) { bad(new Error('Body too large')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } }); });

function startJob(input) {
  const id = crypto.randomBytes(6).toString('hex');
  const job = { id, events: [], listeners: new Set(), status: 'running', result: null, private: null, created: Date.now() };
  const emit = (ev) => {
    if (ev.type === 'partial') { job.result = ev.result; job.private = ev.private; ev.result.jobId = id; ev = { type: 'partial', phase: ev.phase, result: ev.result }; job.events = job.events.filter((e) => e.type !== 'partial'); }
    job.events.push(ev); for (const l of job.listeners) l(ev);
  };
  jobs.set(id, job);
  const opts = {
    repoUrl: input.repoUrl,
    openaiKey: input.openaiKey || env.OPENAI_API_KEY,
    model: input.model || env.OPENAI_MODEL || 'gpt-5-mini',
    fastModel: input.fastModel || env.OPENAI_FAST_MODEL || '',
    openaiBaseUrl: input.openaiBaseUrl || env.OPENAI_BASE_URL,
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
    .then(({ result, private: priv }) => { job.status = 'done'; job.result = result; job.private = priv; result.jobId = id; emit({ type: 'done', result }); })
    .catch((e) => { job.status = 'error'; console.error(e); emit({ type: 'error', message: e.message || String(e) }); });
  return job;
}

// Evict old jobs hourly
setInterval(() => { const cut = Date.now() - 6 * 3600e3; for (const [k, j] of jobs) if (j.created < cut) jobs.delete(k); }, 3600e3).unref();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, openai: !!env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-5-mini', fastModel: env.OPENAI_FAST_MODEL || '', github: !!env.GITHUB_TOKEN, tavily: !!env.TAVILY_API_KEY, exa: !!env.EXA_API_KEY, jira: !!(env.JIRA_SITE && env.JIRA_TOKEN) });

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

    if (url.pathname === '/api/demo') {
      const { demoResult } = await import('./lib/demo.js');
      return send(res, 200, demoResult());
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

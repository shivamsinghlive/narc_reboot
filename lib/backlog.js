import { LAYERS, LAYER_BY_ID } from './layers.js';
import { clamp, truncate, pool } from './util.js';

/* ---------- Sources ---------- */

function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(adfToText).join(node.type === 'paragraph' || node.type === 'listItem' ? '\n' : ' ');
}

export async function fetchJira({ site, email, token, jql }) {
  const base = site.replace(/\/+$/, '');
  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  const fields = ['summary', 'description', 'status', 'issuetype', 'priority', 'labels', 'components', 'created', 'updated', 'duedate'];
  const q = jql || 'statusCategory != Done ORDER BY updated DESC';
  let r = await fetch(`${base}/rest/api/3/search/jql`, { method: 'POST', headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ jql: q, maxResults: 100, fields }) });
  if (r.status === 404 || r.status === 410) r = await fetch(`${base}/rest/api/2/search?maxResults=100&jql=${encodeURIComponent(q)}&fields=${fields.join(',')}`, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Jira ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  return (data.issues || []).map((i) => ({
    key: i.key, title: i.fields.summary, body: truncate(adfToText(i.fields.description), 1200),
    status: i.fields.status?.name, statusCategory: i.fields.status?.statusCategory?.key, type: i.fields.issuetype?.name,
    priority: i.fields.priority?.name, labels: [...(i.fields.labels || []), ...(i.fields.components || []).map((c) => c.name)],
    url: `${base}/browse/${i.key}`, source: 'jira',
  }));
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Accepts a Jira/Linear CSV export, a markdown design doc / PRD, or a plain task list. */
export function parseDocText(text, source = 'doc', label = 'Design doc') {
  const t = (text || '').trim();
  if (!t) return [];
  const first = t.split('\n')[0];
  if (/,/.test(first) && /summary|title|issue key/i.test(first)) {
    const rows = parseCsv(t); const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const ci = { key: col('issue key', 'key', 'id'), title: col('summary', 'title', 'name'), body: col('description', 'body'), status: col('status', 'state'), type: col('issue type', 'type'), labels: col('labels', 'label', 'components') };
    return rows.slice(1, 201).map((r, i) => ({ key: r[ci.key] || `ROW-${i + 1}`, title: r[ci.title] || '', body: truncate(r[ci.body] || '', 1000), status: r[ci.status] || 'To Do', type: r[ci.type] || 'Task', labels: (r[ci.labels] || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean), source })).filter((x) => x.title);
  }
  const tasks = []; let section = '';
  const lines = t.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = l.match(/^#{1,4}\s+(.+)/);
    if (h) { section = h[1].trim(); continue; }
    const b = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.{8,})$/);
    if (b) {
      if (b[1] && b[1].toLowerCase() === 'x') continue; // done checklist item
      const ctx = [];
      for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]) && ctx.length < 4; j++) ctx.push(lines[j].trim());
      tasks.push({ key: `${label.slice(0, 3).toUpperCase()}-${tasks.length + 1}`, title: b[2].replace(/\*\*/g, '').trim(), body: [section && `Section: ${section}`, ...ctx].filter(Boolean).join('\n'), status: 'Planned', type: 'Doc item', labels: [], source, doc: label });
    }
    if (tasks.length >= 150) break;
  }
  if (!tasks.length) {
    // No bullets: treat paragraphs under headings as work items
    const parts = t.split(/\n(?=#{1,4}\s)/);
    parts.forEach((p, i) => { const title = p.match(/^#{1,4}\s+(.+)/)?.[1] || p.split('\n')[0]; tasks.push({ key: `DOC-${i + 1}`, title: truncate(title, 120), body: truncate(p, 900), status: 'Planned', type: 'Doc section', labels: [], source, doc: label }); });
  }
  return tasks.slice(0, 150);
}

export const issuesToTasks = (issues) => issues.map((i) => ({ key: `#${i.number}`, title: i.title, body: truncate(i.body || '', 1000), status: i.assignee ? 'In Progress' : 'Open', type: (i.labels || []).find((l) => /bug|feature|enhancement|chore|refactor|debt/i.test(l.name))?.name || 'Issue', labels: (i.labels || []).map((l) => l.name), url: i.html_url, createdAt: i.created_at, source: 'github' }));

/* ---------- Heuristic analysis ---------- */

const LAYER_WORDS = {
  ui: /\b(ui|ux|frontend|front-end|page|screen|button|css|component|design system|layout|modal|mobile|react|vue|responsive|dashboard|form|theme|dark mode|accessibility|a11y|onboarding flow)\b/i,
  api: /\b(api|endpoint|route|rest|graphql|webhook|grpc|rate limit|pagination|auth(entication|orization)?|login|sso|cli|sdk surface|versioning)\b/i,
  ai: /\b(ai|ml|llm|model|prompt|embedding|rag|gpt|openai|anthropic|claude|agent|classifier|recommend\w*|vector|inference|fine-?tun\w*|chatbot|copilot|summariz\w*|hallucinat\w*|eval\w*)\b/i,
  service: /\b(logic|workflow|billing|payment|checkout|order|notification|business rule|job|queue|worker|scheduler|process\w*|domain|pricing|subscription|invoice|email)\b/i,
  integrations: /\b(integrat\w*|third-?party|stripe|slack|salesforce|hubspot|twilio|sendgrid|zapier|sync with|oauth provider|connector|github app|jira)\b/i,
  data: /\b(database|db|schema|migration|table|query|index(es|ing)?|sql|postgres|mysql|mongo|cache|redis|data model|etl|backfill|warehouse|orm|column)\b/i,
  shared: /\b(util\w*|shared|common|helper|library|sdk)\b/i,
  infra: /\b(deploy\w*|ci|cd|pipeline|docker|kubernetes|k8s|terraform|aws|gcp|azure|monitor\w*|logging|alert\w*|scal\w*|infra\w*|observability|latency|uptime|cost)\b/i,
  config: /\b(config\w*|env(ironment)? var\w*|feature flag|build|webpack|vite|bundle|settings)\b/i,
  tests: /\b(test\w*|coverage|e2e|qa|flaky|regression)\b/i,
};
const ACCRUE = [
  [/\b(quick|hack|hacky|temporary|temp fix|workaround|band-?aid|for now|stopgap)\b/i, 10, 'explicitly temporary'],
  [/\b(poc|proof of concept|prototype|spike|mvp|experiment)\b/i, 8, 'prototype-quality code tends to ship'],
  [/\b(asap|urgent|hotfix|deadline|blocker|critical|p0|demo)\b/i, 7, 'deadline pressure'],
  [/\b(hard-?cod\w*|copy|duplicate|bypass|skip (the )?tests?|manual(ly)?|disable)\b/i, 8, 'shortcut language'],
  [/\b(migrat\w*|rewrite|replace|v2|switch to|move to)\b/i, 6, 'migrations leave dual paths until finished'],
  [/\b(new|add|support|integrate|implement|build|launch|introduce)\b/i, 3, 'net-new surface area'],
];
const PAYDOWN = [
  [/\b(refactor\w*|clean ?up|tech(nical)? debt|simplif\w*|consolidat\w*|extract|decouple|modulari[sz]\w*)\b/i, -12, 'refactor / paydown'],
  [/\b(remove|delete|deprecat\w*|drop|sunset)\b/i, -6, 'removes code'],
  [/\b(upgrade|bump|update dependenc\w*)\b/i, -5, 'dependency hygiene'],
  [/\b(add tests?|test coverage|increase coverage|type-?safe|typing)\b/i, -8, 'improves safety net'],
];

export function heuristicTask(task, present) {
  const text = `${task.title}\n${task.body || ''}\n${(task.labels || []).join(' ')} ${task.type || ''}`;
  let layers = Object.entries(LAYER_WORDS).filter(([id, re]) => present.has(id) && re.test(text)).map(([id]) => id);
  if (!layers.length) layers = [present.has('service') ? 'service' : [...present][0]];
  layers = layers.slice(0, 3);
  let delta = 0; const why = [];
  for (const [re, w, label] of [...ACCRUE, ...PAYDOWN]) if (re.test(text)) { delta += w; why.push(label); }
  if (/bug/i.test(task.type || '')) { delta += 2; why.push('bug fixes under pressure'); }
  if (/debt|refactor|chore/i.test((task.labels || []).join(' '))) { delta -= 6; why.push('labelled as debt work'); }
  if (layers.length >= 3) { delta += 4; why.push('spans multiple layers'); }
  delta = clamp(delta, -25, 25);
  const risk = clamp(30 + delta * 2.2 + (layers.includes('ai') ? 8 : 0));
  return {
    ...task, layers, delta, risk: Math.round(risk),
    category: delta < 0 ? 'Paydown' : delta >= 12 ? 'High accrual' : delta >= 5 ? 'Accrual' : 'Neutral',
    rationale: why.length ? why.slice(0, 3).join('; ') : 'no strong debt signals in the description',
    mitigation: delta < 0 ? 'Prioritise — this reduces interest on existing debt.' : delta >= 10 ? 'Define acceptance criteria incl. tests and a cleanup follow-up ticket.' : '',
    source2: 'heuristic',
  };
}

/* ---------- LLM analysis ---------- */

/** Design docs are prose, not task lists: ask the model for the work they imply (planned, deferred, open decisions, known limits). */
export async function llmExtractDocTasks(llm, docs, repo) {
  let budget = 36000;
  const payload = [];
  for (const d of docs) { if (budget <= 0) break; const t = truncate(d.text, Math.min(budget, 16000)); budget -= t.length; payload.push({ name: d.name, text: t }); }
  const res = await llm.json(
    `You read software design documents and extract the WORK they imply for the codebase: planned features, deferred/"not yet" items, open decisions, known limitations, explicit shortcuts or temporary choices, and stated risks. Ignore pure explanation of what already exists unless it states a limitation. Each item must be something that will become (or should become) a code change. Quote the doc's own wording in "evidence".`,
    JSON.stringify({ repo: { name: repo.full_name, description: repo.description }, documents: payload,
      outputSchema: { items: [{ title: 'imperative, <90 chars', body: '1-2 sentences of context', kind: 'planned|deferred|decision|limitation|shortcut|risk', doc: 'document name', evidence: 'short quote' }] } }),
    { effort: 'minimal', fast: true, agent: 'Doc Reader' }
  );
  const items = res.items || res.workItems || res.tasks || Object.values(res).find(Array.isArray) || [];
  const pick = (it) => it.title || it.name || it.item || it.task || it.summary || it.description || String(it.body || it.evidence || '').split(/[.\n]/)[0];
  return items.filter((it) => it && typeof it === 'object').slice(0, 40).map((it, i) => ({
    key: `DOC-${i + 1}`, title: truncate(pick(it) || `Design item ${i + 1}`, 120), body: [it.body, it.evidence && `Doc says: "${truncate(it.evidence, 200)}"`].filter(Boolean).join('\n'),
    status: 'Planned', type: it.kind || 'Doc item', labels: [it.kind].filter(Boolean), source: 'doc', doc: it.doc || docs[0]?.name,
  }));
}

export async function llmBacklog(llm, { repo, layers, tasks, docs, overview: wantOverview = true }) {
  const present = new Set(layers.map((l) => l.id));
  const layerCtx = layers.map((l) => ({ id: l.id, name: l.name, debtScoreToday: l.staticScore, topHotspots: l.hotspots.slice(0, 3).map((h) => h.path), topDrivers: l.staticDrivers.slice(0, 2).map((d) => d.label) }));
  const chunks = []; for (let i = 0; i < tasks.length; i += 35) chunks.push(tasks.slice(i, i + 35));
  const results = await pool(chunks, 4, (chunk) => llm.json(
    `You are a staff engineer reading a product backlog / design document and forecasting the technical debt each planned task will create or pay down in a specific codebase.
Map every task to the architecture layers it will touch (ids only). delta is REQUIRED and must be a non-zero integer for any task that changes code: the expected change in the affected layers' debt index, positive = accrual, negative = paydown, range -30..30 (0 only for pure policy/no-code items). Ground your reasoning in the layer context (existing hotspots and drivers). Be terse and specific.`,
    JSON.stringify({
      repo: { name: repo.full_name, description: repo.description },
      layers: layerCtx,
      tasks: chunk.map((t) => ({ key: t.key, title: t.title, body: truncate(t.body, 500), type: t.type, status: t.status, labels: t.labels })),
      outputSchema: { tasks: [{ key: '', layers: ['layer ids'], delta: 'integer -30..30, e.g. 8 or -6', risk: '0-100', category: 'High accrual|Accrual|Neutral|Paydown', rationale: 'one sentence', mitigation: 'one sentence' }] },
    }),
    { effort: 'minimal', fast: true, agent: 'Backlog Analyst' }
  ));
  const byKey = new Map();
  results.forEach((r) => (r?.tasks || []).forEach((t) => byKey.set(String(t.key), t)));
  const analyzed = tasks.map((t) => {
    const h = heuristicTask(t, present);
    const a = byKey.get(String(t.key));
    if (!a) return h;
    const ls = (a.layers || []).filter((l) => present.has(l));
    const raw = [a.delta, a.debtDelta, a.expectedDelta, a.change, a.impact].map((v) => (typeof v === 'string' ? parseFloat(v.replace(/[^\d.+-]/g, '')) : +v)).find((v) => Number.isFinite(v) && v !== 0);
    const cat = String(a.category || '');
    const delta = Number.isFinite(raw) ? raw : /paydown/i.test(cat) ? -Math.max(4, Math.abs(h.delta)) : /high/i.test(cat) ? Math.max(12, h.delta) : /accrual/i.test(cat) ? Math.max(5, h.delta) : 0;
    return { ...h, layers: ls.length ? ls.slice(0, 4) : h.layers, delta: Math.round(clamp(delta, -30, 30)), risk: clamp(+a.risk || h.risk), category: a.category || h.category, rationale: a.rationale || h.rationale, mitigation: a.mitigation || h.mitigation, source2: 'ai' };
  });
  let overview = null;
  if (wantOverview) try {
    overview = await llm.json(
      'You are a staff engineer summarising how a backlog/design will change technical debt across architecture layers over the next quarter. Refer to items by key AND short title. Only suggest process work (CI, branching) when the data shows a process problem. Be specific and decisive.',
      JSON.stringify({
        layers: layerCtx,
        designDocs: docs.slice(0, 4).map((d) => ({ path: d.path, excerpt: truncate(d.text, 1800) })),
        tasks: analyzed.map((t) => ({ key: t.key, title: t.title, layers: t.layers, delta: t.delta, category: t.category })),
        outputSchema: { summary: '3 sentences', themes: [{ name: '', layers: ['ids'], impact: 'accrual|paydown', detail: 'one sentence' }], forecast: '2 sentences on the 90-day trajectory', missingWork: ['debt-reducing work the backlog should contain but does not'] },
      })
    );
  } catch (e) { overview = { summary: '', error: e.message }; }
  return { tasks: analyzed, overview };
}

export function heuristicOverview(tasks, layers) {
  const by = {};
  tasks.forEach((t) => t.layers.forEach((l) => { by[l] ||= { accrual: 0, paydown: 0, n: 0 }; by[l].n++; if (t.delta > 0) by[l].accrual += t.delta; else by[l].paydown -= t.delta; }));
  const ranked = Object.entries(by).sort((a, b) => b[1].accrual - b[1].paydown - (a[1].accrual - a[1].paydown));
  const worst = ranked[0];
  const pay = tasks.filter((t) => t.delta < 0).length;
  return {
    summary: `${tasks.length} planned items analysed. ${worst ? `${LAYER_BY_ID[worst[0]].name} absorbs the most new work (${worst[1].n} items, net +${Math.round(worst[1].accrual - worst[1].paydown)} debt points).` : ''} ${pay} item${pay === 1 ? '' : 's'} pay${pay === 1 ? 's' : ''} down debt.`,
    themes: ranked.slice(0, 4).map(([l, v]) => ({ name: `${LAYER_BY_ID[l].name} workload`, layers: [l], impact: v.accrual >= v.paydown ? 'accrual' : 'paydown', detail: `${v.n} items · +${Math.round(v.accrual)} / −${Math.round(v.paydown)}` })),
    forecast: '',
    missingWork: layers.filter((l) => l.staticScore > 50 && !(by[l.id]?.paydown > 0)).map((l) => `No paydown planned for ${l.name} (debt index ${l.staticScore}).`),
  };
}

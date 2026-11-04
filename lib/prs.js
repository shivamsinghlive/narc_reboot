import { extractImports } from './deps.js';
import { classifyFile, LAYER_BY_ID, DIRECTED, LAYERS } from './layers.js';
import { daysBetween, clamp, sat, truncate, round } from './util.js';

export function parseDiff(text) {
  const files = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      cur = { path: m ? m[2] : '?', status: 'modified', added: [], removed: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('new file mode')) cur.status = 'added';
    else if (line.startsWith('deleted file mode')) cur.status = 'deleted';
    else if (line.startsWith('rename from')) cur.status = 'renamed';
    else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('Binary files')) continue;
    else if (line.startsWith('+')) cur.added.push(line.slice(1));
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  return files;
}

const isTest = (p) => classifyFile(p) === 'tests';
const isDocLike = (p) => /\.(md|mdx|rst|txt|png|jpg|jpeg|gif|svg|lock)$/i.test(p) || /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|poetry\.lock|Cargo\.lock)$/.test(p);
const MANIFEST = /(^|\/)(package\.json|requirements[\w.-]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json)$/;
const DEBUG_RE = /\b(console\.(log|debug)|debugger;|print\(|println!\(|fmt\.Print(ln|f)?\(|System\.out\.print|var_dump\(|pp\s)/;
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/;
const SUPPRESS_RE = /(eslint-disable|@ts-ignore|@ts-expect-error|#\s*type:\s*ignore|#\s*noqa|@SuppressWarnings|\/\/\s*nolint|NOSONAR)/;
const SECRET_RE = /(api[_-]?key|secret|passw(or)?d|token|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{12,}['"]/i;
const PROMPT_RE = /(you are an? |as an ai|system prompt|respond (only )?(in|with) json|answer the following|### instruction)/i;
const MODEL_RE = /['"](gpt-[\w.-]+|o\d-[\w-]+|claude-[\w.-]+|gemini-[\w.-]+|text-embedding-[\w-]+|llama-?\d[\w.-]*)['"]/;

/** Deterministic debt signals for one PR. ctx: {layerOf(path), resolve, hotspotSet, otherPrFiles: Map<num, Set>} */
export function prHeuristics(pr, diffFiles, ctx) {
  const items = [];
  const add = (layer, category, severity, title, detail, file = null, fix = '') => items.push({ layer, category, severity, title, detail, file, fix, source: 'heuristic' });

  const fileInfo = diffFiles.map((f) => {
    const layer = ctx.layerOf(f.path) || classifyFile(f.path, extractImports(f.path, f.added.join('\n')).filter((i) => !i.spec.startsWith('.')).map((i) => i.spec.split('/')[0]));
    return { ...f, layer, test: isTest(f.path), doc: isDocLike(f.path) };
  });
  const src = fileInfo.filter((f) => !f.test && !f.doc);
  const changed = fileInfo.reduce((a, f) => a + f.added.length + f.removed.length, 0);
  const srcAdded = src.reduce((a, f) => a + f.added.length, 0);
  const layerLines = {};
  src.forEach((f) => (layerLines[f.layer] = (layerLines[f.layer] || 0) + f.added.length + f.removed.length));
  const layers = Object.entries(layerLines).sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const primary = layers[0] || fileInfo[0]?.layer || 'service';

  if (changed > 800) add(primary, 'Process', changed > 2000 ? 4 : 3, `Oversized change (${changed.toLocaleString()} lines)`, 'Reviews of very large diffs miss design problems; defects ship as debt.', null, 'Split into stacked PRs by layer or feature flag.');
  const coreLayers = layers.filter((l) => DIRECTED.has(l));
  if (coreLayers.length >= 4) add(primary, 'Architecture', 3, `Cross-cutting change across ${coreLayers.length} layers`, `Touches ${coreLayers.map((l) => LAYER_BY_ID[l].name).join(', ')} — couples release of unrelated layers.`, null, 'Introduce the change behind an interface in the lowest layer first.');

  const testsTouched = fileInfo.some((f) => f.test && f.added.length > 0);
  if (srcAdded > 40 && !testsTouched) {
    for (const l of layers.filter((l) => !['config', 'infra', 'tests'].includes(l)).slice(0, 3)) add(l, 'Testing', srcAdded > 300 ? 4 : 3, 'New code without tests', `${layerLines[l]} lines changed in ${LAYER_BY_ID[l].name} with no test changes in the PR.`, null, 'Add unit tests covering the new branches before merge.');
  }
  const testRemoved = fileInfo.filter((f) => f.test).reduce((a, f) => a + f.removed.length - f.added.length, 0);
  if (fileInfo.some((f) => f.test && f.status === 'deleted') || testRemoved > 30) add(primary, 'Testing', 4, 'Tests deleted or shrunk', `Net ${Math.max(testRemoved, 0)} test lines removed.`, fileInfo.find((f) => f.test && f.status === 'deleted')?.path, 'Confirm coverage is moved, not lost.');

  for (const f of src) {
    const todo = f.added.filter((l) => TODO_RE.test(l));
    if (todo.length) add(f.layer, 'Code quality', 2, `Adds ${todo.length} TODO/FIXME`, truncate(todo[0].trim(), 140), f.path, 'Track as a ticket or resolve before merge.');
    const sup = f.added.filter((l) => SUPPRESS_RE.test(l));
    if (sup.length) add(f.layer, 'Code quality', 2, `Adds ${sup.length} lint/type suppression${sup.length > 1 ? 's' : ''}`, truncate(sup[0].trim(), 140), f.path, 'Fix the underlying type/lint issue.');
    const anys = f.added.join('\n').match(/:\s*any\b|\bas any\b/g)?.length || 0;
    if (anys >= 3) add(f.layer, 'Code quality', 2, `Introduces ${anys} \`any\` types`, 'Type-safety erosion makes future refactors riskier.', f.path, 'Model the shape with an interface or zod schema.');
    const dbg = f.added.filter((l) => DEBUG_RE.test(l) && !/logger|log\./i.test(l));
    if (dbg.length >= 2) add(f.layer, 'Code quality', 1, `Leaves ${dbg.length} debug prints`, truncate(dbg[0].trim(), 120), f.path, 'Use the structured logger or remove.');
    const secret = f.added.find((l) => SECRET_RE.test(l));
    if (secret) add(f.layer, 'Security', 5, 'Possible hard-coded secret', truncate(secret.trim().replace(/(['"])[^'"]{6}([^'"]*)\1/, '$1******$2$1'), 120), f.path, 'Move to a secret manager / env var and rotate.');
    if (f.status === 'added' && f.added.length > 450) add(f.layer, 'Architecture', 2, `New ${f.added.length}-line file`, 'A god-file is forming on day one.', f.path, 'Split by responsibility.');
    if (ctx.hotspotSet.has(f.path) && f.added.length > 15) add(f.layer, 'Code quality', 2, 'Grows an existing hotspot', `${f.path.split('/').pop()} is already one of the riskiest files in the repo; +${f.added.length} lines.`, f.path, 'Extract the new logic into a separate unit.');
    if (f.layer === 'ai') {
      const prompt = f.added.find((l) => PROMPT_RE.test(l));
      if (prompt) add('ai', 'AI/Prompt', 2, 'Inline prompt without versioning', truncate(prompt.trim(), 120), f.path, 'Move prompts to versioned templates with eval fixtures.');
      const model = f.added.join('\n').match(MODEL_RE);
      if (model) add('ai', 'AI/Prompt', 2, `Hard-coded model id ${model[1]}`, 'Model upgrades/deprecations will require code changes everywhere it is pinned.', f.path, 'Read model ids from config with a fallback chain.');
    }
    // Layering violations introduced by new imports
    if (DIRECTED.has(f.layer) && ctx.resolve) {
      const imps = extractImports(f.path, f.added.join('\n'));
      const bad = new Set();
      for (const imp of imps) {
        const r = ctx.resolve(f.path, imp);
        for (const t of r.to || []) { const tl = ctx.layerOf(t); if (tl && DIRECTED.has(tl) && LAYER_BY_ID[tl].tier < LAYER_BY_ID[f.layer].tier) bad.add(tl); }
      }
      for (const tl of bad) add(f.layer, 'Architecture', 3, `New upward dependency → ${LAYER_BY_ID[tl].name}`, `${f.path.split('/').pop()} (${LAYER_BY_ID[f.layer].name}) now imports from ${LAYER_BY_ID[tl].name}.`, f.path, 'Invert the dependency (interface/port) or move the shared code down.');
    }
  }

  // New dependencies
  const deps = [];
  for (const f of fileInfo.filter((f) => MANIFEST.test(f.path))) {
    for (const l of f.added) {
      let m;
      if (f.path.endsWith('package.json') && (m = l.match(/^\s*"(@?[\w./-]+)"\s*:\s*"[\^~><=*\d]/))) { if (!f.removed.some((r) => r.includes(`"${m[1]}"`))) deps.push(m[1]); }
      else if (/requirements/.test(f.path) && (m = l.match(/^\s*([A-Za-z][\w.-]+)/))) deps.push(m[1]);
      else if (f.path.endsWith('go.mod') && (m = l.match(/^\s*(?:require\s+)?([\w.-]+\.[\w.]+\/[\w./-]+)\s+v/))) deps.push(m[1]);
      else if (f.path.endsWith('pyproject.toml') && (m = l.match(/^\s*"?([A-Za-z][\w.-]+)\s*[><=~^]/))) deps.push(m[1]);
    }
  }
  if (deps.length) add(ctx.depLayer?.(deps) || primary, 'Dependency', deps.length > 3 ? 3 : 2, `Adds ${deps.length} new dependenc${deps.length > 1 ? 'ies' : 'y'}`, deps.slice(0, 6).join(', '), null, 'Check license, maintenance and whether an existing dep covers it.');

  // Copy-paste across files in the PR (4-line windows)
  const windows = new Map();
  for (const f of src) {
    const lines = f.added.map((l) => l.trim()).filter((l) => l.length > 12);
    for (let i = 0; i + 4 <= lines.length; i++) {
      const k = lines.slice(i, i + 4).join('\n');
      const s = windows.get(k) || new Set(); s.add(f.path); windows.set(k, s);
    }
  }
  const dup = [...windows.values()].filter((s) => s.size > 1);
  if (dup.length >= 2) { const fs = [...dup[0]]; add(ctx.layerOf(fs[0]) || primary, 'Code quality', 2, 'Duplicated logic across files', `${dup.length} repeated blocks, e.g. in ${fs.slice(0, 2).map((p) => p.split('/').pop()).join(' and ')}.`, fs[0], 'Extract a shared helper.'); }

  // Process: staleness and conflicts
  const age = daysBetween(pr.created_at);
  if (age > 45) add(primary, 'Process', age > 120 ? 3 : 2, `Stale for ${Math.round(age)} days`, 'Long-lived branches accumulate rebase debt and drift from main.', null, 'Merge, split, or close.');
  const mine = new Set(fileInfo.map((f) => f.path));
  const conflicts = [];
  for (const [num, set] of ctx.otherPrFiles) {
    if (num === pr.number) continue;
    const overlap = [...set].filter((p) => mine.has(p) && !isDocLike(p));
    if (overlap.length) conflicts.push({ number: num, files: overlap.slice(0, 5) });
  }
  if (conflicts.length) add(primary, 'Process', conflicts.length > 2 ? 3 : 2, `Overlaps ${conflicts.length} other open PR${conflicts.length > 1 ? 's' : ''}`, conflicts.map((c) => `#${c.number}: ${c.files[0]}`).slice(0, 3).join(' · '), null, 'Sequence these merges; whoever lands second pays the conflict.');

  return {
    files: fileInfo.map((f) => ({ path: f.path, layer: f.layer, status: f.status, additions: f.added.length, deletions: f.removed.length, test: f.test })),
    layers, primary, changed, conflicts, items: aggregate(items), ageDays: round(age, 0),
  };
}

/** Collapse repeated per-file signals ("Adds 2 TODO/FIXME" in 30 files) into one item per layer, keep the strongest 14. */
function aggregate(items) {
  const groups = new Map();
  for (const i of items) {
    const key = `${i.layer}|${i.category}|${i.title.replace(/\d[\d,]*/g, '#').replace(/`[^`]*`/g, '')}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { ...i, n: 1, files: i.file ? [i.file] : [] });
    else { g.n++; if (i.file && g.files.length < 6) g.files.push(i.file); g.severity = Math.max(g.severity, i.severity); }
  }
  return [...groups.values()].map(({ n, files, ...g }) => (n > 1 ? { ...g, title: `${g.title} — in ${n} files`, severity: Math.min(5, g.severity + (n >= 6 ? 1 : 0)), detail: `${g.detail}${files.length > 1 ? ` · also ${files.slice(1, 4).map((f) => f.split('/').pop()).join(', ')}` : ''}` } : g))
    .sort((a, b) => b.severity - a.severity).slice(0, 14);
}

export function prRisk(items, changed) {
  const raw = items.reduce((a, i) => a + (i.severity || 2) ** 1.5 * 3, 0);
  return round(clamp(sat(raw, 85, 45) + Math.min(15, changed / 200)), 0);
}

export function diffForPrompt(diffFiles, limit = 14000) {
  const prio = [...diffFiles].sort((a, b) => (isDocLike(a.path) - isDocLike(b.path)) || (isTest(a.path) - isTest(b.path)) || (b.added.length - a.added.length));
  let out = '';
  for (const f of prio) {
    if (isDocLike(f.path)) continue;
    const chunk = `\n### ${f.path} (${f.status}, +${f.added.length}/-${f.removed.length})\n` + f.added.slice(0, 160).map((l) => '+' + l).join('\n') + (f.removed.length ? '\n' + f.removed.slice(0, 30).map((l) => '-' + l).join('\n') : '');
    if (out.length + chunk.length > limit) { out += chunk.slice(0, Math.max(0, limit - out.length)) + '\n…(truncated)'; break; }
    out += chunk;
  }
  return out;
}

const CATEGORIES = ['Architecture', 'Code quality', 'Testing', 'Dependency', 'Security', 'Performance', 'AI/Prompt', 'Documentation', 'Process'];

export async function llmPr(llm, { repo, layers, pr, h, diffFiles }) {
  const res = await llm.json(
    `You are a principal engineer forecasting the technical debt an UNMERGED pull request would introduce into a codebase, attributed to architecture layers.
Rules: be concrete and cite files/patterns visible in the diff; do not invent code you cannot see; prefer few high-signal items over many weak ones; include paydown when the PR removes debt; "layer" must be one of the provided layer ids.`,
    JSON.stringify({
      repo: { name: repo.full_name, description: repo.description, language: repo.language },
      layers: layers.map((l) => ({ id: l.id, name: l.name, debtScoreToday: l.staticScore })),
      pr: { number: pr.number, title: pr.title, body: truncate(pr.body || '', 1500), author: pr.user?.login, draft: pr.draft, ageDays: h.ageDays, labels: (pr.labels || []).map((l) => l.name), files: h.files.slice(0, 60) },
      heuristicSignals: h.items.map((i) => `[${i.layer}] ${i.title}: ${i.detail}`),
      diff: diffForPrompt(diffFiles),
      outputSchema: {
        summary: 'two sentences: what the PR does and its net debt effect',
        risk: '0-100 debt risk if merged as-is',
        debtItems: [{ layer: 'layer id', category: CATEGORIES.join('|'), severity: '1-5', title: 'short', detail: 'specific evidence', file: 'path or null', fix: 'concrete remediation', compounding: 'how this debt grows over time if left' }],
        paydown: [{ layer: 'layer id', title: 'debt this PR removes', detail: '' }],
        forecast: 'what this PR does to the affected layers 3-6 months after merge',
        mergeAdvice: 'merge | merge-with-fixes | rework',
      },
    }),
    { agent: 'PR Reviewer' }
  );
  const valid = new Set(LAYERS.map((l) => l.id));
  const fix = (l) => (valid.has(l) ? l : h.primary);
  return {
    summary: res.summary || '',
    risk: Number.isFinite(+res.risk) ? clamp(+res.risk) : null,
    items: (res.debtItems || []).slice(0, 10).map((i) => ({ layer: fix(i.layer), category: CATEGORIES.includes(i.category) ? i.category : 'Code quality', severity: clamp(+i.severity || 2, 1, 5), title: i.title || '', detail: i.detail || '', file: i.file || null, fix: i.fix || '', compounding: i.compounding || '', source: 'ai' })),
    paydown: (res.paydown || []).slice(0, 5).map((p) => ({ layer: fix(p.layer), title: p.title || '', detail: p.detail || '' })),
    forecast: res.forecast || '',
    mergeAdvice: ['merge', 'merge-with-fixes', 'rework'].includes(res.mergeAdvice) ? res.mergeAdvice : null,
  };
}

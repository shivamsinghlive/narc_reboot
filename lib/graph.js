import { LAYERS, LAYER_BY_ID, DIRECTED } from './layers.js';
import { testStem } from './metrics.js';
import { percentileRanker, clamp, round } from './util.js';

function tarjan(n, adj) {
  let index = 0;
  const idx = new Int32Array(n).fill(-1), low = new Int32Array(n), on = new Uint8Array(n), stack = [], comps = [];
  for (let s = 0; s < n; s++) {
    if (idx[s] !== -1) continue;
    const work = [[s, 0]];
    idx[s] = low[s] = index++; stack.push(s); on[s] = 1;
    while (work.length) {
      const top = work[work.length - 1], v = top[0];
      if (top[1] < adj[v].length) {
        const w = adj[v][top[1]++];
        if (idx[w] === -1) { idx[w] = low[w] = index++; stack.push(w); on[w] = 1; work.push([w, 0]); }
        else if (on[w]) low[v] = Math.min(low[v], idx[w]);
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === idx[v]) {
          const comp = []; let w;
          do { w = stack.pop(); on[w] = 0; comp.push(w); } while (w !== v);
          if (comp.length > 1) comps.push(comp);
        }
      }
    }
  }
  return comps;
}

const MODULE_ROOTS = new Set(['src', 'lib', 'app', 'apps', 'packages', 'services', 'internal', 'pkg', 'cmd', 'modules', 'server', 'client', 'backend', 'frontend', 'web', 'source', 'main', 'java', 'kotlin', 'python']);
export function modulePath(path, wrap = 0) {
  const dirs = path.split('/').slice(0, -1);
  if (!dirs.length) return '(root)';
  let depth = 2 + wrap;
  for (let i = 0; i < dirs.length && MODULE_ROOTS.has(dirs[i].toLowerCase()); i++) depth++;
  return dirs.slice(0, Math.min(depth, dirs.length)).join('/');
}

/**
 * files: [{path, layer, metrics, imports:[resolved paths], externals:[names]}]
 * Returns per-layer static analysis, hotspots, layer edges and module graph.
 */
export function analyzeStructure(files) {
  const id = new Map(files.map((f, i) => [f.path, i]));
  const adj = files.map(() => []);
  const fanIn = new Int32Array(files.length);
  for (let i = 0; i < files.length; i++) {
    const seen = new Set();
    for (const t of files[i].imports) {
      const j = id.get(t);
      if (j === undefined || j === i || seen.has(j)) continue;
      seen.add(j); adj[i].push(j); fanIn[j]++;
    }
  }
  const sccs = tarjan(files.length, adj);
  const inCycle = new Int32Array(files.length);
  sccs.forEach((c, k) => c.forEach((v) => (inCycle[v] = k + 1)));

  // Test linkage
  const testStems = new Set(files.filter((f) => f.layer === 'tests').map((f) => testStem(f.path)));
  const testedByImport = new Set();
  files.forEach((f, i) => { if (f.layer === 'tests') adj[i].forEach((j) => testedByImport.add(j)); });

  // Hotspot scoring (repo-relative percentiles)
  const code = files.map((f, i) => ({ f, i })).filter(({ f }) => f.isCode && f.layer !== 'tests');
  const rLoc = percentileRanker(code.map(({ f }) => f.metrics.loc));
  const rCx = percentileRanker(code.map(({ f }) => f.metrics.complexity));
  const rIn = percentileRanker(code.map(({ i }) => fanIn[i]));
  const rNest = percentileRanker(code.map(({ f }) => f.metrics.maxNest));
  for (const { f, i } of code) {
    const m = f.metrics;
    f.fanIn = fanIn[i]; f.fanOut = adj[i].length; f.inCycle = inCycle[i] > 0;
    f.tested = testedByImport.has(i) || testStems.has(testStem(f.path));
    const s = 0.28 * rCx(m.complexity) + 0.2 * rLoc(m.loc) + 0.14 * rIn(fanIn[i]) + 0.1 * rNest(m.maxNest)
      + 0.12 * Math.min(1, m.todos / 3) + 0.08 * Math.min(1, (m.suppressions + m.anys / 3) / 3) + (f.inCycle ? 0.08 : 0);
    f.hotspot = round(s * 100, 0);
    const reasons = [];
    if (rLoc(m.loc) > 0.9) reasons.push(`${m.loc} LOC (top ${Math.max(1, Math.round((1 - rLoc(m.loc)) * 100))}%)`);
    if (rCx(m.complexity) > 0.9) reasons.push(`${m.complexity} conditionals`);
    if (rIn(fanIn[i]) > 0.9 && fanIn[i] > 2) reasons.push(`imported by ${fanIn[i]} files`);
    if (m.maxNest >= 6) reasons.push(`nesting depth ${m.maxNest}`);
    if (m.todos) reasons.push(`${m.todos} TODO/FIXME`);
    if (m.suppressions) reasons.push(`${m.suppressions} lint/type suppressions`);
    if (m.anys >= 3) reasons.push(`${m.anys} \`any\` casts`);
    if (f.inCycle) reasons.push('in a circular import');
    if (!f.tested) reasons.push('no linked tests');
    f.hotspotReasons = reasons;
  }

  // Layer edges & violations
  const edgeMap = new Map();
  files.forEach((f, i) => {
    for (const j of adj[i]) {
      const a = f.layer, b = files[j].layer;
      if (a === b) continue;
      const k = `${a}>${b}`;
      const e = edgeMap.get(k) || { source: a, target: b, weight: 0, samples: [] };
      e.weight++;
      if (e.samples.length < 5) e.samples.push({ from: f.path, to: files[j].path });
      edgeMap.set(k, e);
    }
  });
  const edges = [...edgeMap.values()].map((e) => {
    const ta = LAYER_BY_ID[e.source].tier, tb = LAYER_BY_ID[e.target].tier;
    const violation = DIRECTED.has(e.source) && DIRECTED.has(e.target) && tb < ta;
    return { ...e, violation, bidirectional: edgeMap.has(`${e.target}>${e.source}`) };
  });

  // Layer aggregates
  const layers = [];
  for (const L of LAYERS) {
    const lf = files.filter((f) => f.layer === L.id);
    if (!lf.length) continue;
    const codeF = lf.filter((f) => f.isCode);
    const sum = (k) => lf.reduce((a, f) => a + (f.metrics[k] || 0), 0);
    const loc = sum('loc'), kloc = Math.max(loc / 1000, 0.2);
    const todos = sum('todos'), complexity = sum('complexity'), suppressions = sum('suppressions') + Math.round(sum('anys') / 3);
    const big = codeF.filter((f) => f.metrics.loc > 500).length;
    const cyc = codeF.filter((f) => f.inCycle).length;
    const coverage = L.id === 'tests' || L.id === 'infra' || L.id === 'config' || !codeF.length ? null : codeF.filter((f) => f.tested).length / codeF.length;
    const outE = edges.filter((e) => e.source === L.id);
    const violations = outE.filter((e) => e.violation);
    const externals = {};
    lf.forEach((f) => f.externals.forEach((x) => (externals[x] = (externals[x] || 0) + 1)));

    const drivers = [];
    const add = (label, detail, pts) => { if (pts >= 0.5) drivers.push({ label, detail, points: round(pts, 0) }); };
    add('TODO / FIXME density', `${todos} markers · ${round(todos / kloc)} per kLOC`, Math.min(1, todos / kloc / 8) * 16);
    add('Conditional complexity', `${round(complexity / kloc, 0)} if/loop/boolean branches per kLOC (code complexity, not git branches)`, codeF.length ? Math.min(1, Math.max(0, complexity / kloc - 40) / 140) * 18 : 0);
    if (coverage !== null) add('Test gap', `${Math.round(coverage * 100)}% of files have linked tests`, (1 - coverage) * 20);
    add('Circular imports', `${cyc} files in import cycles`, Math.min(1, cyc / Math.max(4, codeF.length * 0.15)) * 12);
    add('Layering violations', violations.map((v) => `→ ${LAYER_BY_ID[v.target].name} (${v.weight})`).join(', ') || '', Math.min(1, violations.reduce((a, v) => a + v.weight, 0) / 12) * 12);
    add('Oversized files', `${big} files over 500 LOC`, Math.min(1, big / Math.max(3, codeF.length * 0.1)) * 10);
    add('Suppressions & any-casts', `${suppressions} suppressions`, Math.min(1, suppressions / kloc / 4) * 8);
    add('Coupling', `depends on ${outE.length} other layers`, Math.max(0, outE.length - 3) * 1.5);
    const staticScore = clamp(drivers.reduce((a, d) => a + d.points, 0));

    // Modules
    const mods = new Map();
    const wrap = new Set(files.map((f) => f.path.split('/')[0])).size === 1 && files.every((f) => f.path.includes('/')) ? 1 : 0;
    const flat = new Set(lf.map((f) => modulePath(f.path, wrap))).size < 3 && lf.filter((f) => f.isCode).length <= 60;
    for (const f of lf) {
      const mp = flat && f.isCode ? f.path.replace(/\.\w+$/, '') : modulePath(f.path, wrap);
      const m = mods.get(mp) || { id: `${L.id}::${mp}`, path: mp, layer: L.id, files: 0, loc: 0, todos: 0, complexity: 0, hot: 0, untested: 0, code: 0 };
      m.files++; m.loc += f.metrics.loc; m.todos += f.metrics.todos; m.complexity += f.metrics.complexity;
      if (f.isCode) { m.code++; if (f.hotspot >= 70) m.hot++; if (f.tested === false) m.untested++; }
      mods.set(mp, m);
      f.module = m.id;
    }
    const modules = [...mods.values()].sort((a, b) => b.loc - a.loc).map((m) => {
      const k = Math.max(m.loc / 1000, 0.2);
      m.score = round(clamp(Math.min(1, m.todos / k / 8) * 25 + Math.min(1, Math.max(0, m.complexity / k - 40) / 140) * 30 + Math.min(1, m.hot / 3) * 25 + (m.code ? (m.untested / m.code) * 20 : 0)), 0);
      return m;
    });

    layers.push({
      ...L, files: lf.length, loc, todos, complexity, suppressions, coverage: coverage === null ? null : round(coverage, 2),
      filesInCycles: cyc, violations: violations.length, staticScore: round(staticScore, 0), staticDrivers: drivers.sort((a, b) => b.points - a.points),
      externals: Object.entries(externals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      modules: modules.slice(0, 40),
      hotspots: codeF.filter((f) => f.hotspot != null).sort((a, b) => b.hotspot - a.hotspot).slice(0, 10).map(hotspotView),
      todoSamples: lf.flatMap((f) => f.metrics.todoSamples.map((t) => ({ file: f.path, ...t }))).slice(0, 8),
    });
  }

  // Module-level edges (within and across layers)
  const modEdges = new Map();
  files.forEach((f, i) => {
    for (const j of adj[i]) {
      const a = f.module, b = files[j].module;
      if (!a || !b || a === b) continue;
      const k = `${a}>${b}`;
      modEdges.set(k, (modEdges.get(k) || 0) + 1);
    }
  });
  const moduleEdges = [...modEdges.entries()].map(([k, w]) => { const [source, target] = k.split('>'); return { source, target, weight: w }; });

  const cycles = sccs.sort((a, b) => b.length - a.length).slice(0, 12).map((c) => ({ size: c.length, layers: [...new Set(c.map((v) => files[v].layer))], files: c.slice(0, 8).map((v) => files[v].path) }));
  const hotspots = code.map(({ f }) => f).sort((a, b) => b.hotspot - a.hotspot).slice(0, 40).map(hotspotView);
  return { layers, edges, moduleEdges, cycles, hotspots, fileIndex: id };
}

const hotspotView = (f) => ({ path: f.path, layer: f.layer, score: f.hotspot, loc: f.metrics.loc, complexity: f.metrics.complexity, todos: f.metrics.todos, fanIn: f.fanIn, fanOut: f.fanOut, tested: f.tested, reasons: f.hotspotReasons });

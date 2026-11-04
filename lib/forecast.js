import { clamp, sat, round } from './util.js';
import { DIRECTED } from './layers.js';

/** Soft ceiling: linear up to 70, then compresses toward 100 so layers stay comparable. */
const soft = (x) => (x <= 70 ? Math.max(0, x) : 70 + 30 * (1 - Math.exp(-(x - 70) / 30)));
const HEALTHY = 20; // debt below this in a dependency is not passed on

export const DAYS = [0, 15, 30, 45, 60, 75, 90];

/**
 * Turns static debt + unmerged PR debt + backlog debt into a per-layer forecast,
 * then propagates debt through the dependency graph (a layer inherits risk from what it depends on).
 *
 * layers: [{id, staticScore, ...}]  edges: [{source,target,weight}] (source depends on target)
 * prs: [{number, items:[{layer,severity}], paydown:[{layer}], pMerge}]
 * tasks: [{layers:[], delta, status}]
 * velocity: {medianDaysToMerge}
 */
export function forecast({ layers, edges, prs, tasks, velocity }) {
  const ids = layers.map((l) => l.id);
  const tau = Math.max(2, velocity.medianDaysToMerge || 10);

  // Raw PR debt per layer, per PR
  const prRaw = prs.map((pr) => {
    const r = {};
    const hasAi = pr.items.some((i) => i.source === 'ai');
    for (const i of pr.items) r[i.layer] = (r[i.layer] || 0) + (i.severity || 2) * 3 * (hasAi && i.source === 'heuristic' ? 0.6 : 1);
    for (const p of pr.paydown || []) r[p.layer] = (r[p.layer] || 0) - 4;
    for (const k in r) r[k] = Math.max(-20, Math.min(45, r[k])); // one PR cannot dominate a layer's forecast
    return { number: pr.number, title: pr.title, pMerge: pr.pMerge, raw: r };
  });
  const pMergeAt = (p, d) => p * (1 - Math.exp(-d / tau));
  const taskProgress = (t, d) => Math.min(1, (d / 90) * (/progress|review|doing/i.test(t.status || '') ? 1.6 : 1));

  const own = {}; // own[layer][dayIdx] = {static, drift, pending, backlog, own}
  for (const l of layers) {
    own[l.id] = DAYS.map((d) => {
      let pRaw = 0, bRaw = 0;
      for (const p of prRaw) if (p.raw[l.id]) pRaw += pMergeAt(p.pMerge, d) * p.raw[l.id];
      for (const t of tasks) if (t.layers.includes(l.id)) bRaw += taskProgress(t, d) * t.delta / t.layers.length;
      const drift = l.staticScore * 0.08 * (d / 90);
      const pending = sat(pRaw, 32, 40);
      const backlog = sat(bRaw, 25, 40);
      return { day: d, static: l.staticScore, drift: round(drift), pending: round(pending), backlog: round(backlog), own: soft(l.staticScore + drift + pending + backlog) };
    });
  }

  // Dependency propagation (BFS up to depth 4)
  const out = Object.fromEntries(ids.map((id) => [id, []]));
  const inn = Object.fromEntries(ids.map((id) => [id, []]));
  for (const e of edges) { if (out[e.source] && inn[e.target]) { out[e.source].push(e); inn[e.target].push(e); } }

  const chains = {};
  for (const id of ids) {
    const seen = new Map([[id, { depth: 0, via: [id], weight: Infinity }]]);
    const q = [id];
    while (q.length) {
      const v = q.shift(); const cur = seen.get(v);
      if (cur.depth >= 4) continue;
      for (const e of out[v]) {
        if (seen.has(e.target) || e.target === 'tests' || e.target === 'config') continue;
        seen.set(e.target, { depth: cur.depth + 1, via: [...cur.via, e.target], weight: Math.min(cur.weight, e.weight) });
        q.push(e.target);
      }
    }
    seen.delete(id);
    chains[id] = [...seen.entries()].map(([layer, v]) => ({ layer, ...v }));
  }

  const result = {};
  for (const l of layers) {
    const series = DAYS.map((d, k) => {
      let inherited = 0;
      const parts = [];
      for (const c of DIRECTED.has(l.id) ? chains[l.id] : []) {
        const coupling = c.depth === 1 ? 0.4 + 0.6 * Math.min(1, c.weight / 25) : 0.5;
        const pts = Math.max(0, own[c.layer][k].own - HEALTHY) * 0.14 * 0.5 ** (c.depth - 1) * coupling;
        inherited += pts; parts.push({ layer: c.layer, depth: c.depth, via: c.via, points: round(pts) });
      }
      inherited = Math.min(22, inherited);
      const o = own[l.id][k];
      return { ...o, inherited: round(inherited), total: round(soft(o.own + inherited), 0), parts };
    });
    const allMerged = soft(l.staticScore + sat(prRaw.reduce((a, p) => a + (p.raw[l.id] || 0), 0), 32, 40));
    result[l.id] = {
      series: series.map(({ parts, ...s }) => s),
      inheritedFrom: series[0].parts.sort((a, b) => b.points - a.points),
      inheritedFrom90: series.at(-1).parts.sort((a, b) => b.points - a.points),
      dependsOn: out[l.id].map((e) => ({ layer: e.target, weight: e.weight, violation: e.violation })),
      dependents: inn[l.id].map((e) => ({ layer: e.source, weight: e.weight, violation: e.violation })),
      transitiveDeps: chains[l.id].length,
      whatIfAllMerged: round(allMerged, 0),
      prContrib: prRaw.filter((p) => p.raw[l.id]).map((p) => ({ number: p.number, title: p.title, raw: round(p.raw[l.id]), pMerge: p.pMerge })).sort((a, b) => b.raw - a.raw),
    };
  }
  // Blast radius: layers transitively depending on each layer
  for (const id of ids) result[id].blastRadius = ids.filter((o) => o !== id && chains[o].some((c) => c.layer === id)).length;
  return result;
}

export function repoIndex(layers, fc, k) {
  let w = 0, s = 0;
  for (const l of layers) { if (l.id === 'tests' || l.id === 'config') continue; const wt = Math.sqrt(l.loc + 50); w += wt; s += wt * fc[l.id].series[k].total; }
  return w ? Math.round(s / w) : 0;
}

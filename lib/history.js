import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './llm.js';

const file = (repo) => join(CACHE_DIR, 'history', repo.replace(/[^\w.-]+/g, '__') + '.json');

export async function loadHistory(repo) { try { return JSON.parse(await readFile(file(repo), 'utf8')); } catch { return []; } }

export function snapshotOf(r) {
  return {
    at: r.analyzedAt, headSha: r.people?.commits?.[0]?.sha || null, pushedAt: r.repo.pushedAt, mode: r.mode,
    index: r.summary.index, index90: r.summary.index90, security: r.security?.score ?? null,
    layers: Object.fromEntries(r.layers.map((l) => [l.id, { score: l.score, sec: r.security?.layers?.[l.id]?.score ?? null }])),
    findings: Object.fromEntries((r.security?.findings || []).slice(0, 300).map((f) => [f.fp, { title: f.title, file: f.file, line: f.line, severity: f.severity }])),
    vulns: (r.security?.vulns || []).map((v) => `${v.id}|${v.package}`), prs: r.prs.map((p) => p.number), endpoints: r.security?.surface?.endpoints?.length ?? 0,
  };
}

export async function saveSnapshot(repo, snap) {
  const h = (await loadHistory(repo)).filter((s) => s.at !== snap.at);
  h.unshift(snap);
  try { await mkdir(join(CACHE_DIR, 'history'), { recursive: true }); await writeFile(file(repo), JSON.stringify(h.slice(0, 30))); } catch {}
  return h;
}

/** What changed between the previous analysis and this one. */
export function diffSnapshots(prev, cur) {
  if (!prev) return null;
  const newF = Object.keys(cur.findings).filter((k) => !prev.findings?.[k]).map((k) => ({ fp: k, ...cur.findings[k] }));
  const fixedF = Object.keys(prev.findings || {}).filter((k) => !cur.findings[k]).map((k) => ({ fp: k, ...prev.findings[k] }));
  const pv = new Set(prev.vulns || []), cv = new Set(cur.vulns);
  return {
    from: prev.at, to: cur.at, sameCommit: !!prev.headSha && prev.headSha === cur.headSha, prevSha: prev.headSha, curSha: cur.headSha,
    index: [prev.index, cur.index], index90: [prev.index90, cur.index90], security: [prev.security, cur.security],
    layers: Object.keys(cur.layers).map((id) => ({ id, from: prev.layers?.[id]?.score ?? null, to: cur.layers[id].score, secFrom: prev.layers?.[id]?.sec ?? null, secTo: cur.layers[id].sec })).filter((x) => x.from !== x.to || x.secFrom !== x.secTo),
    newFindings: newF.slice(0, 50), fixedFindings: fixedF.slice(0, 50),
    newVulns: [...cv].filter((v) => !pv.has(v)).map((v) => v.split('|')), fixedVulns: [...pv].filter((v) => !cv.has(v)).map((v) => v.split('|')),
    prsOpened: cur.prs.filter((n) => !(prev.prs || []).includes(n)), prsClosed: (prev.prs || []).filter((n) => !cur.prs.includes(n)),
  };
}

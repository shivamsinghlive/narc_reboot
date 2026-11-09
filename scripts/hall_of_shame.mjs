// Scans well-known open-source apps with a running Narc server and writes data/hall.json for the landing page's
// Hall of Shame. Every entry is a real analysis result, stamped with when it was scanned.
//   node scripts/hall_of_shame.mjs [owner/repo ...]
import { writeFile, readFile } from 'node:fs/promises';

const SERVER = process.env.NARC_URL || 'http://localhost:4317';
const REPOS = process.argv.slice(2).length ? process.argv.slice(2) : ['mfts/papermark', 'dubinc/dub', 'umami-software/umami', 'documenso/documenso', 'formbricks/formbricks', 'excalidraw/excalidraw'];
const OUT = new URL('../data/hall.json', import.meta.url);

async function scan(repo) {
  const { id } = await (await fetch(`${SERVER}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repoUrl: `https://github.com/${repo}` }) })).json();
  const text = await (await fetch(`${SERVER}/api/jobs/${id}/stream`)).text();
  const done = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6))).find((e) => e.type === 'done' || e.type === 'error');
  if (!done || done.type === 'error') throw new Error(done?.message || 'no result');
  const r = done.result, p = r.privacy;
  const top = p.flows.find((f) => f.kind === 'share') || p.flows[0];
  return { repo, fullName: r.repo.fullName, description: r.repo.description, grade: p.grade, score: p.score, verdict: p.verdict,
    recipients: p.recipients.map((x) => ({ name: x.name, cat: x.cat })), flows: p.totals.flows, top: top ? top.title : null, scannedAt: new Date().toISOString() };
}

let hall = [];
try { hall = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
for (const repo of REPOS) {
  try { const e = await scan(repo); hall = [e, ...hall.filter((h) => h.repo !== repo)]; console.log(`${e.grade} ${e.score} ${repo} · ${e.recipients.length} recipients · ${e.flows} flows`); }
  catch (err) { console.log(`skip ${repo}: ${err.message}`); }
}
hall.sort((a, b) => a.score - b.score);
await writeFile(OUT, JSON.stringify(hall, null, 2) + '\n');
console.log(`wrote ${hall.length} entries → data/hall.json`);

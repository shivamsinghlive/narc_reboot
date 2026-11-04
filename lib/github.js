import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './llm.js';

const UA = 'narc-tech-debt-radar';
const TTL = 10 * 60 * 1000; // GitHub API responses are reused for 10 minutes (saves rate limit on re-runs)
async function cached(key, fn) {
  const f = join(CACHE_DIR, 'gh', createHash('sha256').update(key).digest('hex') + '.json');
  try { const { t, v } = JSON.parse(await readFile(f, 'utf8')); if (Date.now() - t < TTL) return v; } catch {}
  const v = await fn();
  try { await mkdir(join(CACHE_DIR, 'gh'), { recursive: true }); await writeFile(f, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}
const MAX_TARBALL = 150 * 1024 * 1024;

export function parseRepoUrl(input) {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = s.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error('That does not look like a GitHub repo. Use https://github.com/owner/repo or owner/repo.');
  return { owner: m[1], repo: m[2] };
}

export function makeGithub(token) {
  const base = { 'User-Agent': UA };
  const apiHeaders = { ...base, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) apiHeaders.Authorization = `Bearer ${token}`;
  let calls = 0;

  const tokenTag = token ? createHash('sha256').update(token).digest('hex').slice(0, 8) : 'anon';
  const api = (path, accept) => cached(`${tokenTag}:${accept || ''}:${path}`, () => apiRaw(path, accept));
  async function apiRaw(path, accept) {
    calls++;
    const r = await fetch(`https://api.github.com${path}`, { headers: accept ? { ...apiHeaders, Accept: accept } : apiHeaders });
    if (!r.ok) {
      const body = await r.text();
      if ((r.status === 403 || r.status === 429) && r.headers.get('x-ratelimit-remaining') === '0') {
        const reset = new Date(Number(r.headers.get('x-ratelimit-reset')) * 1000);
        throw new Error(`GitHub API rate limit reached (resets ${reset.toLocaleTimeString()}). Add a GitHub token in Settings.`);
      }
      if (r.status === 404) throw new Error(`GitHub returned 404 for ${path} — repo is private or does not exist (add a token for private repos).`);
      throw new Error(`GitHub ${r.status} on ${path}: ${body.slice(0, 200)}`);
    }
    return accept && !accept.includes('json') ? r.text() : r.json();
  }

  async function readCapped(res, cap) {
    const chunks = []; let size = 0;
    for await (const c of res.body) {
      size += c.length;
      if (size > cap) throw new Error(`Repository archive exceeds ${Math.round(cap / 1048576)} MB — too large for a single-pass scan.`);
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  return {
    get calls() { return calls; },
    repo: (o, n) => api(`/repos/${o}/${n}`),
    pulls: (o, n, state, per = 50) => api(`/repos/${o}/${n}/pulls?state=${state}&per_page=${per}&sort=updated&direction=desc`),
    commits: (o, n, { path, per = 100 } = {}) => api(`/repos/${o}/${n}/commits?per_page=${per}${path ? `&path=${encodeURIComponent(path)}` : ''}`),
    contributors: (o, n) => api(`/repos/${o}/${n}/contributors?per_page=30`),
    releases: (o, n) => api(`/repos/${o}/${n}/releases?per_page=15`),
    issues: async (o, n, per = 60) => (await api(`/repos/${o}/${n}/issues?state=open&per_page=${per}&sort=updated`)).filter((i) => !i.pull_request),
    async tarball(o, n, ref) {
      // codeload is not counted against the REST rate limit; the API route is needed for private repos.
      const url = token ? `https://api.github.com/repos/${o}/${n}/tarball/${encodeURIComponent(ref)}` : `https://codeload.github.com/${o}/${n}/tar.gz/${encodeURIComponent(ref)}`;
      if (token) calls++;
      const r = await fetch(url, { headers: token ? apiHeaders : base, redirect: 'follow' });
      if (!r.ok) throw new Error(`Could not download source archive (${r.status}).`);
      return readCapped(r, MAX_TARBALL);
    },
    async prDiff(o, n, num) {
      if (token) return api(`/repos/${o}/${n}/pulls/${num}`, 'application/vnd.github.diff');
      return cached(`diff:${o}/${n}#${num}`, async () => {
        const r = await fetch(`https://github.com/${o}/${n}/pull/${num}.diff`, { headers: base, redirect: 'follow' });
        if (!r.ok) throw new Error(`diff ${r.status}`);
        return (await readCapped(r, 8 * 1024 * 1024)).toString('utf8');
      });
    },
  };
}

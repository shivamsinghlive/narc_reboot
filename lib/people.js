import { pool } from './util.js';

const prFrom = (msg) => { const m = String(msg || '').match(/\(#(\d+)\)|Merge pull request #(\d+)|#(\d+)\b/); return m ? +(m[1] || m[2] || m[3]) : null; };
const commitView = (c) => ({
  sha: c.sha, short: c.sha?.slice(0, 7), login: c.author?.login || null, name: c.commit?.author?.name || c.author?.login || 'unknown',
  avatar: c.author?.avatar_url || null, date: c.commit?.author?.date || c.commit?.committer?.date, message: String(c.commit?.message || '').split('\n')[0].slice(0, 140),
  pr: prFrom(c.commit?.message), url: c.html_url,
});

/** Who changed what: recent commits, contributors, releases, and per-file history for the files that matter. */
export async function gatherPeople(gh, owner, name, { files = [], budget = 10, warnings = [] } = {}) {
  const [commits, contributors, releases] = await Promise.all([
    gh.commits(owner, name, { per: 100 }).catch((e) => { warnings.push(`Commits: ${e.message}`); return []; }),
    gh.contributors(owner, name).catch(() => []),
    gh.releases(owner, name).catch(() => []),
  ]);
  const targets = [...new Set(files)].slice(0, budget);
  const hist = await pool(targets, 5, (p) => gh.commits(owner, name, { path: p, per: 5 }));
  const fileOwners = {};
  targets.forEach((p, i) => { if (Array.isArray(hist[i]) && hist[i].length) fileOwners[p] = hist[i].map(commitView); });
  return {
    contributors: (contributors || []).filter((c) => c.type !== 'Bot').slice(0, 30).map((c) => ({ login: c.login, avatar: c.avatar_url, contributions: c.contributions, url: c.html_url })),
    commits: (commits || []).map(commitView),
    fileOwners,
    releases: (releases || []).slice(0, 15).map((r) => ({ tag: r.tag_name, name: r.name || r.tag_name, date: r.published_at || r.created_at, author: r.author?.login, url: r.html_url, prerelease: r.prerelease, notes: String(r.body || '').slice(0, 400) })),
    traced: targets.length,
  };
}

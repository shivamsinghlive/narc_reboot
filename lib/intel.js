import { cached, fetchJson } from './cache.js';
import { pool, truncate } from './util.js';

/** Threat intel from Tavily and/or Exa web search (both optional, keys from Settings or .env). */
async function tavily(key, query) {
  const j = await fetchJson('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, max_results: 4, search_depth: 'basic', topic: 'general' }) });
  return (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: truncate(r.content || '', 320), published: r.published_date || null, source: 'Tavily' }));
}
async function exa(key, query) {
  const j = await fetchJson('https://api.exa.ai/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ query, numResults: 4, type: 'auto', contents: { text: { maxCharacters: 400 } } }) });
  return (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: truncate(r.text || '', 320), published: r.publishedDate || null, source: 'Exa' }));
}

export function intelQueries({ vulns, frameworks, aiLibs, repo }) {
  const q = [];
  for (const v of vulns.filter((x) => x.severity >= 4).slice(0, 2)) q.push({ topic: `${v.package} ${v.aliases[0] || v.id}`, query: `${v.aliases[0] || v.id} ${v.package} exploit proof of concept`, must: [v.package, v.aliases[0] || v.id] });
  if (aiLibs.length) q.push({ topic: 'LLM attacks', query: `prompt injection and tool abuse attacks against ${aiLibs.slice(0, 2).join(' and ')} applications 2026` });
  for (const fw of frameworks.slice(0, 2)) q.push({ topic: fw, query: `${fw} security vulnerabilities and attack techniques 2026` });
  if (!q.length && repo.language) q.push({ topic: repo.language, query: `common ${repo.language} web application attack techniques 2026` });
  return q.slice(0, 4);
}

export async function gatherIntel({ tavilyKey, exaKey, queries, warnings }) {
  if (!tavilyKey && !exaKey) return [];
  const jobs = queries.flatMap((q) => [tavilyKey && { ...q, p: 'tavily' }, exaKey && { ...q, p: 'exa' }].filter(Boolean));
  const res = await pool(jobs, 4, async (j) => {
    try {
      const rows = await cached('intel', `${j.p}:${j.query}`, 12 * 3600e3, () => (j.p === 'tavily' ? tavily(tavilyKey, j.query) : exa(exaKey, j.query)));
      const rel = (r) => !j.must || j.must.some((m) => `${r.title} ${r.snippet} ${r.url}`.toLowerCase().includes(String(m).toLowerCase()));
      return rows.filter(rel).map((r) => ({ ...r, topic: j.topic, query: j.query }));
    } catch (e) { warnings.push(`${j.p === 'tavily' ? 'Tavily' : 'Exa'} search failed: ${e.message}`); return []; }
  });
  const seen = new Set();
  return res.flat().filter((r) => r && r.url && !seen.has(r.url) && seen.add(r.url));
}

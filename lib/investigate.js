// Incident investigations on the analyzed repo's real CI history.
//
// A case is a real failure: a workflow that broke on the default branch (passed, then failed), or an open PR whose
// latest CI run fails. For each one Narc weighs three suspects, the same way as for production incidents:
//   change  - the code that changed between the last green run and the red one (or the PR's diff) broke it
//   vendor  - GitHub Actions, npm, PyPI or the network failed (checked against the vendor's own status page)
//   attack  - the change carries attack signs: hidden instructions for AI agents, CI pipeline edits by outsiders,
//             pull_request_target, secret exfiltration, brand-new or unknown packages (mapped to MITRE)
// Every clue cites real evidence (runs, jobs, annotations, commits, status incidents, registry answers) with links.
import { fetchJson, cached } from './cache.js';
import { pool } from './util.js';
import { technique } from './mitre.js';

const FAIL = new Set(['failure', 'timed_out', 'startup_failure']);
const BRANCH_EVENTS = new Set(['push', 'schedule', 'workflow_dispatch', 'merge_group']);
const STATUS_API = { GitHub: 'https://www.githubstatus.com/api/v2/incidents.json', npm: 'https://status.npmjs.org/api/v2/incidents.json', PyPI: 'https://status.python.org/api/v2/incidents.json' };
const INFRA = [
  [/artifact download failed|unable to download (and extract )?artifact|failed to (upload|download) artifact|artifact storage/i, 'GitHub', 'GitHub Actions could not move build artifacts'],
  [/lost communication with the server|runner has received a shutdown signal|the hosted runner|job was not started|no runner|exceeded the maximum execution time|runner.*(unavailable|offline)/i, 'GitHub', 'the GitHub Actions runner failed'],
  [/api rate limit exceeded|secondary rate limit/i, 'GitHub', 'GitHub rate-limited the build'],
  [/no space left on device/i, 'GitHub', 'the runner ran out of disk'],
  [/npm (ERR!|error) (code )?(E5\d\d|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND)|registry\.npmjs\.org[^\n]*(5\d\d|timed? ?out)/i, 'npm', 'the npm registry failed'],
  [/(pypi\.org|files\.pythonhosted\.org)[^\n]*(5\d\d|timed? ?out|connection)/i, 'PyPI', 'PyPI failed'],
  [/\b(ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|connection reset by peer|temporary failure in name resolution|502 bad gateway|503 service unavailable|504 gateway)/i, 'GitHub', 'a network call from the runner failed'],
];
const HIDDEN = /<!--[^>]*\b(ai|assistant|agent|llm|copilot|claude|gpt)\b[^>]*-->|ignore (all )?(prior|previous) instructions|you are an ai (agent|assistant)[^\n]{0,80}(must|should)/i;
const EXFIL = /(curl|wget|invoke-webrequest|nc )[^\n]*(secrets\.|\$\{?\w*(TOKEN|SECRET|KEY|PASSWORD)\b|\$\{\{\s*secrets)|\b(env|printenv)\b\s*\|\s*(curl|nc|base64|wget)|base64[^\n]*secrets\./i;
const SECRET = /(api[_-]?key|secret|passw(or)?d|token|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{16,}['"]|\b(ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{30,}|xox[bp]-[A-Za-z0-9-]{20,})/;
const NEW_NPM = /^\s*"(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)":\s*"[\^~]?\d/i;
const NEW_PIP = /^\s*([A-Za-z0-9][\w.-]{1,60})\s*(==|>=|~=)\s*\d/;
const OUTSIDER = new Set(['FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER', 'NONE']);
const short = (s) => String(s || '').slice(0, 7);
const ts = (x) => new Date(x).getTime();
const span = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 2880 ? `${Math.round(m / 1440)} days` : m >= 120 ? `${Math.round(m / 60)} hours` : `${m} minutes`; };
const clue = (suspect, points, text, events = [], tech = []) => ({ suspect, points, text, events, tech, sources: [] });
const base = (p) => p.split('/').pop().replace(/\.\w+$/, '');

export async function investigateRepo({ gh, repo, ctx, token, refresh = false, warnings = [] }) {
  const { owner, name, defaultBranch: def, url: repoUrl } = repo;
  const budget = token ? { breaks: 6, prs: 8 } : { breaks: 3, prs: 3 };
  const callsAt = gh.calls;
  const bust = refresh ? `&_=${Date.now()}` : '';
  const listRuns = (event) => gh.api(`/repos/${owner}/${name}/actions/runs?branch=${encodeURIComponent(def)}&event=${event}&per_page=100${bust}`).then((d) => d.workflow_runs || []);
  const [pushRuns, schedRuns] = await Promise.all([listRuns('push'), listRuns('schedule').catch(() => [])]);
  const runs = [...pushRuns, ...schedRuns].filter((r) => BRANCH_EVENTS.has(r.event)).sort((a, b) => ts(a.created_at) - ts(b.created_at));
  const fileLayers = ctx?.fileLayers || {};
  const statusCache = {};
  const status = (vendor) => (statusCache[vendor] ||= cached('status', vendor, 10 * 60e3, () => fetchJson(STATUS_API[vendor])).then((d) => d.incidents || []).catch((e) => { warnings.push(`${vendor} status page: ${e.message}`); return null; }));

  // ---- Breaks on the default branch: a workflow that passed, then failed
  const byWf = {};
  runs.forEach((r) => (byWf[r.workflow_id] ||= []).push(r));
  const breaks = [];
  for (const list of Object.values(byWf)) {
    for (let i = 0; i < list.length; i++) {
      if (!FAIL.has(list[i].conclusion) || (i > 0 && FAIL.has(list[i - 1].conclusion))) continue;
      const fails = []; let j = i;
      while (j < list.length && (FAIL.has(list[j].conclusion) || !list[j].conclusion)) { if (list[j].conclusion) fails.push(list[j]); j++; }
      breaks.push({ first: list[i], fails, prevGood: i > 0 ? list[i - 1] : null, fixedBy: list[j] || null, wf: list[i].name });
    }
  }
  breaks.sort((a, b) => ts(b.first.created_at) - ts(a.first.created_at));

  // ---- Open PRs whose latest CI fails
  const prCases = [];
  const prs = (ctx?.prs || []).filter((p) => p.sha).slice(0, budget.prs);
  await pool(prs, 3, async (pr) => {
    const pruns = (await gh.api(`/repos/${owner}/${name}/actions/runs?head_sha=${pr.sha}&per_page=50${bust}`)).workflow_runs || [];
    const latest = Object.values(pruns.reduce((m, r) => { if (!m[r.workflow_id] || ts(r.created_at) > ts(m[r.workflow_id].created_at)) m[r.workflow_id] = r; return m; }, {}));
    const failed = latest.filter((r) => FAIL.has(r.conclusion));
    if (failed.length) prCases.push({ pr, first: failed[0], failed, all: latest });
  });

  const cases = [];
  const safely = (fn, what) => async (x, k) => { try { return await fn(x, k); } catch (e) { warnings.push(`${what}: ${e.message}`); console.error(e); return null; } };
  const bc = await pool(breaks.slice(0, budget.breaks), 2, safely(branchCase, 'Branch break'));
  const pc = await pool(prCases, 2, safely(prCase, 'PR case'));
  cases.push(...bc, ...pc);
  let nb = 0, np = 0;
  const out = cases.filter(Boolean).map((c) => ({ ...c, id: c.kind === 'pr' ? `P${++np}` : `B${++nb}` }));
  const techniques = Object.fromEntries([...new Set(out.flatMap((c) => Object.values(c.suspects).flat().flatMap((x) => x.tech)))].map((id) => [id, technique(id)]));
  return {
    ok: true, repo: `${owner}/${name}`, defaultBranch: def, generatedAt: new Date().toISOString(),
    runsChecked: runs.length, workflows: Object.keys(byWf).length, breaksFound: breaks.length, prsChecked: prs.length, prsFailing: prCases.length,
    capped: breaks.length > budget.breaks, token: !!token, githubCalls: gh.calls - callsAt,
    oldestRun: runs[0]?.created_at || null, cases: out, techniques, warnings,
  };

  // ------------------------------------------------------------------ evidence gathering
  async function failureDetail(run, ev) {
    let jobs = [];
    try {
      const j1 = await gh.api(`/repos/${owner}/${name}/actions/runs/${run.id}/jobs?per_page=100`);
      jobs = j1.jobs || [];
      if (j1.total_count > 100 && !jobs.some((j) => FAIL.has(j.conclusion))) jobs = jobs.concat((await gh.api(`/repos/${owner}/${name}/actions/runs/${run.id}/jobs?per_page=100&page=2`)).jobs || []);
    } catch (e) { warnings.push(`Jobs for run ${run.id}: ${e.message}`); }
    const failedJobs = jobs.filter((j) => FAIL.has(j.conclusion));
    const steps = [...new Set(failedJobs.flatMap((j) => (j.steps || []).filter((s) => FAIL.has(s.conclusion)).map((s) => s.name)))];
    const texts = [];
    const notes = [];
    // Annotations hold the error text and are public. Read up to 3 failed jobs, one per job group, skipping jobs without any.
    const groups = new Set();
    let tries = 0;
    for (const j of failedJobs) {
      const g = j.name.replace(/\s*\(.*\)$/, '').replace(/ on .*/, '');
      if (groups.has(g) || groups.size >= 2 || tries >= 3) continue;
      tries++;
      try {
        const anns = (await gh.api(`/repos/${owner}/${name}/check-runs/${j.id}/annotations`)).filter((a) => a.annotation_level === 'failure' || a.annotation_level === 'warning');
        if (!anns.length) continue;
        groups.add(g);
        anns.slice(0, 4).forEach((a, i) => {
          const id = `ann-${j.id}-${i}`;
          ev[id] = { id, ts: j.completed_at || run.updated_at, source: 'ci', kind: 'annotation', summary: `${j.name}: ${a.message.split('\n')[0].slice(0, 160)}`, raw: `${a.path}${a.start_line ? `:${a.start_line}` : ''}\n${a.message}`, url: j.html_url };
          texts.push({ id, text: a.message, path: a.path !== '.github' ? a.path : null, line: a.start_line });
          notes.push(id);
        });
      } catch (e) { warnings.push(`Annotations for job ${j.id}: ${e.message}`); }
    }
    if (token && failedJobs[0]) {
      try {
        const log = await gh.jobLog(owner, name, failedJobs[0].id);
        const lines = String(log).split('\n').map((l) => l.replace(/^\S+Z\s/, '')).filter((l) => /##\[error\]|\berror\b|\bfailed\b|Traceback|Exception|FAIL\b|✕|assert/i.test(l)).slice(-25);
        if (lines.length) {
          const id = `log-${failedJobs[0].id}`;
          ev[id] = { id, ts: failedJobs[0].completed_at, source: 'ci', kind: 'log', summary: `Error lines from the ${failedJobs[0].name} log`, raw: lines.join('\n'), url: failedJobs[0].html_url };
          texts.push({ id, text: lines.join('\n') });
        }
      } catch (e) { warnings.push(`Log for job ${failedJobs[0].id}: ${e.message}`); }
    }
    const fid = `run-${run.id}`;
    ev[fid] = { id: fid, ts: run.created_at, source: 'ci', kind: 'run', summary: `${run.name} ${run.conclusion} on ${short(run.head_sha)} (run #${run.run_number})${failedJobs.length ? ` · ${failedJobs.length} failed job${failedJobs.length > 1 ? 's' : ''}${steps.length ? `, step "${steps[0]}"` : ''}` : ''}`, raw: [`event: ${run.event}`, `conclusion: ${run.conclusion}`, `attempt: ${run.run_attempt}`, ...failedJobs.slice(0, 12).map((j) => `✕ ${j.name} (${j.runner_name || 'runner ?'})${(j.steps || []).filter((s) => FAIL.has(s.conclusion)).map((s) => ` → ${s.name}`).join('')}`)].join('\n'), url: run.html_url };
    return { failedJobs, steps, texts, notes, runId: fid };
  }
  function runEv(ev, r) {
    const id = `run-${r.id}`;
    ev[id] ||= { id, ts: r.created_at, source: 'ci', kind: 'run', summary: `${r.name} ${r.conclusion || r.status} on ${short(r.head_sha)} (run #${r.run_number})`, raw: `event: ${r.event}\nconclusion: ${r.conclusion}\ncommit: ${r.head_commit?.message?.split('\n')[0] || ''}`, url: r.html_url };
    return id;
  }
  async function registry(name, eco) {
    return cached('registry', `${eco}:${name}`, 24 * 3600e3, async () => {
      try {
        if (eco === 'npm') {
          const d = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${name}`, {}, 10000).catch((e) => (/404/.test(e.message) ? null : Promise.reject(e)));
          if (!d) return { verdict: 'missing', why: 'is not on the npm registry', url: `https://www.npmjs.com/package/${name}` };
          return d.downloads < 500 ? { verdict: 'rare', why: `had only ${d.downloads} downloads last week on npm`, url: `https://www.npmjs.com/package/${name}` } : { verdict: 'known', downloads: d.downloads };
        }
        const d = await fetchJson(`https://pypi.org/pypi/${name}/json`, {}, 10000).catch((e) => (/404/.test(e.message) ? null : Promise.reject(e)));
        if (!d) return { verdict: 'missing', why: 'is not on PyPI', url: `https://pypi.org/project/${name}/` };
        const first = Object.values(d.releases || {}).flat().map((f) => ts(f.upload_time_iso_8601)).filter(Boolean).sort((a, b) => a - b)[0];
        return first && Date.now() - first < 30 * 864e5 ? { verdict: 'new', why: `was first published on PyPI ${span(Date.now() - first)} ago`, url: `https://pypi.org/project/${name}/` } : { verdict: 'known' };
      } catch (e) { return { verdict: 'unchecked', why: `could not be checked (${e.message})` }; }
    });
  }

  // ------------------------------------------------------------------ suspects
  function changeClues({ detail, changed, ev, header }) {
    const out = [header];
    const paths = changed.map((f) => f.path);
    let hit = null;
    for (const t of detail.texts) {
      if (t.path && paths.includes(t.path)) { hit = { id: t.id, file: t.path, how: `points at ${t.path}${t.line ? `:${t.line}` : ''}` }; break; }
      const f = paths.find((p) => base(p).length >= 4 && !/^(index|main|test|tests|setup|utils?)$/i.test(base(p)) && new RegExp(`\\b${base(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t.text));
      if (f) { hit = { id: t.id, file: f, how: `mentions ${base(f)}` }; break; }
    }
    if (hit) out.push(clue('change', 3, `The failure ${hit.how}, and this change edited \`${hit.file}\`.`, [hit.id, ...(ev[`file-${hit.file}`] ? [`file-${hit.file}`] : [])]));
    return { clues: out, hit };
  }
  async function vendorClues({ run, detail, sameCodePassed, elsewhere, ev }) {
    const out = [];
    const signs = [];
    for (const t of detail.texts) for (const [re, vendor, what] of INFRA) if (re.test(t.text)) { signs.push({ id: t.id, vendor, what }); break; }
    const stepSign = detail.steps.find((s) => /download|upload|artifact|cache|setup|install|checkout/i.test(s));
    const vendor = signs[0]?.vendor || 'GitHub';
    if (signs.length) out.push(clue('vendor', 2, `The error is ${vendor}'s, not our code's: ${signs[0].what}.`, [...new Set(signs.map((s) => s.id))]));
    else if (stepSign && !detail.texts.length) out.push(clue('vendor', 1, `It failed in the "${stepSign}" step, which talks to outside services, before any of our tests ran.`, [detail.runId]));
    if (['timed_out', 'startup_failure'].includes(run.conclusion)) out.push(clue('vendor', 1, `The run ended as "${run.conclusion}", which is a machine problem rather than a failing check.`, [detail.runId]));
    if (sameCodePassed) out.push(clue('vendor', 2, `The same commit ${short(run.head_sha)} passed ${sameCodePassed.label}. The code was identical, so something outside it changed.`, [sameCodePassed.id, detail.runId]));
    if (elsewhere.length >= 2) out.push(clue('vendor', 2, `${elsewhere.length} other workflows or commits on ${def} failed within 2 hours of this one. One change rarely breaks unrelated pipelines at once.`, elsewhere.map((r) => runEv(ev, r))));
    const incs = await status(vendor);
    const from = ts(run.created_at) - 3600e3, to = ts(run.updated_at) + 3600e3;
    if (!incs) out.push(clue('vendor', 0, `${vendor}'s status page could not be read.`));
    else {
      const covered = incs.length && ts(incs[incs.length - 1].created_at) <= from;
      const match = incs.find((i) => ts(i.started_at || i.created_at) <= to && ts(i.resolved_at || Date.now()) >= from && (vendor !== 'GitHub' || /actions|packages|api|git operations|codespaces/i.test(`${i.name} ${(i.components || []).map((c) => c.name).join(' ')}`)));
      if (match) {
        const id = `status-${match.id}`;
        ev[id] = { id, ts: match.started_at || match.created_at, source: 'status', kind: 'incident', summary: `${vendor} status: ${match.name} (${match.impact})`, raw: (match.incident_updates || []).slice(-3).map((u) => `${u.status}: ${u.body}`).join('\n\n'), url: match.shortlink };
        const tied = out.some((c) => c.points > 0);
        out.push({ ...clue('vendor', tied ? 3 : 1, `${vendor}'s own status page reported "${match.name}" at that time${tied ? '.' : ', but none of our errors look like theirs.'}`, [id]), sources: [{ title: `${vendor} status: ${match.name}`, url: match.shortlink }] });
      } else if (covered) out.push(clue('vendor', -1, `${vendor}'s status page shows no matching incident at that time.`));
      else out.push(clue('vendor', 0, `${vendor}'s public status history doesn't go back to ${new Date(from).toISOString().slice(0, 10)}, so it couldn't be checked.`));
    }
    return { clues: out, vendor, what: signs[0]?.what };
  }
  async function attackClues({ changed, texts, outsider, who, ev, evIds }) {
    const out = [];
    const hidden = texts.find((t) => HIDDEN.test(t.text));
    if (hidden) out.push(clue('attack', 3, `${hidden.where} hides an instruction meant for AI agents.`, [hidden.id], ['AML.T0051.001']));
    const wf = changed.filter((f) => /(^|\/)\.github\/workflows\//.test(f.path));
    // A maintainer editing CI is normal; an outsider editing it is how pipelines get poisoned.
    if (wf.length && outsider) out.push(clue('attack', 2, `${who} edited the CI pipeline (${wf.map((f) => f.path.split('/').pop()).join(', ')}) and is not an existing contributor. Pipeline edits run with the repo's secrets.`, wf.map((f) => evIds(f)), ['T1195.002', 'T1059']));
    const prt = wf.find((f) => f.added.some((l) => /pull_request_target/.test(l)));
    if (prt) out.push(clue('attack', f2(prt) ? 3 : 2, `The change adds a \`pull_request_target\` trigger${f2(prt) ? ' and checks out the PR\'s own code with it' : ''}: outside PRs then run with write access and secrets.`, [evIds(prt)], ['T1195.002']));
    const exfil = changed.find((f) => f.added.some((l) => EXFIL.test(l)));
    if (exfil) out.push(clue('attack', 3, `\`${exfil.path}\` sends secrets or the environment to the network: \`${exfil.added.find((l) => EXFIL.test(l)).trim().slice(0, 100)}\`.`, [evIds(exfil)], ['T1552.001', 'T1567']));
    const sec = changed.find((f) => f.added.some((l) => SECRET.test(l)));
    if (sec) out.push(clue('attack', 2, `\`${sec.path}\` adds what looks like a hard-coded secret.`, [evIds(sec)], ['T1552.001']));
    const deps = [];
    for (const f of changed) {
      if (/(^|\/)package\.json$/.test(f.path)) f.added.forEach((l) => { const m = l.match(NEW_NPM); if (m && !f.removed.some((r) => r.includes(`"${m[1]}"`))) deps.push({ n: m[1], eco: 'npm', f }); });
      if (/requirements[\w.-]*\.txt$/.test(f.path)) f.added.forEach((l) => { const m = l.match(NEW_PIP); if (m && !f.removed.some((r) => r.toLowerCase().startsWith(m[1].toLowerCase()))) deps.push({ n: m[1].toLowerCase(), eco: 'pypi', f }); });
    }
    for (const d of deps.slice(0, 8)) {
      const rep = await registry(d.n, d.eco);
      if (rep.verdict === 'known') continue;
      const id = `reg-${d.eco}-${d.n}`;
      ev[id] = { id, ts: new Date().toISOString(), source: 'registry', kind: 'lookup', summary: `${d.n} ${rep.why}`, raw: JSON.stringify(rep, null, 1), url: rep.url };
      out.push(clue('attack', rep.verdict === 'unchecked' ? 1 : 2, `${who} adds the package '${d.n}', which ${rep.why}.`, [evIds(d.f), id], ['T1195.002']));
    }
    if (!out.length) out.push(clue('attack', 0, 'No attack signs in the change: no hidden AI instructions, CI pipeline edits, secret leaks or unknown packages.'));
    return out;
    function f2(f) { return f.added.some((l) => /github\.event\.pull_request\.head\.(sha|ref)|refs\/pull\//.test(l)); }
  }

  function verdict(suspects) {
    const scores = Object.fromEntries(Object.entries(suspects).map(([k, v]) => [k, Math.max(0, v.reduce((a, c) => a + c.points, 0))]));
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const [top, second] = ranked;
    const margin = scores[top] - scores[second];
    const confidence = scores[top] >= 5 && margin >= 3 ? 'high' : scores[top] >= 3 && margin >= 1 ? 'medium' : 'unclear';
    return { scores, verdict: top, confidence };
  }
  function layerFor(p) {
    if (fileLayers[p]) return fileLayers[p];
    let dir = p.split('/').slice(0, -1).join('/');
    while (dir) { const sib = Object.keys(fileLayers).find((q) => q.startsWith(dir + '/')); if (sib) return fileLayers[sib]; dir = dir.split('/').slice(0, -1).join('/'); }
    return /(^|\/)\.github\//.test(p) ? 'infra' : null;
  }
  function finish(c, suspects, ev) {
    const v = verdict(suspects);
    const cited = new Set(Object.values(suspects).flat().flatMap((x) => x.events));
    const timeline = Object.values(ev).filter((e) => e.source !== 'diff').sort((a, b) => ts(a.ts) - ts(b.ts)).map((e) => ({ ...e, key: cited.has(e.id) }));
    const files = c.changed.map((f) => ({ path: f.path, layer: layerFor(f.path), added: f.added.length, removed: f.removed.length }));
    const roots = [...new Set(files.map((f) => f.layer).filter(Boolean))];
    const tsList = timeline.map((e) => ts(e.ts));
    return {
      kind: c.kind, title: c.title, question: c.question, story: c.story, date: c.date, trigger: c.trigger,
      ...v, culprit: c.culprit[v.verdict] || c.culprit.change, suspects, timeline, events: ev, fix: c.fix[v.verdict] || c.fix.change,
      files, roots, plain_fix: '', vendor: c.vendor,
      window: { label: tsList.length ? span(Math.max(...tsList) - Math.min(...tsList)) : '—', events: timeline.length, sources: [...new Set(timeline.map((e) => e.source))] },
    };
  }

  // ------------------------------------------------------------------ case builders
  async function branchCase(b) {
    const ev = {};
    const run = b.first;
    const detail = await failureDetail(run, ev);
    let changed = [], commits = [];
    if (b.prevGood && b.prevGood.head_sha !== run.head_sha) {
      try {
        const cmp = await gh.api(`/repos/${owner}/${name}/compare/${b.prevGood.head_sha}...${run.head_sha}`);
        commits = (cmp.commits || []).slice(-15);
        changed = (cmp.files || []).slice(0, 300).map((f) => ({ path: f.filename, ...splitPatch(f.patch) }));
      } catch (e) { warnings.push(`Compare ${short(b.prevGood.head_sha)}...${short(run.head_sha)}: ${e.message}`); }
    }
    const goodId = b.prevGood ? runEv(ev, b.prevGood) : null;
    commits.forEach((c) => { ev[`c-${c.sha}`] = { id: `c-${c.sha}`, ts: c.commit.author?.date || c.commit.committer?.date, source: 'github', kind: 'commit', summary: `${c.author?.login || c.commit.author?.name} committed "${c.commit.message.split('\n')[0].slice(0, 120)}"`, raw: c.commit.message, url: c.html_url }; });
    const evIds = (f) => { const id = `file-${f.path}`; ev[id] ||= { id, ts: run.created_at, source: 'diff', kind: 'diff', summary: `${f.path} (+${f.added.length} −${f.removed.length})`, raw: [...f.removed.slice(0, 20).map((l) => `- ${l}`), ...f.added.slice(0, 40).map((l) => `+ ${l}`)].join('\n'), url: `${repoUrl}/compare/${short(b.prevGood?.head_sha)}...${short(run.head_sha)}` }; return id; };
    changed.forEach(evIds);
    if (b.fixedBy) runEv(ev, b.fixedBy);
    const authors = [...new Set(commits.map((c) => c.author?.login || c.commit.author?.name))];
    const sameRe = b.prevGood && b.prevGood.head_sha === run.head_sha ? { id: goodId, label: 'just before, on the run before this one' } : runs.find((r) => r.workflow_id === run.workflow_id && r.head_sha === run.head_sha && r.conclusion === 'success' && r.id !== run.id) ? (() => { const r = runs.find((x) => x.workflow_id === run.workflow_id && x.head_sha === run.head_sha && x.conclusion === 'success' && x.id !== run.id); return { id: runEv(ev, r), label: 'in another run' }; })() : null;
    const elsewhere = runs.filter((r) => r.id !== run.id && FAIL.has(r.conclusion) && Math.abs(ts(r.created_at) - ts(run.created_at)) < 2 * 3600e3 && (r.workflow_id !== run.workflow_id || r.head_sha !== run.head_sha) && !b.fails.includes(r));
    const header = !b.prevGood
      ? clue('change', 0, `${b.wf} was already failing at the start of the history Narc read (${runs.length} runs), so the last good commit is unknown.`, [detail.runId])
      : sameRe ? clue('change', -2, `The code did not change: ${b.wf} passed and failed on the same commit ${short(run.head_sha)}.`, [goodId, detail.runId])
      : clue('change', 2, `${b.wf} passed on ${short(b.prevGood.head_sha)} and failed on the very next run, after ${commits.length || 'new'} commit${commits.length === 1 ? '' : 's'}${authors.length ? ` by ${authors.slice(0, 3).join(', ')}` : ''}.`, [goodId, ...commits.slice(-3).map((c) => `c-${c.sha}`), detail.runId]);
    const ch = changeClues({ detail, changed, ev, header });
    if (b.prevGood && !sameRe && changed.length && !ch.hit) {
      const others = runs.filter((r) => r.head_sha === run.head_sha && r.workflow_id !== run.workflow_id && r.conclusion);
      if (others.length && others.every((r) => r.conclusion === 'success')) ch.clues.push(clue('change', 1, `Every other workflow passed on the same commit, so the break is specific to what ${b.wf} checks.`, others.slice(0, 4).map((r) => runEv(ev, r))));
    }
    const vd = await vendorClues({ run, detail, sameCodePassed: sameRe, elsewhere, ev });
    const texts = commits.map((c) => ({ id: `c-${c.sha}`, text: c.commit.message, where: `Commit ${short(c.sha)}'s message` }));
    const at = await attackClues({ changed, texts, outsider: false, who: authors.length === 1 ? authors[0] : 'the change', ev, evIds });
    const suspects = { change: ch.clues, vendor: vd.clues, attack: at };
    const last = commits[commits.length - 1];
    const culpritCommit = ch.hit ? `the change to ${ch.hit.file}` : last ? `commit ${short(last.sha)} by ${last.author?.login || last.commit.author?.name} ("${last.commit.message.split('\n')[0].slice(0, 70)}")` : `the commits before ${short(run.head_sha)}`;
    const ongoing = !b.fixedBy;
    const range = b.prevGood ? `${repoUrl}/compare/${short(b.prevGood.head_sha)}...${short(run.head_sha)}` : run.html_url;
    return finish({
      kind: 'branch', title: `${b.wf} broke on ${def}`, date: run.created_at.slice(0, 10),
      question: `${b.wf} went red on ${def}. Was it a commit, ${vd.vendor}, or an attack?`,
      story: `${b.wf} failed on ${def} at ${run.created_at.replace('T', ' ').slice(0, 16)} UTC${detail.failedJobs.length ? `: ${detail.failedJobs.length} job${detail.failedJobs.length > 1 ? 's' : ''} failed${detail.steps.length ? ` at "${detail.steps.slice(0, 2).join('", "')}"` : ''}` : ''}. ${ongoing ? `It is still failing (${b.fails.length} red run${b.fails.length > 1 ? 's' : ''} in a row).` : `It went green again ${span(ts(b.fixedBy.created_at) - ts(run.created_at))} later, after ${b.fails.length} red run${b.fails.length > 1 ? 's' : ''}.`}`,
      trigger: { url: run.html_url, workflow: b.wf, sha: run.head_sha, run: run.run_number, compare: range },
      changed, vendor: vd.vendor,
      culprit: { change: culpritCommit, vendor: `${vd.vendor}${vd.what ? `: ${vd.what}` : ''}`, attack: `a malicious change in ${culpritCommit}` },
      fix: {
        change: [ongoing ? `Still broken: fix or revert ${culpritCommit} (${range}).` : `Already fixed by ${short(b.fixedBy.head_sha)}: ${b.fixedBy.html_url}`, ...(ch.hit ? [`Start with \`${ch.hit.file}\`: the failure points there.`] : []), `Add a required status check for ${b.wf} so a red run can't land on ${def} again.`],
        vendor: [`Don't revert anything: none of the commits caused this.`, ongoing ? `Re-run ${run.html_url} once ${vd.vendor} recovers.` : `It recovered on its own (${b.fixedBy.html_url}).`, `Add retries to the "${detail.steps[0] || 'failing'}" step so ${vd.vendor} hiccups don't turn ${def} red.`],
        attack: [`Revert ${culpritCommit} now: ${range}.`, 'Rotate every secret the workflow can read (repo and org secrets).', 'Require review from code owners for .github/workflows and dependency files.'],
      },
    }, suspects, ev);
  }

  async function prCase({ pr, first: run, failed, all }) {
    const ev = {};
    const detail = await failureDetail(run, ev);
    const changed = (pr.diff || []).map((f) => ({ path: f.path, added: f.added, removed: f.removed }));
    const evIds = (f) => { const id = `file-${f.path}`; ev[id] ||= { id, ts: pr.created, source: 'diff', kind: 'diff', summary: `${f.path} (+${f.added.length} −${f.removed.length})`, raw: [...f.removed.slice(0, 20).map((l) => `- ${l}`), ...f.added.slice(0, 40).map((l) => `+ ${l}`)].join('\n'), url: `${pr.url}/files` }; return id; };
    changed.forEach(evIds);
    ev[`pr-${pr.number}`] = { id: `pr-${pr.number}`, ts: pr.created, source: 'github', kind: 'pr', summary: `@${pr.author} opened PR #${pr.number} "${pr.title}" (${(pr.association || '').toLowerCase().replace(/_/g, ' ') || 'unknown'})`, raw: pr.body.slice(0, 3000), url: pr.url };
    const onMain = runs.filter((r) => r.workflow_id === run.workflow_id && r.conclusion).pop();
    const mainId = onMain ? runEv(ev, onMain) : null;
    const header = onMain?.conclusion === 'success'
      ? clue('change', 2, `${run.name} fails on this PR but passes on ${def} right now, so the difference is the PR's own change.`, [detail.runId, mainId, `pr-${pr.number}`])
      : onMain && FAIL.has(onMain.conclusion) ? clue('change', -1, `${run.name} is failing on ${def} too, so the PR may just inherit a broken base.`, [detail.runId, mainId])
      : clue('change', 1, `${run.name} fails on this PR's latest commit.`, [detail.runId, `pr-${pr.number}`]);
    const ch = changeClues({ detail, changed, ev, header });
    const othersOk = all.filter((r) => r.conclusion === 'success');
    if (!ch.hit && failed.length === 1 && othersOk.length) ch.clues.push(clue('change', 1, `${othersOk.length} other workflow${othersOk.length > 1 ? 's' : ''} pass on the same commit; only ${run.name} fails.`, othersOk.slice(0, 4).map((r) => runEv(ev, r))));
    const elsewhere = runs.filter((r) => FAIL.has(r.conclusion) && Math.abs(ts(r.created_at) - ts(run.created_at)) < 2 * 3600e3);
    const vd = await vendorClues({ run, detail, sameCodePassed: null, elsewhere, ev });
    const outsider = OUTSIDER.has(pr.association);
    const at = await attackClues({ changed, texts: [{ id: `pr-${pr.number}`, text: pr.body, where: `PR #${pr.number}'s description` }], outsider, who: `@${pr.author}`, ev, evIds });
    const suspects = { change: ch.clues, vendor: vd.clues, attack: at };
    return finish({
      kind: 'pr', title: `PR #${pr.number} fails ${run.name}`, date: run.created_at.slice(0, 10),
      question: `"${pr.title}" by @${pr.author} is red. Is it the PR's code, ${vd.vendor}, or something malicious?`,
      story: `${run.name} fails on PR #${pr.number}'s latest commit ${short(pr.sha)}${detail.failedJobs.length ? ` (${detail.failedJobs.length} failed job${detail.failedJobs.length > 1 ? 's' : ''}${detail.steps.length ? `, step "${detail.steps[0]}"` : ''})` : ''}. ${failed.length > 1 ? `${failed.length} workflows fail on it in total.` : ''}`,
      trigger: { url: run.html_url, workflow: run.name, sha: pr.sha, run: run.run_number, pr: pr.number, prUrl: pr.url },
      changed, vendor: vd.vendor,
      culprit: { change: `PR #${pr.number} "${pr.title}" by @${pr.author}${ch.hit ? `, in ${ch.hit.file}` : ''}`, vendor: `${vd.vendor}${vd.what ? `: ${vd.what}` : ''}`, attack: `PR #${pr.number} by @${pr.author}` },
      fix: {
        change: [`Ask @${pr.author} to fix ${ch.hit ? `\`${ch.hit.file}\`` : 'the failing check'} before merging: ${run.html_url}`, `Don't merge PR #${pr.number} while ${run.name} is red.`],
        vendor: [`The PR's code is probably fine: re-run ${run.html_url} once ${vd.vendor} recovers.`],
        attack: [`Don't merge PR #${pr.number}, and don't approve its workflow runs.`, 'Check whether its workflows already ran with secrets; rotate any they could read.', 'Require maintainer approval for workflow runs from outside contributors (Settings → Actions).'],
      },
    }, suspects, ev);
  }
}

function splitPatch(patch) {
  const added = [], removed = [];
  for (const l of String(patch || '').split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) added.push(l.slice(1));
    else if (l.startsWith('-') && !l.startsWith('---')) removed.push(l.slice(1));
  }
  return { added, removed };
}

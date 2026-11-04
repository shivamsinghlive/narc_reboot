/* Narc — tech-debt radar UI (vanilla JS + d3) */
(() => {
  'use strict';

  /* =====================================================================
     Utilities
     ===================================================================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => (n == null ? '—' : n >= 1e5 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
  const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;
  const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('narc.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('narc.' + k, JSON.stringify(v)); } catch {} },
  };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  /* =====================================================================
     Icons (24px stroke icons)
     ===================================================================== */
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>', 'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    sparkles: '<path d="M11 3 9.5 8.5 4 10l5.5 1.5L11 17l1.5-5.5L18 10l-5.5-1.5z"/><path d="M19 15l-.7 2.3L16 18l2.3.7L19 21l.7-2.3L22 18l-2.3-.7z"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    network: '<rect x="9" y="2.5" width="6" height="5" rx="1.2"/><rect x="2.5" y="16.5" width="6" height="5" rx="1.2"/><rect x="15.5" y="16.5" width="6" height="5" rx="1.2"/><path d="M12 7.5v4M5.5 16.5V14a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2.5"/>',
    pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4M13 3.5 10.5 6 13 8.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3.5-.5-6 1-8.5z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    upload: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    arrows: '<path d="M16 3.5 20 7.5l-4 4M20 7.5H5M8 20.5l-4-4 4-4M4 16.5h15"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 1 1 1-9.9A6 6 0 0 1 19.4 11 4 4 0 0 1 17.5 19z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>',
    flask: '<path d="M9 3h6M10 3v6L4.6 18.5A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.4 7.5 9.5 4.3-1.1 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-2.5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
    commit: '<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5M15.5 12H21"/>',
    merge: '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 7.5v9M6 7.5a8 8 0 0 0 9.5 4.5"/>',
    package: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M9 4.5 10 7M15 4.5 14 7M3 13h4M17 13h4M4 19l3-2M20 19l-3-2M4 8l3 2M20 8l-3 2"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    cycle: '<path d="M20 11a8 8 0 0 0-14.6-4M4 13a8 8 0 0 0 14.6 4"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  };
  const svgIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  const icon = (name, cls = '') => `<i data-icon="${name}" class="${cls}">${svgIcon(name)}</i>`;
  const hydrate = (root = document) => $$('i[data-icon]:empty', root).forEach((el) => (el.innerHTML = svgIcon(el.dataset.icon)));
  const LAYER_ICON = { ui: 'monitor', api: 'arrows', ai: 'sparkles', service: 'cpu', integrations: 'plug', data: 'database', shared: 'layers', infra: 'cloud', config: 'sliders', tests: 'flask' };

  /* =====================================================================
     Debt bands — status colour + label + shape (never colour alone)
     ===================================================================== */
  const BANDS = [
    { id: 'healthy', label: 'Healthy', max: 30, v: '--good', shape: '<circle cx="5" cy="5" r="4.5"/>' },
    { id: 'watch', label: 'Watch', max: 50, v: '--warn', shape: '<path d="M5 .3 9.7 5 5 9.7.3 5z"/>' },
    { id: 'risk', label: 'At risk', max: 70, v: '--serious', shape: '<path d="M5 .6 9.7 9.4H.3z"/>' },
    { id: 'critical', label: 'Critical', max: 101, v: '--crit', shape: '<path d="M3.1.3h3.8l2.8 2.8v3.8L6.9 9.7H3.1L.3 6.9V3.1z"/>' },
  ];
  const band = (v) => BANDS.find((b) => (v ?? 0) < b.max) || BANDS[3];
  const bandColor = (v) => `var(${band(v).v})`;
  const bandBadge = (v, withScore = false) => { const b = band(v); return `<span class="band ${b.id}"><svg viewBox="0 0 10 10">${b.shape}</svg>${b.label}${withScore ? ` · ${Math.round(v)}` : ''}</span>`; };
  const bandDot = (v, size = 10) => { const b = band(v); return `<svg width="${size}" height="${size}" viewBox="0 0 10 10" style="fill:var(${b.v});flex-shrink:0" aria-label="${b.label}">${b.shape}</svg>`; };
  const deltaHtml = (a, b, suffix = '') => { const d = Math.round(b - a); return `<span class="delta ${d > 0 ? 'worse' : d < 0 ? 'better' : 'flat'}">${d > 0 ? '▲' : d < 0 ? '▼' : '='}${d ? Math.abs(d) : ''}${suffix}</span>`; };
  const sevBars = (s) => `<span class="sev s${s}" title="Severity ${s} of 5" aria-label="Severity ${s} of 5"><i></i><i></i><i></i><i></i><i></i></span>`;
  const COMPONENTS = [
    { key: 'static', label: 'Existing code', v: '--c-static' },
    { key: 'drift', label: 'Interest (drift)', v: '--c-drift' },
    { key: 'pending', label: 'Unmerged PRs', v: '--c-pending' },
    { key: 'backlog', label: 'Planned work', v: '--c-backlog' },
    { key: 'inherited', label: 'Inherited from deps', v: '--c-inherited' },
  ];

  /* =====================================================================
     State
     ===================================================================== */
  const S = { data: null, page: 'overview', sel: null, day: 0, colorBy: 'total', support: true, drill: null, panelTab: 'summary', deep: {}, job: null, live: false, prFilter: { q: '', advice: 'all', layer: null }, blFilter: { q: '', kind: 'all' }, sub: { security: 'posture', people: 'people', timeline: 'changes', report: 'briefing' }, secFilter: { q: '', cat: 'all', sev: 0, ep: 'all' }, open: new Set(), closed: new Set(), agentsLive: {}, tech: new Map(), statusP: 0 };
  const L = (id) => S.data?.layers.find((l) => l.id === id);
  const lname = (id) => L(id)?.name || id;
  const lchip = (id, clickable = true) => `<${clickable ? 'button' : 'span'} class="lchip" ${clickable ? `data-goto-layer="${id}"` : ''}>${icon(LAYER_ICON[id] || 'layers')}${esc(lname(id))}</${clickable ? 'button' : 'span'}>`;
  const dayLabel = (k) => (S.data.days[k] === 0 ? 'Today' : `+${S.data.days[k]} days`);
  const lastK = () => S.data.days.length - 1;
  const inMod = (path, m) => path.startsWith(m.path + '/') || path.replace(/\.\w+$/, '') === m.path;

  /* =====================================================================
     Toasts
     ===================================================================== */
  function toast(msg, { err = false, action = null, ms = 3500 } = {}) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.innerHTML = `${icon(err ? 'alert' : 'check')}<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    if (action) $('button', t).onclick = () => { action.fn(); t.remove(); };
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), err ? 7000 : ms);
  }

  /* =====================================================================
     Theme
     ===================================================================== */
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  const effectiveTheme = () => document.documentElement.dataset.theme || (sysDark.matches ? 'dark' : 'light');
  function setTheme(t) {
    store.set('theme', t);
    if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    $('#themeBtn').innerHTML = icon(effectiveTheme() === 'dark' ? 'sun' : 'moon');
    $$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.themeOpt === t));
  }
  sysDark.addEventListener?.('change', () => { if (store.get('theme', 'system') === 'system') setTheme('system'); });

  /* =====================================================================
     Settings
     ===================================================================== */
  const FIELDS = { sTavilyKey: 'tavilyKey', sExaKey: 'exaKey', sOpenaiKey: 'openaiKey', sModel: 'model', sFastModel: 'fastModel', sBaseUrl: 'openaiBaseUrl', sGithubToken: 'githubToken', sMaxPRs: 'maxPRs', sJiraSite: 'jiraSite', sJiraEmail: 'jiraEmail', sJiraToken: 'jiraToken', sJiraJql: 'jiraJql', sDoc: 'docText' };
  let health = {};
  const settings = () => Object.fromEntries(Object.values(FIELDS).map((k) => [k, store.get(k, '')]));
  function fillSettings() {
    for (const [id, k] of Object.entries(FIELDS)) $('#' + id).value = store.get(k, id === 'sMaxPRs' ? 12 : '');
    $('#sIssues').checked = store.get('includeIssues', true);
    $('#sDocName').textContent = store.get('docName', '');
    $$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.themeOpt === store.get('theme', 'system')));
  }
  function openSheet() { fillSettings(); $('#sheet').classList.add('open'); $('#sheetBg').hidden = false; $('#sheet').setAttribute('aria-hidden', 'false'); setTimeout(() => $('#sOpenaiKey').focus(), 50); }
  function closeSheet() { $('#sheet').classList.remove('open'); $('#sheetBg').hidden = true; $('#sheet').setAttribute('aria-hidden', 'true'); }
  function saveSheet() {
    for (const [id, k] of Object.entries(FIELDS)) store.set(k, $('#' + id).value.trim());
    store.set('includeIssues', $('#sIssues').checked);
    closeSheet(); renderAiNote(); toast('Settings saved');
  }
  const aiOn = () => !!(store.get('openaiKey', '') || health.openai);
  function renderAiNote() {
    $('#aiNote').innerHTML = aiOn()
      ? `<span class="dot"></span> AI review on · ${esc(store.get('model', '') || health.model || 'gpt-5-mini')}`
      : `<span class="dot off"></span> AI review off. Static analysis still runs. <button id="aiNoteSet">Add an OpenAI key</button>`;
    $('#aiNoteSet')?.addEventListener('click', openSheet);
  }

  /* =====================================================================
     Views & navigation
     ===================================================================== */
  function setView(v) {
    $('#app').dataset.view = v;
    $('#landing').hidden = v !== 'landing'; $('#analyzing').hidden = v !== 'analyzing'; $('#dash').hidden = v !== 'dash';
    if (v === 'landing') renderRecent();
    renderCrumb();
  }
  function setPage(p) {
    if (!S.data) return;
    S.page = p;
    $$('.nav-item').forEach((b) => { b.classList.toggle('on', b.dataset.page === p); b.setAttribute('aria-selected', b.dataset.page === p); });
    $$('.page').forEach((el) => el.classList.toggle('on', el.dataset.page === p));
    if (p === 'arch') requestAnimationFrame(() => { if (!G.rendered) graphRender(); else if (!G.userZoomed) G.fit(false); });
    if (p === 'overview') { renderOverview(); hydrate($('#page-overview')); }
    if (p === 'hotspots') { renderHotspots(); hydrate($('#page-hotspots')); }
    if (p === 'security') renderSecurity(); if (p === 'people') renderPeople(); if (p === 'timeline') renderTimeline(); if (p === 'report') renderReport();
    $('.content').scrollTop = 0;
  }
  function renderCrumb() {
    const d = S.data, el = $('#topCrumb');
    if (!d || $('#app').dataset.view !== 'dash') { el.innerHTML = ''; return; }
    el.innerHTML = `<span class="sep">/</span><a class="repo" href="${esc(d.repo.url)}" target="_blank" rel="noopener" title="Open on GitHub">${esc(d.repo.fullName)}${icon('external')}</a>${d.demo ? '<span class="pill">demo data</span>' : ''}<span class="pill ${d.mode === 'ai' ? 'accent' : ''}">${d.mode === 'ai' ? `${icon('sparkles')} ${esc(d.model)}` : 'static analysis'}</span>`;
  }

  /* =====================================================================
     Analysis flow (streaming)
     ===================================================================== */
  const STEPS = [
    ['meta', 'Read repository'], ['source', 'Download source, PRs and backlog'], ['parse', 'Measure files and parse imports'],
    ['layers', 'Check layer boundaries', true], ['graph', 'Build dependency graph'], ['security', 'Scan security, CVEs and attack surface'], ['prs', 'Score unmerged PRs'],
    ['ai', 'AI agents: PR review, backlog, threat model', true], ['summary', 'Write executive summary', true],
  ];
  let stepT = {};
  function parseRepo(input) {
    const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
    const m = s.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    return m ? `${m[1]}/${m[2]}` : null;
  }
  async function analyze(input) {
    const repo = parseRepo(input);
    if (!repo) { setView('landing'); $('#heroError').hidden = false; $('#heroError').textContent = 'Enter a GitHub repository, like github.com/owner/repo or owner/repo.'; $('#heroInput').focus(); return; }
    $('#heroError').hidden = true; closePalette();
    const st = settings();
    const payload = {
      repoUrl: `https://github.com/${repo}`, openaiKey: st.openaiKey, model: st.model, fastModel: st.fastModel, tavilyKey: st.tavilyKey, exaKey: st.exaKey, openaiBaseUrl: st.openaiBaseUrl, githubToken: st.githubToken, maxPRs: +st.maxPRs || 12,
      includeIssues: store.get('includeIssues', true), docText: st.docText, docName: store.get('docName', '') || 'Design doc',
      jira: { site: st.jiraSite, email: st.jiraEmail, token: st.jiraToken, jql: st.jiraJql },
    };
    showAnalyzing(repo);
    try {
      const r = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      history.replaceState(null, '', `?job=${j.id}#${repo}`);
      attach(j.id);
    } catch (e) { analysisError(e.message); }
  }
  function showAnalyzing(repo) {
    S.live = true; stepT = {};
    $('#anTitle').textContent = `Analyzing ${repo}`;
    const ai = aiOn();
    $('#anSub').textContent = ai ? 'Static analysis first, then AI review' : 'Static analysis (AI review is off)';
    $('#anSteps').innerHTML = STEPS.filter(([, , needsAi]) => ai || !needsAi).map(([k, t]) => `<li data-k="${k}"><span class="ic"></span><span>${t}</span><span class="t"></span></li>`).join('');
    $('#anError').hidden = true; $('#anFoot').hidden = false;
    setView('analyzing');
  }
  function attach(id) {
    S.job = id; S.live = true; S.agentsLive = {};
    let gotData = false;
    const es = new EventSource(`/api/jobs/${id}/stream`);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.type === 'progress') onProgress(ev);
      else if (ev.type === 'agent') onAgent(ev);
      else if (ev.type === 'partial') {
        const first = !gotData; gotData = true;
        load(ev.result, { keep: !first });
        if (first) { setView('dash'); setPage('overview'); }
        S.statusP = ev.phase === 'static' ? 0.15 : 0.85;
        setStatus({ text: liveStatusText() || (ev.phase === 'static' ? 'AI agents working' : 'AI writing summary'), p: S.statusP });
        if (!first) toast('AI reviews are in. PR and backlog debt updated.');
      } else if (ev.type === 'done') {
        es.close(); S.live = false;
        const first = !gotData;
        load(ev.result, { keep: !first });
        if (first) { setView('dash'); setPage('overview'); }
        setStatus(null); saveRecent(ev.result); renderSidebar();
        if (!first) toast(ev.result.mode === 'ai' ? 'AI analysis complete' : 'Analysis complete');
      } else if (ev.type === 'error') {
        es.close(); S.live = false; setStatus(null);
        if (gotData) toast(ev.message, { err: true }); else analysisError(ev.message);
      }
    };
    es.onerror = () => { es.close(); if (S.live && !gotData) analysisError('Lost connection to the Narc server. Is it still running?'); };
  }
  function onProgress(ev) {
    const items = $$('#anSteps li'); const idx = items.findIndex((li) => li.dataset.k === ev.stage);
    if (idx >= 0) {
      items.forEach((li, i) => {
        if (i < idx && !li.classList.contains('ok')) { li.classList.remove('on'); li.classList.add('ok'); const k = li.dataset.k; if (stepT[k]) $('.t', li).textContent = `${((Date.now() - stepT[k]) / 1000).toFixed(1)}s`; }
        if (i === idx && !li.classList.contains('on')) { li.classList.add('on'); stepT[li.dataset.k] = Date.now(); }
      });
      const li = items[idx]; let dd = $('.d', li); if (!dd) { dd = document.createElement('span'); dd.className = 'd'; li.appendChild(dd); }
      dd.textContent = ev.message + (ev.total ? ` (${ev.done || 0}/${ev.total})` : '');
    }
    if (S.data && S.live && (ev.stage === 'ai' || ev.stage === 'summary')) {
      const p = ev.stage === 'summary' ? 0.85 : 0.15 + 0.65 * ((ev.done || 0) / (ev.total || 1));
      S.statusP = p;
      setStatus({ text: liveStatusText() || (ev.stage === 'summary' ? 'AI writing summary' : `AI reviewing · ${ev.done || 0}/${ev.total || 0} PRs`), p });
    }
  }
  function setStatus(s) {
    const el = $('#topStatus');
    if (!s) { el.hidden = true; return; }
    el.hidden = false; el.title = 'Open the AI agents board'; el.innerHTML = `<span class="spinner"></span>${icon('bot')}${esc(s.text)}<span class="bar"><i style="width:${Math.round(s.p * 100)}%"></i></span>`;
  }
  function analysisError(msg) {
    setView('analyzing');
    $$('#anSteps li.on').forEach((li) => li.classList.remove('on'));
    $('#anFoot').hidden = true;
    const rate = /rate limit|private|404/i.test(msg);
    $('#anError').hidden = false;
    $('#anError').innerHTML = `<b>Analysis failed.</b> ${esc(msg)}<div class="btns"><button class="btn sm" id="anBack">${icon('arrow-left')} Back</button>${rate ? `<button class="btn sm primary" id="anSet">Add GitHub token</button>` : ''}</div>`;
    $('#anBack').onclick = () => { setView('landing'); history.replaceState(null, '', location.pathname); };
    $('#anSet')?.addEventListener('click', openSheet);
  }
  async function loadDemo() {
    closePalette();
    const r = await fetch('/api/demo'); const d = await r.json();
    S.live = false; setStatus(null);
    load(d); setView('dash'); setPage('overview'); history.replaceState(null, '', '#demo');
  }

  function saveRecent(d) {
    if (d.demo) return;
    const list = store.get('recent', []).filter((x) => x.repo !== d.repo.fullName);
    list.unshift({ repo: d.repo.fullName, index: d.summary.index, index90: d.summary.index90, at: new Date().toISOString(), mode: d.mode });
    store.set('recent', list.slice(0, 6));
  }
  function renderRecent() {
    const list = store.get('recent', []);
    $('#recent').hidden = !list.length;
    $('#recentList').innerHTML = list.map((x) => `<button class="recent-item" data-repo="${esc(x.repo)}"><div><b>${esc(x.repo)}</b> <span class="muted">· ${x.mode === 'ai' ? 'AI' : 'static'}</span></div><span>${bandBadge(x.index, true)} ${deltaHtml(x.index, x.index90, ' in 90d')}</span><span class="when">${ago(x.at)}</span></button>`).join('');
    $$('#recentList [data-repo]').forEach((b) => b.addEventListener('click', () => analyze(b.dataset.repo)));
  }

  /* =====================================================================
     Load data & render everything
     ===================================================================== */
  function load(data, { keep = false } = {}) {
    const prev = S.data;
    S.data = data;
    if (!keep || !prev) { S.sel = null; S.day = 0; S.drill = null; S.deep = {}; G.userZoomed = false; }
    else if (S.sel?.type === 'layer' && !L(S.sel.id)) S.sel = null;
    if (S.drill && !L(S.drill)) S.drill = null;
    $('#daySlider').max = lastK();
    S.day = Math.min(S.day, lastK());
    renderTicks(); renderCrumb(); renderSidebar(); renderNavCounts();
    S.tech = new Map();
    (data.security?.mitre || []).forEach((t) => S.tech.set(t.id, t));
    (data.security?.threats?.scenarios || []).forEach((sc) => sc.techniques?.forEach((t) => !S.tech.has(t.id) && S.tech.set(t.id, t)));
    renderOverview(); renderSecurity(); renderPRs(); renderBacklog(); renderHotspots(); renderPeople(); renderTimeline(); renderReport();
    G.rendered = false;
    if (S.page === 'arch' && $('#app').dataset.view === 'dash') graphRender({ keepZoom: keep });
    setDay(S.day, { quiet: true });
    renderPanel();
    hydrate();
  }

  function renderNavCounts() {
    $('#navPrs').textContent = S.data.prs.length || '';
    $('#navBacklog').textContent = S.data.backlog.tasks.length || '';
    const sc = S.data.security; $('#navSec').innerHTML = sc ? `${bandDot(sc.score, 8)}` : '';
    $('#navPeople').textContent = S.data.people?.contributors?.length || '';
  }
  function renderSidebar() {
    const d = S.data; if (!d) return; const k = S.day;
    const ls = [...d.layers].sort((a, b) => b.series[k].total - a.series[k].total);
    $('#sideDay').textContent = k ? `+${d.days[k]}d` : 'today';
    $('#sideLayers').innerHTML = ls.map((l) => `<button class="side-layer ${S.sel?.type === 'layer' && S.sel.id === l.id ? 'on' : ''}" data-goto-layer="${l.id}" title="${esc(l.name)}: ${band(l.series[k].total).label}">${icon(LAYER_ICON[l.id])}<span class="nm">${esc(l.name)}</span><span style="display:flex;align-items:center;gap:6px">${bandDot(l.series[k].total)}<span class="score">${l.series[k].total}</span></span></button>`).join('');
    const s = d.stats || {};
    $('#sideFoot').innerHTML = `${d.mode === 'ai' ? esc(d.model) : 'Static analysis'}${S.live ? ' · <span style="color:var(--accent)">AI running…</span>' : ''}<br>${fmt(s.analysedFiles)} files${s.seconds != null ? ` · ${s.seconds}s` : ''}${d.usage?.cached ? ` · ${d.usage.cached} cached` : ''}`;
  }

  /* =====================================================================
     Timeline
     ===================================================================== */
  function renderTicks() { $('#tlTicks').innerHTML = S.data.days.map((d, i) => `<button data-day="${i}">${d === 0 ? 'Today' : `+${d}d`}</button>`).join(''); }
  function setDay(k, { quiet = false } = {}) {
    S.day = Math.max(0, Math.min(lastK(), +k));
    const sl = $('#daySlider'); sl.value = S.day; sl.style.setProperty('--p', `${(S.day / lastK()) * 100}%`);
    $$('#tlTicks button').forEach((b) => b.classList.toggle('on', +b.dataset.day === S.day));
    $('#tlDay').textContent = dayLabel(S.day);
    const v = S.data.summary.series[S.day]; $('#tlIndex').innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px">${bandDot(v, 12)}${v}</span>`;
    renderSidebar();
    if (G.rendered) G.paint();
    if (!quiet) renderPanel({ soft: true });
  }
  let playT = null;
  function togglePlay() {
    if (playT) { clearInterval(playT); playT = null; $('#playBtn').innerHTML = icon('play'); return; }
    if (S.day >= lastK()) setDay(0);
    $('#playBtn').innerHTML = icon('pause');
    playT = setInterval(() => { if (S.day >= lastK()) return togglePlay(); setDay(S.day + 1); }, 650);
  }

  /* =====================================================================
     Architecture graph (d3)
     ===================================================================== */
  const W = 236, H = 96;
  const TIERS = [
    { label: 'Presentation', ids: ['ui'] }, { label: 'Interface', ids: ['api'] }, { label: 'Domain & AI', ids: ['ai', 'service'] },
    { label: 'Integrations & data', ids: ['integrations', 'data'] }, { label: 'Foundation', ids: ['shared'] },
  ];
  const SUPPORT = ['tests', 'infra', 'config'];
  const G = { rendered: false, userZoomed: false };

  function metricOf(l, k) {
    const s = l.series[k];
    if (S.colorBy === 'pending') return { v: Math.min(100, s.pending * 2.5), text: `+${Math.round(s.pending)}`, sub: 'from PRs' };
    if (S.colorBy === 'inherited') return { v: Math.min(100, s.inherited * 4), text: `+${Math.round(s.inherited)}`, sub: 'inherited' };
    if (S.colorBy === 'security') { const v = l.security?.score ?? 0; return { v, text: String(v), sub: `${l.security?.findings || 0} findings · ${l.security?.vulns || 0} CVEs` }; }
    return { v: s.total, text: String(s.total), sub: '' };
  }

  function computeLayout(layers, edges) {
    const present = new Set(layers.map((l) => l.id));
    const rows = TIERS.map((t) => ({ ...t, ids: t.ids.filter((id) => present.has(id)) })).filter((r) => r.ids.length);
    const extra = layers.filter((l) => !TIERS.some((t) => t.ids.includes(l.id)) && !SUPPORT.includes(l.id)).map((l) => l.id);
    if (extra.length) rows.push({ label: 'Other', ids: extra });
    const DX = 290, DY = 160, pos = {};
    const nb = (id) => edges.filter((e) => e.source === id || e.target === id).map((e) => (e.source === id ? e.target : e.source));
    rows.forEach((r, i) => {
      if (i > 0 && r.ids.length > 1) {
        const bc = (id) => { const xs = nb(id).filter((n) => pos[n]).map((n) => pos[n].x); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
        r.ids.sort((a, b) => bc(a) - bc(b));
      }
      r.ids.forEach((id, j) => (pos[id] = { x: (j - (r.ids.length - 1) / 2) * DX, y: i * DY }));
      r.y = i * DY;
    });
    const xs = Object.values(pos).map((p) => p.x);
    const maxX = Math.max(0, ...xs), minX = Math.min(0, ...xs);
    const support = S.support ? SUPPORT.filter((id) => present.has(id)) : [];
    const sx = maxX + W + 120;
    const totalH = Math.max(0, (rows.length - 1) * DY);
    const step = support.length > 1 ? Math.max(H + 28, totalH / (support.length - 1)) : 0;
    const span = step * Math.max(0, support.length - 1);
    const sy0 = Math.max(0, (totalH - span) / 2);
    support.forEach((id, i) => (pos[id] = { x: sx, y: sy0 + i * step }));
    return { pos, rows, minX, maxX, support, sx };
  }

  function graphRender({ keepZoom = false } = {}) {
    if (!S.data || typeof d3 === 'undefined') return;
    const svgEl = $('#graph');
    const prevT = keepZoom && G.zoom && G.userZoomed ? d3.zoomTransform(svgEl) : null;
    if (!keepZoom) G.userZoomed = false;
    const svg = d3.select(svgEl); svg.selectAll('*').remove();
    const defs = svg.append('defs');
    for (const [id, v] of [['a-def', '--edge'], ['a-up', '--up'], ['a-down', '--down'], ['a-bad', '--crit'], ['a-hot', '--text-2']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5).attr('markerWidth', 7).attr('markerHeight', 7).attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0 1 L9 5 L0 9 z').attr('style', `fill:var(${v})`);
    }
    const root = svg.append('g').attr('class', 'viewport');
    G.zoom = d3.zoom().scaleExtent([0.2, 2.5]).on('zoom', (e) => { root.attr('transform', e.transform); if (e.sourceEvent) G.userZoomed = true; hideTip(); });
    svg.call(G.zoom).on('dblclick.zoom', null);
    svg.on('click', (e) => { if (e.target === svgEl) select(null); });
    G.root = root; G.nodeSel = null; G.edgeSel = null; G.modSel = null;
    if (S.drill) renderModuleGraph(root); else renderLayerGraph(root);
    G.rendered = true;
    renderGraphChrome(); renderMinimap();
    if (prevT) svg.call(G.zoom.transform, prevT); else G.fit(false);
    G.paint();
  }

  G.fit = (animate = true) => {
    const svgEl = $('#graph'); if (!G.root || !G.zoom) return;
    const b = G.root.node().getBBox(); const w = svgEl.clientWidth, h = svgEl.clientHeight;
    if (!b.width || !w || !h) return;
    const padTop = 64, padBottom = 160, pad = 40;
    const k = Math.min(1.2, (w - pad * 2) / b.width, (h - padTop - padBottom) / b.height);
    const tx = (w - b.width * k) / 2 - b.x * k, ty = padTop + (h - padTop - padBottom - b.height * k) / 2 - b.y * k;
    const t = d3.zoomIdentity.translate(tx, ty).scale(k);
    const sel = d3.select(svgEl);
    (animate ? sel.transition().duration(400) : sel).call(G.zoom.transform, t);
    G.userZoomed = false;
  };
  G.refit = debounce(() => { if (G.rendered && S.page === 'arch' && !G.userZoomed) G.fit(true); }, 60);

  function renderLayerGraph(root) {
    const d = S.data;
    const layers = d.layers.filter((l) => S.support || !SUPPORT.includes(l.id));
    const ids = new Set(layers.map((l) => l.id));
    const edges = d.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const lay = computeLayout(layers, edges); const { pos } = lay;

    // Tier guides
    const guides = root.append('g');
    const gx0 = lay.minX - W / 2 - 150, gx1 = lay.maxX + W / 2 + 30;
    lay.rows.forEach((r) => {
      guides.append('text').attr('class', 'g-tier-label').attr('x', gx0).attr('y', r.y + 4).text(r.label);
      guides.append('line').attr('class', 'g-tier-line').attr('x1', gx0 + 130).attr('x2', gx1).attr('y1', r.y).attr('y2', r.y);
    });
    if (lay.support.length) {
      const ys = lay.support.map((id) => pos[id].y);
      guides.append('rect').attr('class', 'g-group').attr('x', lay.sx - W / 2 - 18).attr('y', Math.min(...ys) - H / 2 - 36).attr('width', W + 36).attr('height', Math.max(...ys) - Math.min(...ys) + H + 54).attr('rx', 16);
      guides.append('text').attr('class', 'g-tier-label').attr('x', lay.sx - W / 2 - 2).attr('y', Math.min(...ys) - H / 2 - 16).text('Supporting');
    }

    // Ports: spread multiple edges along each node side
    const isSup = (id) => SUPPORT.includes(id);
    const side = (e) => {
      const a = pos[e.source], b = pos[e.target];
      if (isSup(e.source) !== isSup(e.target)) return a.x < b.x ? ['right', 'left'] : ['left', 'right'];
      if (Math.abs(a.y - b.y) < 1) return a.x < b.x ? ['right', 'left'] : ['left', 'right'];
      return b.y > a.y ? ['bottom', 'top'] : ['top', 'bottom'];
    };
    const ports = {};
    edges.forEach((e) => { const [s1, s2] = side(e); e._s = s1; e._t = s2; (ports[`${e.source}:${s1}`] ||= []).push({ e, end: 's', other: e.target }); (ports[`${e.target}:${s2}`] ||= []).push({ e, end: 't', other: e.source }); });
    for (const [key, list] of Object.entries(ports)) {
      const sd = key.split(':')[1]; const horiz = sd === 'top' || sd === 'bottom';
      list.sort((p, q) => (horiz ? pos[p.other].x - pos[q.other].x : pos[p.other].y - pos[q.other].y));
      const span = (horiz ? W : H) * 0.62, n = list.length;
      list.forEach((p, i) => { p.e[p.end === 's' ? '_so' : '_to'] = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1); });
    }
    const anchor = (id, sd, off) => { const p = pos[id]; return sd === 'top' ? [p.x + off, p.y - H / 2] : sd === 'bottom' ? [p.x + off, p.y + H / 2] : sd === 'left' ? [p.x - W / 2, p.y + off] : [p.x + W / 2, p.y + off]; };
    const pathFor = (e) => {
      const [x1, y1] = anchor(e.source, e._s, e._so || 0), [x2, y2] = anchor(e.target, e._t, e._to || 0);
      if (e._s === 'bottom') { const dy = Math.max(40, (y2 - y1) * 0.5); return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2 - 2}`; }
      if (e._s === 'top') { const dy = Math.max(40, (y1 - y2) * 0.5); return `M${x1},${y1} C${x1 + 70},${y1 - dy} ${x2 + 70},${y2 + dy} ${x2},${y2 + 2}`; }
      const dx = Math.max(50, Math.abs(x2 - x1) * 0.45) * (e._s === 'right' ? 1 : -1);
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 + (e._t === 'left' ? -2 : 2)},${y2}`;
    };
    const core = edges.filter((e) => !isSup(e.source) && !isSup(e.target));
    const maxW = Math.max(1, ...core.map((e) => e.weight));
    const eg = root.append('g').attr('class', 'edges');
    G.edgeSel = eg.selectAll('g').data(edges).join('g').each(function (e) {
      const g = d3.select(this); const dpath = pathFor(e);
      const weak = isSup(e.source) || isSup(e.target);
      g.append('path').attr('class', `g-edge ${weak ? 'weak' : ''} ${e.violation ? 'violation' : ''}`).attr('d', dpath)
        .attr('stroke-width', weak ? 1.2 : 1.4 + 3.6 * Math.sqrt(Math.min(1, e.weight / maxW)))
        .attr('marker-end', `url(#${e.violation ? 'a-bad' : 'a-def'})`);
      g.append('path').attr('class', 'g-edge-hit').attr('d', dpath)
        .on('mouseenter', (ev) => edgeTip(ev, e)).on('mousemove', (ev) => moveTip(ev)).on('mouseleave', hideTip);
      if (e.violation) {
        const p = g.select('path').node(); const m = p.getPointAtLength(p.getTotalLength() / 2);
        const b = g.append('g').attr('class', 'g-edge-badge').attr('transform', `translate(${m.x},${m.y})`).style('pointer-events', 'none');
        b.append('rect').attr('x', -8).attr('y', -8).attr('width', 16).attr('height', 16).attr('rx', 8);
        b.append('text').attr('text-anchor', 'middle').attr('y', 3.5).text('!');
      }
    });

    // Nodes
    const ng = root.append('g').attr('class', 'nodes');
    G.nodeSel = ng.selectAll('g.g-node').data(layers, (l) => l.id).join('g').attr('class', 'g-node').attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', (l) => `${l.name} layer, debt ${l.score}`)
      .attr('transform', (l) => `translate(${pos[l.id].x - W / 2},${pos[l.id].y - H / 2})`)
      .each(function (l) {
        const g = d3.select(this);
        g.append('rect').attr('class', 'halo').attr('x', -4).attr('y', -4).attr('width', W + 8).attr('height', H + 8).attr('rx', 15);
        g.append('rect').attr('class', 'shadow').attr('x', 2).attr('y', 6).attr('width', W - 4).attr('height', H - 4).attr('rx', 12);
        g.append('rect').attr('class', 'card').attr('width', W).attr('height', H).attr('rx', 12);
        g.append('rect').attr('class', 'strip').attr('x', 0).attr('y', 14).attr('width', 3).attr('height', H - 28).attr('rx', 1.5);
        g.append('svg').attr('class', 'icon').attr('x', 16).attr('y', 14).attr('width', 18).attr('height', 18).attr('viewBox', '0 0 24 24').attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.8).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').html(P[LAYER_ICON[l.id]] || '');
        g.append('text').attr('class', 'name').attr('x', 42).attr('y', 28).text(l.name.length > 20 ? l.name.slice(0, 19) + '…' : l.name);
        g.append('text').attr('class', 'sub').attr('x', 16).attr('y', 50).text(`${fmt(l.files)} files · ${fmt(l.loc)} LOC`);
        g.append('text').attr('class', 'score').attr('x', W - 16).attr('y', 32).attr('text-anchor', 'end');
        g.append('text').attr('class', 'delta-t').attr('x', W - 16).attr('y', 50).attr('text-anchor', 'end');
        const bg = g.append('g').attr('transform', `translate(16,${H - 30})`);
        bg.append('svg').attr('class', 'bshape').attr('width', 10).attr('height', 10).attr('viewBox', '0 0 10 10');
        bg.append('text').attr('class', 'band-t').attr('x', 15).attr('y', 9);
        const badges = [];
        if (l.prCount) badges.push({ cls: 'pr', text: `${l.prCount} PR${l.prCount > 1 ? 's' : ''}` });
        const secN = (l.security?.counts?.[5] || 0) + (l.security?.counts?.[4] || 0);
        if (secN) badges.push({ cls: 'crit', text: `${secN} high sec` });
        if (l.violations) badges.push({ cls: 'crit', text: `${l.violations} violation${l.violations > 1 ? 's' : ''}` });
        if (l.filesInCycles) badges.push({ cls: '', text: `${l.filesInCycles} in cycles` });
        let bx = W - 12;
        badges.slice(0, 2).forEach((b) => {
          const tw = b.text.length * 5.9 + 12; bx -= tw;
          const bb = g.append('g').attr('class', `badge ${b.cls}`).attr('transform', `translate(${bx},${H - 33})`);
          bb.append('rect').attr('width', tw).attr('height', 17).attr('rx', 8.5);
          bb.append('text').attr('x', tw / 2).attr('y', 12).attr('text-anchor', 'middle').text(b.text);
          bx -= 5;
        });
        g.append('g').attr('class', 'comp').attr('transform', `translate(16,${H - 9})`);
      })
      .on('mouseenter', (ev, l) => { G.hover = l.id; nodeTip(ev, l); G.highlight(); })
      .on('mousemove', (ev) => moveTip(ev))
      .on('mouseleave', () => { G.hover = null; hideTip(); G.highlight(); })
      .on('click', (ev, l) => { ev.stopPropagation(); select({ type: 'layer', id: l.id }); })
      .on('dblclick', (ev, l) => { ev.stopPropagation(); drillInto(l.id); })
      .on('keydown', (ev, l) => { if (ev.key === 'Enter') select({ type: 'layer', id: l.id }); if (ev.key === ' ') { ev.preventDefault(); drillInto(l.id); } });

    G.paint = () => {
      const k = S.day;
      G.nodeSel.each(function (l) {
        const g = d3.select(this); const s = l.series[k]; const m = metricOf(l, k); const b = band(m.v);
        g.select('.strip').attr('style', `fill:var(${b.v})`);
        g.select('.score').text(m.text);
        const dd = k === 0 ? l.score90 - l.score : Math.round(s.total - l.series[0].total);
        const dtext = S.colorBy !== 'total' ? m.sub : k === 0 ? (dd ? `${dd > 0 ? '▲' : '▼'}${Math.abs(dd)} by day 90` : 'stable') : dd ? `${dd > 0 ? '▲' : '▼'}${Math.abs(dd)} vs today` : 'no change';
        g.select('.delta-t').text(dtext).attr('style', `fill:${S.colorBy !== 'total' || !dd ? 'var(--muted)' : dd > 0 ? 'var(--crit)' : 'var(--good)'}`);
        g.select('.bshape').attr('style', `fill:var(${b.v})`).html(b.shape);
        g.select('.band-t').text(b.label);
        const pend = Math.max(s.pending, (l.whatIfAllMerged - l.staticScore) * 0.6);
        g.select('.halo').attr('display', pend > 3 ? null : 'none');
        const comp = g.select('.comp'); comp.selectAll('*').remove();
        const bw = W - 32; const parts = COMPONENTS.map((c) => ({ ...c, val: Math.max(0, s[c.key]) })).filter((c) => c.val > 0.3);
        const sum = Math.max(100, parts.reduce((a, c) => a + c.val, 0));
        comp.append('rect').attr('width', bw).attr('height', 3).attr('rx', 1.5).attr('style', 'fill:var(--surface-3)');
        let x = 0; parts.forEach((c) => { const w = (c.val / sum) * bw; comp.append('rect').attr('x', x).attr('width', Math.max(0, w - 1.5)).attr('height', 3).attr('rx', 1.5).attr('style', `fill:var(${c.v})`); x += w; });
      });
      G.highlight();
    };

    G.highlight = () => {
      const sel = S.sel;
      const focus = G.hover || (sel?.type === 'layer' ? sel.id : null);
      const prLayers = sel?.type === 'pr' ? new Set(d.prs.find((p) => p.number === sel.id)?.layers || []) : null;
      const scen = sel?.type === 'scenario' ? d.security?.threats.scenarios.find((x) => x.id === sel.id) : null;
      const paths = G.edgeSel.select('.g-edge');
      G.nodeSel.classed('sel', (l) => sel?.type === 'layer' && sel.id === l.id).classed('up-n', false).classed('down-n', false).classed('dim', false).classed('attack-n', false);
      paths.classed('up', false).classed('down', false).classed('hot', false).classed('dim', false).classed('attack', false).attr('marker-end', (e) => `url(#${e.violation ? 'a-bad' : 'a-def'})`);
      if (scen && !G.hover) {
        const p = scen.path?.length ? scen.path : [scen.entryPoint.layer]; const ps = new Set(p);
        const hop = (e) => p.some((x, i) => i < p.length - 1 && x === e.source && p[i + 1] === e.target);
        G.nodeSel.classed('dim', (l) => !ps.has(l.id)).classed('attack-n', (l) => ps.has(l.id));
        paths.classed('attack', hop).classed('dim', (e) => !hop(e)).attr('marker-end', (e) => `url(#${hop(e) || e.violation ? 'a-bad' : 'a-def'})`);
        return;
      }
      if (prLayers && !G.hover) {
        G.nodeSel.classed('dim', (l) => !prLayers.has(l.id)).classed('sel', (l) => prLayers.has(l.id));
        paths.classed('dim', (e) => !(prLayers.has(e.source) && prLayers.has(e.target)));
        return;
      }
      if (!focus) return;
      const up = reach(focus, 'out', edges), down = reach(focus, 'in', edges);
      const hoverOnly = G.hover && !(sel?.type === 'layer' && sel.id === G.hover);
      if (hoverOnly) {
        const near = new Set([focus]); edges.forEach((e) => { if (e.source === focus) near.add(e.target); if (e.target === focus) near.add(e.source); });
        G.nodeSel.classed('dim', (l) => !near.has(l.id));
        paths.classed('hot', (e) => e.source === focus || e.target === focus).classed('dim', (e) => !(e.source === focus || e.target === focus))
          .attr('marker-end', (e) => `url(#${e.violation ? 'a-bad' : e.source === focus || e.target === focus ? 'a-hot' : 'a-def'})`);
        return;
      }
      G.nodeSel.classed('dim', (l) => l.id !== focus && !up.nodes.has(l.id) && !down.nodes.has(l.id))
        .classed('up-n', (l) => up.nodes.has(l.id)).classed('down-n', (l) => down.nodes.has(l.id) && !up.nodes.has(l.id));
      paths.classed('up', (e) => up.edges.has(e)).classed('down', (e) => down.edges.has(e) && !up.edges.has(e))
        .classed('dim', (e) => !up.edges.has(e) && !down.edges.has(e))
        .attr('marker-end', (e) => `url(#${e.violation ? 'a-bad' : up.edges.has(e) ? 'a-up' : down.edges.has(e) ? 'a-down' : 'a-def'})`);
    };
  }

  function reach(id, dir, edges) {
    const nodes = new Set(), es = new Set(); const q = [id];
    while (q.length) {
      const v = q.shift();
      for (const e of edges) {
        const from = dir === 'out' ? e.source : e.target, to = dir === 'out' ? e.target : e.source;
        if (from !== v) continue;
        if (id !== 'tests' && e.source === 'tests') continue; // tests import everything; don't let them flood the highlight
        es.add(e);
        if (!nodes.has(to) && to !== id) { nodes.add(to); q.push(to); }
      }
    }
    return { nodes, edges: es };
  }

  function renderModuleGraph(root) {
    const d = S.data; const layer = L(S.drill);
    const mods = layer.modules.slice(0, 40); const ids = new Set(mods.map((m) => m.id));
    const maxLoc = Math.max(1, ...mods.map((m) => m.loc));
    const prFiles = d.prs.flatMap((p) => p.files.map((f) => f.path));
    const nodes = mods.map((m) => ({ id: m.id, m, r: 14 + 30 * Math.sqrt(m.loc / maxLoc), pending: prFiles.filter((p) => inMod(p, m)).length }));
    const stubs = new Map(); const links = [];
    for (const e of d.moduleEdges) {
      const a = ids.has(e.source), b = ids.has(e.target);
      if (a && b) links.push({ source: e.source, target: e.target, weight: e.weight });
      else if (a || b) {
        const other = (a ? e.target : e.source).split('::')[0]; const sid = 'stub:' + other;
        if (!stubs.has(sid)) stubs.set(sid, { id: sid, stub: true, layer: other });
        const src = a ? e.source : sid, tgt = a ? sid : e.target;
        const ex = links.find((x) => x.source === src && x.target === tgt); if (ex) ex.weight += e.weight; else links.push({ source: src, target: tgt, weight: e.weight, cross: true });
      }
    }
    if (!stubs.size) for (const x of [...layer.dependsOn, ...layer.dependents]) if (!stubs.has('stub:' + x.layer)) stubs.set('stub:' + x.layer, { id: 'stub:' + x.layer, stub: true, layer: x.layer });
    const all = [...nodes, ...stubs.values()];
    const R = 220 + nodes.length * 6;
    const sim = d3.forceSimulation(all)
      .force('link', d3.forceLink(links).id((n) => n.id).distance((l) => (l.cross ? R * 0.6 : 110)).strength((l) => (l.cross ? 0.05 : 0.35)))
      .force('charge', d3.forceManyBody().strength((n) => (n.stub ? -500 : -380)))
      .force('collide', d3.forceCollide((n) => (n.stub ? 70 : n.r + 34)))
      .force('radial', d3.forceRadial((n) => (n.stub ? R : 0)).strength((n) => (n.stub ? 0.9 : 0.04)))
      .stop();
    for (let i = 0; i < 360; i++) sim.tick();
    const maxW = Math.max(1, ...links.map((l) => l.weight));
    root.append('g').selectAll('path').data(links).join('path').attr('class', (l) => `g-edge ${l.cross ? 'weak' : ''}`)
      .attr('stroke-width', (l) => 1 + 3 * Math.sqrt(l.weight / maxW)).attr('marker-end', 'url(#a-def)')
      .attr('d', (l) => {
        const s = l.source, t = l.target; const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
        const rs = s.stub ? 18 : s.r, rt = t.stub ? 46 : t.r + 4;
        const x1 = s.x + (dx / dist) * rs, y1 = s.y + (dy / dist) * rs, x2 = t.x - (dx / dist) * rt, y2 = t.y - (dy / dist) * rt;
        return `M${x1},${y1} Q${(x1 + x2) / 2 - dy * 0.12},${(y1 + y2) / 2 + dx * 0.12} ${x2},${y2}`;
      });
    const ng = root.append('g');
    G.modSel = ng.selectAll('g.g-mod').data(nodes).join('g').attr('class', 'g-mod').attr('transform', (n) => `translate(${n.x},${n.y})`).style('cursor', 'pointer')
      .each(function (n) {
        const g = d3.select(this); const c = bandColor(n.m.score);
        if (n.pending) g.append('circle').attr('r', n.r + 6).attr('style', 'fill:none;stroke:var(--c-pending);stroke-width:1.5;stroke-dasharray:4 3');
        g.append('circle').attr('class', 'body').attr('r', n.r).attr('style', `fill:${c};fill-opacity:.16;stroke:${c}`);
        g.append('text').attr('class', 'sc').attr('text-anchor', 'middle').attr('y', 4).text(n.m.score);
        const label = n.m.path.split('/').slice(-2).join('/');
        g.append('text').attr('text-anchor', 'middle').attr('y', n.r + 16).text(label.length > 28 ? '…' + label.slice(-27) : label);
      })
      .on('mouseenter', (ev, n) => modTip(ev, n)).on('mousemove', moveTip).on('mouseleave', hideTip)
      .on('click', (ev, n) => { ev.stopPropagation(); select({ type: 'module', id: n.id }); });
    ng.selectAll('g.g-stub').data([...stubs.values()]).join('g').attr('class', 'g-stub').attr('transform', (n) => `translate(${n.x},${n.y})`).style('cursor', 'pointer')
      .each(function (n) {
        const g = d3.select(this); const label = lname(n.layer); const w = Math.max(96, label.length * 7 + 44);
        g.append('rect').attr('x', -w / 2).attr('y', -16).attr('width', w).attr('height', 32).attr('rx', 16);
        g.append('svg').attr('x', -w / 2 + 12).attr('y', -7).attr('width', 14).attr('height', 14).attr('viewBox', '0 0 24 24').attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 2).attr('style', 'color:var(--muted)').html(P[LAYER_ICON[n.layer]] || '');
        g.append('text').attr('x', -w / 2 + 32).attr('y', 4).text(label);
      })
      .on('mouseenter', (ev, n) => showTip(ev, `<h5>${icon(LAYER_ICON[n.layer])}${esc(lname(n.layer))}</h5><div class="hint">Click to open this layer's modules</div>`))
      .on('mousemove', moveTip).on('mouseleave', hideTip)
      .on('click', (ev, n) => { ev.stopPropagation(); hideTip(); if (L(n.layer)?.modules?.length) drillInto(n.layer); else { exitDrill(); select({ type: 'layer', id: n.layer }); } });
    G.paint = () => { G.modSel?.classed('sel', (n) => S.sel?.type === 'module' && S.sel.id === n.id); };
    G.highlight = G.paint;
  }

  // Whole-architecture minimap: always on screen while you are inside a layer's modules
  function renderMinimap() {
    const el = $('#minimap'); if (!S.drill) { el.hidden = true; return; }
    const d = S.data; const lay = computeLayout(d.layers, d.edges); const pos = lay.pos;
    const xs = Object.values(pos).map((p) => p.x), ys = Object.values(pos).map((p) => p.y);
    const minX = Math.min(...xs) - W / 2 - 20, maxX = Math.max(...xs) + W / 2 + 20, minY = Math.min(...ys) - H / 2 - 20, maxY = Math.max(...ys) + H / 2 + 20;
    const node = (l) => { const p = pos[l.id]; if (!p) return ''; const on = l.id === S.drill; return `<g class="mm-n ${on ? 'on' : ''}" data-mm="${l.id}" transform="translate(${p.x - W / 2},${p.y - H / 2})"><title>${esc(l.name)} · ${l.score}</title><rect width="${W}" height="${H}" rx="16" style="fill:${on ? 'var(--accent-soft)' : 'var(--surface)'};stroke:${on ? 'var(--accent)' : bandColor(l.score)}" stroke-width="${on ? 10 : 6}"/><text x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle">${esc(l.name.split(' /')[0])}</text></g>`; };
    const edge = (e) => { const a = pos[e.source], b = pos[e.target]; if (!a || !b) return ''; const hot = e.source === S.drill || e.target === S.drill; return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke:${hot ? 'var(--accent)' : e.violation ? 'var(--crit)' : 'var(--edge)'}" stroke-width="${hot ? 8 : 4}" opacity="${hot ? 0.9 : e.source === 'tests' ? 0.25 : 0.7}"/>`; };
    el.hidden = false;
    el.innerHTML = `<div class="mm-h"><span>${icon('network')} Whole architecture</span><button data-mm-back>Back</button></div><svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet">${d.edges.map(edge).join('')}${d.layers.map(node).join('')}</svg><div class="mm-f">You are inside <b>${esc(lname(S.drill))}</b> · click another layer</div>`;
    $$('[data-mm]', el).forEach((g) => g.addEventListener('click', (ev) => { ev.stopPropagation(); const id = g.dataset.mm; if (id === S.drill) return; if (L(id)?.modules?.length) drillInto(id); else { exitDrill(); select({ type: 'layer', id }); } }));
    $('[data-mm-back]', el).addEventListener('click', (ev) => { ev.stopPropagation(); exitDrill(); });
  }

  function renderGraphChrome() {
    const d = S.data;
    $('#graphCrumbs').innerHTML = S.drill
      ? `<button id="crBack" aria-label="Back to architecture">${icon('arrow-left')}</button><button id="crRoot">Architecture</button><span class="sep">/</span><span>${esc(lname(S.drill))}</span><span class="muted">· ${plural(L(S.drill).modules.length, 'module')}</span>`
      : `<span>Architecture</span><span class="muted">· ${plural(d.layers.length, 'layer')} · ${plural(d.edges.length, 'dependency', 'dependencies')}${d.summary.violations ? ` · <span style="color:var(--crit)">${plural(d.summary.violations, 'violation')}</span>` : ''}</span>`;
    $('#crBack')?.addEventListener('click', exitDrill); $('#crRoot')?.addEventListener('click', exitDrill);
    const scLegend = S.sel?.type === 'scenario' ? `<span><i class="ln bad"></i>attack path: ${esc(sec()?.threats.scenarios.find((x) => x.id === S.sel.id)?.title || '')}</span>` : '';
    $('#legend').innerHTML = scLegend ? `${BANDS.map((b) => `<span>${bandDot(b.max - 5)}${b.label}</span>`).join('')}${scLegend}` : S.drill
      ? `<span>${bandDot(20)}${bandDot(40)}${bandDot(60)}${bandDot(80)} module debt</span><span>size = lines of code</span><span><i class="halo" style="border-radius:50%"></i>in open PRs</span><span class="muted">Click a module · click a pill to switch layer</span>`
      : `${BANDS.map((b) => `<span>${bandDot(b.max - 5)}${b.label}</span>`).join('')}<span><i class="ln"></i>imports</span><span><i class="ln bad"></i>violation</span><span><i class="halo"></i>PR debt</span>${S.sel?.type === 'layer' ? `<span><i class="ln up"></i>depends on</span><span><i class="ln down"></i>depended on by</span>` : `<span class="muted">Click a layer · double-click for modules</span>`}`;
    $('#supportBtn').setAttribute('aria-pressed', S.support); $('#supportBtn').hidden = !!S.drill;
    $$('.toolbar-float .seg').forEach((el) => (el.hidden = !!S.drill));
  }

  function drillInto(id) {
    const l = L(id); if (!l?.modules?.length) return toast('This layer has no modules to show');
    S.drill = id; S.sel = { type: 'layer', id }; S.panelTab = S.panelTab || 'summary';
    if (S.page !== 'arch') { S.page = 'arch'; setPage('arch'); }
    graphRender(); renderPanel(); renderSidebar();
  }
  function exitDrill() { const id = S.drill; S.drill = null; graphRender(); if (id) select({ type: 'layer', id }); }

  /* Graph tooltips */
  function showTip(ev, html) { const t = $('#graphTip'); t.innerHTML = html; t.hidden = false; moveTip(ev); }
  function moveTip(ev) {
    const t = $('#graphTip'); if (t.hidden) return; const r = $('#canvas').getBoundingClientRect();
    let x = ev.clientX - r.left + 16, y = ev.clientY - r.top + 16;
    if (x + 270 > r.width) x = ev.clientX - r.left - 276;
    if (y + t.offsetHeight > r.height - 80) y = Math.max(8, ev.clientY - r.top - t.offsetHeight - 12);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { $('#graphTip').hidden = true; }
  function nodeTip(ev, l) {
    const s = l.series[S.day];
    showTip(ev, `<h5>${icon(LAYER_ICON[l.id])}${esc(l.name)}</h5><div style="margin:4px 0 6px">${bandBadge(s.total, true)} <span class="muted">${dayLabel(S.day).toLowerCase()}</span></div>
      ${COMPONENTS.map((c) => `<div class="row"><span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:2px;background:var(${c.v});display:inline-block"></i>${c.label}</span><b>${s[c.key] >= 0 ? '+' : '−'}${Math.abs(Math.round(s[c.key]))}</b></div>`).join('')}
      <div class="row"><span>Depends on</span><b>${l.dependsOn.length} direct · ${l.transitiveDeps} total</b></div><div class="row"><span>Blast radius</span><b>${plural(l.blastRadius, 'layer')}</b></div>
      <div class="hint">Click for details · double-click for modules</div>`);
  }
  function edgeTip(ev, e) {
    showTip(ev, `<h5>${esc(lname(e.source))} → ${esc(lname(e.target))}</h5><div class="row"><span>Imports</span><b>${e.weight}</b></div>
      ${e.violation ? `<div class="warn">Layering violation: ${esc(lname(e.source))} sits below ${esc(lname(e.target))} and should not import from it.</div>` : ''}
      ${e.bidirectional ? `<div class="row"><span>Coupling</span><b>both directions</b></div>` : ''}
      ${(e.samples || []).slice(0, 3).map((x) => `<span class="mono">${esc(x.from.split('/').slice(-2).join('/'))} → ${esc(x.to.split('/').slice(-2).join('/'))}</span>`).join('')}`);
  }
  function modTip(ev, n) {
    const m = n.m;
    showTip(ev, `<h5 class="mono" style="font-size:12px">${esc(m.path)}</h5><div style="margin:4px 0 6px">${bandBadge(m.score, true)}</div><div class="row"><span>Files</span><b>${m.files}</b></div><div class="row"><span>Lines of code</span><b>${fmt(m.loc)}</b></div><div class="row"><span>TODO / FIXME</span><b>${m.todos}</b></div><div class="row"><span>Hotspot files</span><b>${m.hot}</b></div>${n.pending ? `<div class="row"><span>Files in open PRs</span><b>${n.pending}</b></div>` : ''}<div class="hint">Click for details</div>`);
  }

  /* =====================================================================
     Selection & detail panel
     ===================================================================== */
  function select(sel, { tab } = {}) {
    const same = sel && S.sel && sel.type === S.sel.type && sel.id === S.sel.id;
    S.sel = sel;
    if (!same) S.panelTab = tab || 'summary'; else if (tab) S.panelTab = tab;
    if (G.rendered) G.highlight?.();
    if (G.rendered && !S.drill) renderGraphChrome();
    renderSidebar(); renderPanel();
    $$('.row-item[data-pr]').forEach((r) => r.classList.toggle('on', sel?.type === 'pr' && +r.dataset.pr === sel.id));
  }
  function gotoLayer(id) {
    if (!L(id)) return;
    if (S.drill && S.drill !== id) { S.drill = null; G.rendered = false; }
    S.sel = { type: 'layer', id }; S.panelTab = 'summary';
    if (S.page !== 'arch') setPage('arch'); else if (!G.rendered) graphRender();
    select({ type: 'layer', id });
  }

  function renderPanel({ soft = false } = {}) {
    const el = $('#panel'); const sel = S.sel;
    const was = !el.hidden;
    let html = '';
    if (sel && S.data) {
      if (sel.type === 'layer') html = layerPanel(L(sel.id));
      else if (sel.type === 'pr') html = prPanel(S.data.prs.find((p) => p.number === sel.id));
      else if (sel.type === 'module') html = modulePanel(sel.id);
      else if (sel.type === 'file') html = filePanel(sel.id);
      else if (sel.type === 'task') html = taskPanel(S.data.backlog.tasks.find((t) => t.key === sel.id));
      else if (sel.type === 'finding') html = findingPanel(sel.id);
      else if (sel.type === 'vuln') html = vulnPanel(sel.id);
      else if (sel.type === 'endpoint') html = endpointPanel(sel.id);
      else if (sel.type === 'scenario') html = scenarioPanel(sel.id);
      else if (sel.type === 'tech') html = techPanel(sel.id);
      else if (sel.type === 'person') html = personPanel(sel.id);
    }
    if (!html) { el.hidden = true; el.innerHTML = ''; if (was) G.refit(); return; }
    const scroll = soft ? $('.p-body', el)?.scrollTop || 0 : 0;
    el.innerHTML = html; el.hidden = false;
    bindPanel(el);
    $$('.chart[data-chart]', el).forEach(mountChart);
    if (soft) $('.p-body', el).scrollTop = scroll;
    if (!was) G.refit();
  }

  const panelHead = (ic, title, sub, meta, tabs) => `<div class="p-head"><div class="p-top"><div class="p-ic">${ic}</div><div class="p-title"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Close details (Esc)">${icon('x')}</button></div>${meta ? `<div class="p-meta">${meta}</div>` : ''}${tabs ? `<div class="p-tabs" role="tablist">${tabs.map(([id, label, n]) => `<button role="tab" data-ptab="${id}" class="${S.panelTab === id ? 'on' : ''}" aria-selected="${S.panelTab === id}">${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>` : ''}</div>`;

  function layerPanel(l) {
    if (!l) return '';
    const k = S.day, s = l.series[k], d = S.data;
    const lsec = l.security; const lf = sec()?.findings.filter((f) => f.layer === l.id) || []; const lv = sec()?.vulns.filter((v) => v.usedBy?.layers?.includes(l.id)) || []; const le = sec()?.surface.endpoints.filter((e) => e.layer === l.id) || [];
    const tabs = [['summary', 'Summary'], ['deps', 'Dependencies', l.dependsOn.length + l.dependents.length], ['debt', 'Debt', l.prItems.length + l.tasks.length], ...(lsec ? [['sec', 'Security', lf.length + lv.length]] : []), ['code', 'Code', l.hotspots.length]];
    if (!tabs.some((t) => t[0] === S.panelTab)) S.panelTab = 'summary';
    const meta = `${bandBadge(s.total, true)}<span class="pill">${fmt(l.files)} files</span><span class="pill">${fmt(l.loc)} LOC</span>${l.coverage != null ? `<span class="pill ${l.coverage < 0.4 ? 'crit' : l.coverage > 0.7 ? 'good' : ''}">${Math.round(l.coverage * 100)}% test-linked</span>` : ''}`;
    let body = '';
    if (S.panelTab === 'summary') {
      const deep = S.deep[l.id];
      body = `<div class="p-sec"><h4>Where it is heading</h4>${scoreTrack([{ v: l.score, label: 'today', cls: 'now' }, { v: l.score90, label: '90 days', cls: 'future' }, { v: l.whatIfAllMerged, label: 'all PRs merged', cls: 'what' }])}</div>
        ${l.narrative ? `<div class="p-sec"><div class="narr"><div class="who">${icon('sparkles')} AI assessment</div>${keyPoints(l.narrative, 2)}</div></div>` : ''}
        <div class="p-sec"><h4>What makes up the score <span class="muted">${dayLabel(k)}</span></h4>${donut(s)}${acc(`fc-${l.id}`, `${icon('clock')}<span class="t">90-day forecast chart</span>`, `<div class="chart" data-chart="layer" data-layer="${l.id}"></div>`, { cls: 'flat' })}</div>
        <div class="p-sec"><h4>What drives it <span class="muted">existing code · ${l.staticScore}</span></h4>${l.staticDrivers.length ? `<div class="drivers">${l.staticDrivers.map((dr) => `<div class="drv" title="${esc(dr.detail)}"><span class="di">${icon(driverIcon(dr.label))}</span><span class="dl">${esc(dr.label)}</span><div class="track"><i style="width:${Math.min(100, dr.points * 5)}%;background:var(--text-2)"></i></div><b>+${dr.points}</b></div>`).join('')}</div><p class="muted" style="font-size:11.5px;margin:6px 0 0">Hover a row for the measurement.</p>` : '<div class="muted">No static debt drivers found.</div>'}</div>
        <div class="p-sec"><h4>Deep dive <span class="muted">AI reads this layer's riskiest files</span></h4>
          ${deep?.loading ? `<div class="muted" style="display:flex;gap:8px;align-items:center"><span class="spinner" style="color:var(--accent)"></span> Reviewing hotspots, dependencies and pending debt…</div>` : deep?.data ? deepHtml(deep.data) : deep?.error ? `<div class="item"><div class="d" style="color:var(--crit)">${esc(deep.error)}</div></div><button class="btn sm" data-deep="${l.id}">Retry</button>` : `<button class="btn sm primary" data-deep="${l.id}">${icon('sparkles')} Run deep dive</button>`}</div>`;
    } else if (S.panelTab === 'deps') {
      const inh = k === lastK() ? l.inheritedFrom90 : l.inheritedFrom;
      body = `<div class="p-sec"><h4><span><span class="dir-up">Depends on</span> · ${l.dependsOn.length} direct, ${l.transitiveDeps} in total</span><span class="muted">+${Math.round(s.inherited)} inherited</span></h4>
          <p class="muted" style="margin:-4px 0 10px;font-size:12px">When these layers carry debt, this layer inherits part of it. The share shrinks with each step of distance and grows with tighter coupling.</p>
          ${inh.length ? `<div class="chain">${inh.map((c) => `<button class="link-row" data-goto-layer="${c.layer}"><div><div class="t">${icon(LAYER_ICON[c.layer])}${esc(lname(c.layer))} <span class="pill">${c.depth === 1 ? 'direct' : `${c.depth} hops`}</span></div><div class="path">${c.via.map((v) => esc(lname(v).split(' /')[0])).join(' → ')}</div></div><div class="r">+${c.points.toFixed(1)}<small>its score ${L(c.layer)?.series[k].total ?? '—'}</small></div></button>`).join('')}</div>` : '<div class="muted">This layer imports no other layers, so it inherits no debt.</div>'}</div>
        <div class="p-sec"><h4><span><span class="dir-down">Depended on by</span> · blast radius ${plural(l.blastRadius, 'layer')}</span></h4>
          <p class="muted" style="margin:-4px 0 10px;font-size:12px">These layers import this one. Debt here spreads to them.</p>
          ${l.dependents.length ? `<div class="chain">${[...l.dependents].sort((a, b) => b.weight - a.weight).map((x) => `<button class="link-row" data-goto-layer="${x.layer}"><div class="t">${icon(LAYER_ICON[x.layer])}${esc(lname(x.layer))}${x.violation ? ' <span class="pill crit">violation</span>' : ''}</div><div class="r">${x.weight}<small>imports</small></div></button>`).join('')}</div>` : '<div class="muted">No other layer imports this one.</div>'}</div>`;
    } else if (S.panelTab === 'sec') {
      const cats = {}; lf.forEach((f) => (cats[f.category] ||= []).push(f));
      body = `<div class="p-sec"><div class="trio"><div><span>Security debt</span><b style="color:${bandColor(lsec.score)}">${lsec.score}</b></div><div><span>Findings</span><b>${lf.length}</b></div><div><span>Open endpoints</span><b>${lsec.openEndpoints}</b></div></div></div>
        <div class="p-sec"><h4>How attackers reach it</h4>${chainHtml(exposurePath(l.id))}<p class="muted" style="font-size:12px;margin:8px 0 0">If this layer is compromised it can reach: ${reachable(l.id).map((x) => esc(lname(x).split(' /')[0])).join(', ') || 'nothing downstream'}.</p></div>
        <div class="p-sec"><h4>Findings <span class="muted">${lf.length}</span></h4>${Object.entries(cats).map(([c, fs], i) => acc(`lsec-${l.id}-${c}`, `<span class="t">${esc(c)}</span>`, fs.map((f) => `<button class="file-row" data-finding="${f.fp}" style="width:100%;text-align:left"><div><div>${sevChip(f.severity)} ${esc(f.title)}</div><div class="why mono">${esc(f.file.split('/').slice(-2).join('/'))}${f.line ? ':' + f.line : ''}</div></div></button>`).join(''), { open: i === 0, cls: 'flat', meta: `<span>${fs.length}</span>` })).join('') || '<div class="muted">No static findings in this layer.</div>'}</div>
        <div class="p-sec"><h4>Vulnerable dependencies <span class="muted">${lv.length}</span></h4>${lv.slice(0, 8).map((v) => `<button class="file-row" data-vuln="${esc(v.package)}" style="width:100%;text-align:left"><span>${sevChip(v.severity)} ${esc(v.aliases[0] || v.id)}</span><span class="mono muted">${esc(v.package)}@${esc(v.version)}</span></button>`).join('') || '<div class="muted">None.</div>'}</div>
        <div class="p-sec"><h4>Endpoints <span class="muted">${le.length}</span></h4>${le.slice(0, 10).map((e) => `<button class="file-row" data-ep="${esc(`${e.method} ${e.path} ${e.file}`)}" style="width:100%;text-align:left;align-items:center"><span><span class="ep-method">${esc(e.method)}</span> <span class="mono">${esc(e.path)}</span></span><span class="auth ${e.auth}">${e.auth === 'none' ? '✕ no auth' : '✓'}</span></button>`).join('') || '<div class="muted">None detected.</div>'}</div>`;
    } else if (S.panelTab === 'debt') {
      const groups = {}; l.prItems.forEach((i) => (groups[i.pr] ||= []).push(i));
      body = `<div class="p-sec"><h4>From unmerged PRs <span class="muted">${plural(l.prItems.length, 'finding')}</span></h4>
          ${Object.keys(groups).length ? Object.entries(groups).map(([n, items], gi) => { const p = d.prs.find((x) => x.number === +n); return `<details class="grp" ${gi < 2 ? 'open' : ''}><summary>${icon('chevron', 'chev')}<span class="ttl"><span class="muted">#${n}</span> ${esc(p?.title)}</span>${riskPill(p?.risk)}<span class="pill">${Math.round((p?.pMerge || 0) * 100)}% odds</span></summary><div class="inner">${items.map(itemHtml).join('')}<button class="btn sm ghost" data-pr="${n}" style="margin:0 0 8px">Open PR ${icon('arrow-right')}</button></div></details>`; }).join('') : '<div class="muted">No open PR adds debt to this layer.</div>'}</div>
        <div class="p-sec"><h4>From planned work <span class="muted">${plural(l.tasks.length, 'item')}</span></h4>${l.tasks.length ? l.tasks.slice(0, 14).map(taskRow).join('') : '<div class="muted">No backlog items map to this layer.</div>'}</div>`;
    } else {
      body = `<div class="p-sec"><h4>Riskiest files</h4>${l.hotspots.length ? l.hotspots.slice(0, 8).map(hotRow).join('') : '<div class="muted">No hotspots.</div>'}</div>
        <div class="p-sec"><h4>Modules <span class="muted">${l.modules.length}</span></h4>${l.modules.slice(0, 10).map((m) => `<button class="hbar" data-module="${esc(m.id)}" style="width:100%;text-align:left"><div class="lab mono" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(m.path)}">${esc(m.path.split('/').slice(-2).join('/'))}</div><div class="track"><i style="width:${m.score}%;background:${bandColor(m.score)}"></i></div><span class="val">${m.score}</span></button>`).join('')}
          ${S.drill !== l.id && l.modules.length ? `<button class="btn sm" data-drill="${l.id}" style="margin-top:10px">${icon('network')} Open module map</button>` : ''}</div>
        ${l.todoSamples?.length ? `<div class="p-sec"><h4>Debt markers in code</h4>${l.todoSamples.slice(0, 5).map((t) => `<div class="file-row"><div><div class="p">${esc(t.text)}</div><div class="why">${esc(t.file)}:${t.line}</div></div></div>`).join('')}</div>` : ''}
        ${l.externals?.length ? `<div class="p-sec"><h4>Top external packages</h4><div class="p-meta" style="margin:0">${l.externals.slice(0, 10).map((x) => `<span class="pill mono">${esc(x.name)} · ${x.count}</span>`).join('')}</div></div>` : ''}`;
    }
    return panelHead(icon(LAYER_ICON[l.id]), esc(l.name), esc(l.description), meta, tabs) + `<div class="p-body">${body}</div>`;
  }
  const stackLegend = (s) => {
    const parts = COMPONENTS.map((c) => ({ ...c, val: s[c.key] }));
    const pos = parts.filter((p) => p.val > 0); const sum = Math.max(100, pos.reduce((a, p) => a + p.val, 0));
    return `<div class="stackbar">${pos.map((p) => `<i style="width:${(p.val / sum) * 100}%;background:var(${p.v})" title="${p.label}"></i>`).join('')}</div>
      <div class="legend-row">${parts.map((p) => `<span><i style="background:var(${p.v})"></i>${p.label} <b>${p.val >= 0 ? '+' : '−'}${Math.abs(Math.round(p.val))}</b></span>`).join('')}</div>`;
  };
  const scoreTrack = (marks) => {
    const segs = BANDS.map((b, i) => { const from = i ? BANDS[i - 1].max : 0, to = Math.min(100, b.max); return `<i style="left:${from}%;width:${to - from}%;background:var(${b.v})"></i>`; }).join('');
    const base = marks[0].v;
    return `<div class="strack"><div class="bar">${segs}</div>${marks.map((m) => `<span class="mk ${m.cls || ''}" style="left:${Math.max(0, Math.min(100, m.v))}%" title="${esc(m.label)}: ${m.v}"></span>`).join('')}<div class="ticks"><span>0</span><span>30</span><span>50</span><span>70</span><span>100</span></div></div>
      <div class="skey">${marks.map((m, i) => `<div><span class="sw ${m.cls || ''}"></span><span class="lbl">${esc(m.label)}</span><b style="color:${bandColor(m.v)}">${m.v}</b>${i ? deltaHtml(base, m.v) : bandBadge(m.v)}</div>`).join('')}</div>`;
  };
  const donut = (s, size = 116) => {
    const parts = COMPONENTS.map((c) => ({ ...c, val: Math.max(0, s[c.key]) })).filter((c) => c.val > 0.2);
    const sum = parts.reduce((a, c) => a + c.val, 0) || 1; const r = size / 2 - 10, C = 2 * Math.PI * r; let off = 0;
    const arcs = parts.map((c) => { const len = (c.val / sum) * C; const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:var(${c.v})" stroke-width="14" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${c.label}: ${c.val.toFixed(1)}</title></circle>`; off += len; return el; }).join('');
    const neg = COMPONENTS.filter((c) => s[c.key] < -0.5);
    return `<div class="donut-wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Score composition"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:var(--surface-3)" stroke-width="14"/>${arcs}<text x="50%" y="50%" dy="6" text-anchor="middle" style="fill:var(--text);font-size:22px;font-weight:700;letter-spacing:-.03em">${Math.round(s.total)}</text></svg>
      <div class="donut-legend">${COMPONENTS.map((c) => `<div class="${s[c.key] > 0.2 || s[c.key] < -0.5 ? '' : 'zero'}"><i style="background:var(${c.v})"></i><span>${c.label}</span><b class="${s[c.key] < -0.5 ? 'neg' : ''}">${s[c.key] >= 0 ? '+' : '−'}${Math.abs(Math.round(s[c.key]))}</b></div>`).join('')}${neg.length ? '' : ''}</div></div>`;
  };
  const DRIVER_ICON = [[/test/i, 'flask'], [/complex/i, 'cpu'], [/todo|fixme/i, 'list'], [/cycle|circular/i, 'cycle'], [/violation|layering/i, 'alert'], [/oversized|size/i, 'file'], [/suppress|any/i, 'eye'], [/coupling/i, 'network']];
  const driverIcon = (label) => (DRIVER_ICON.find(([re]) => re.test(label)) || [0, 'target'])[1];
  const ldots = (ids, max = 5) => `<span class="ldots">${ids.slice(0, max).map((id) => `<span class="ldot" title="${esc(lname(id))}">${icon(LAYER_ICON[id] || 'layers')}</span>`).join('')}${ids.length > max ? `<span class="ldot more">+${ids.length - max}</span>` : ''}</span>`;
  const REASON = [[/([\d,.]+k?) LOC/, 'file', (m) => m[1]], [/([\d]+) (conditionals|branch points)/, 'cpu', (m) => m[1]], [/imported by ([\d]+)/, 'network', (m) => `×${m[1]}`], [/nesting depth ([\d]+)/, 'layers', (m) => `${m[1]} deep`], [/([\d]+) TODO/, 'list', (m) => m[1]], [/([\d]+) lint\/type suppressions/, 'eye', (m) => m[1]], [/([\d]+) `any`/, 'alert', (m) => `${m[1]} any`], [/circular/, 'cycle', () => 'cycle'], [/no linked tests/, 'flask', () => 'no tests', 'crit']];
  const reasonChips = (rs = []) => `<span class="rchips">${rs.map((r) => { const hit = REASON.find(([re]) => re.test(r)); if (!hit) return `<span class="rchip" title="${esc(r)}">${esc(r)}</span>`; const m = r.match(hit[0]); return `<span class="rchip ${hit[3] || ''}" title="${esc(r)}">${icon(hit[1])}${esc(hit[2](m))}</span>`; }).join('')}</span>`;
  const sevStack = (items) => { const c = [5, 4, 3, 2, 1].map((sv) => [sv, items.filter((i) => (i.severity || 2) === sv).length]); const total = items.length; return `<span class="sevstack" title="${c.filter(([, n]) => n).map(([sv, n]) => `${n} ${SEV_LABEL[sv].toLowerCase()}`).join(', ')}">${c.flatMap(([sv, n]) => Array(Math.min(n, 8)).fill(`<i class="s${sv}"></i>`)).slice(0, 14).join('')}${total > 14 ? `<em>+${total - 14}</em>` : ''}</span>`; };
  const pathHtml = (file, line) => { const parts = file.split('/'); const base = parts.pop(); return `<span class="pathv"><span class="dir">${esc(parts.slice(-2).join('/'))}${parts.length ? '/' : ''}</span><b>${esc(base)}</b>${line ? `<span class="dir">:${line}</span>` : ''}</span>`; };
  const impactBar = (d, max = 30) => `<span class="impact" title="${d > 0 ? 'adds' : d < 0 ? 'pays down' : 'no change in'} ${Math.abs(d)} debt points"><span class="neg">${d < 0 ? `<i style="width:${Math.min(100, (-d / max) * 100)}%"></i>` : ''}</span><span class="pos">${d > 0 ? `<i style="width:${Math.min(100, (d / max) * 100)}%"></i>` : ''}</span><b class="dlt ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${d > 0 ? '+' : ''}${d}</b></span>`;
  const sentences = (t) => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9#"(])/).filter((x) => x.length > 2);
  const keyPoints = (text, show = 3, id = '') => { const ss = sentences(text); if (!ss.length) return ''; const li = (x) => `<li>${esc(x)}</li>`; return `<ul class="kpts">${ss.slice(0, show).map(li).join('')}</ul>${ss.length > show ? `<details class="kpts-more"><summary>${ss.length - show} more point${ss.length - show > 1 ? 's' : ''}</summary><ul class="kpts">${ss.slice(show).map(li).join('')}</ul></details>` : ''}`; };
  /* ---- Fix plans: break every fix into Where / Do / Verify / Ask ---- */
  const VERIFY = [
    [/sql|nosql|injection|command|eval|deserial/i, 'Add a test that sends a malicious payload (e.g. `\' OR 1=1 --`, `; ls`) and expect it to be rejected or safely escaped.'],
    [/secret|credential|key file|token/i, 'Run gitleaks or trufflehog on the repo and its history, and confirm the old credential no longer works.'],
    [/xss|html/i, 'Render a `<script>alert(1)</script>` payload in a test and assert it comes out escaped.'],
    [/ssrf|outbound/i, 'Call the endpoint with http://169.254.169.254/ in a test and expect it to be blocked.'],
    [/jwt|auth|access control|redirect|path/i, 'Add tests for an unauthenticated, an expired-token and a tampered request: all must be rejected.'],
    [/crypto|hash|random|tls/i, 'Check new values use the stronger primitive, then rotate anything generated the old way.'],
    [/supply|dependenc|pinned|image|workflow|action/i, 'Re-run Narc (OSV) or your SCA scan and confirm the advisory or unpinned reference is gone.'],
    [/llm|prompt|ai|tool/i, 'Add an eval with an injection input ("ignore previous instructions…") and assert no tool call or side effect happens.'],
    [/test/i, 'Run the suite with coverage and confirm the changed lines are exercised.'],
    [/architect|layer|cycle|depend/i, 'Re-run Narc and check the edge or cycle has disappeared from the architecture graph.'],
    [/debug|config|cors/i, 'Check the production config and environment: the setting must be off or restricted there.'],
  ];
  const splitSteps = (t) => String(t || '').replace(/\s+/g, ' ').trim()
    .split(/;\s+|\.\s+(?=[A-Z])|,\s*(?:and\s+)?(?![^()]*\))|\s+then\s+/i)
    .map((x) => x.trim().replace(/\.$/, '')).filter((x) => x.length > 6).map((x) => x[0].toUpperCase() + x.slice(1)).slice(0, 5);
  const richText = (t) => esc(t)
    .replace(/(^|[\s(])((?:[\w.-]+\/)+[\w.-]+\.\w{1,5}(?::\d+)?)/g, (m, a, p) => `${a}<code class="fpath">${p}</code>`)
    .replace(/(^|[\s(])#(\d{1,6})\b/g, (m, a, n) => `${a}${prLink(+n)}`)
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  function fixPlanHtml(x, { compact = false } = {}) {
    const steps = splitSteps(x.fix);
    if (!steps.length && !x.file) return '';
    const cat = `${x.category || ''} ${x.title || ''} ${x.rule || ''}`;
    const verify = (VERIFY.find(([re]) => re.test(cat)) || [0, 'Re-run Narc and confirm the finding is gone.'])[1];
    const o = x.file ? ownerOf(x.file) : null;
    const rows = [];
    if (x.file) rows.push(['where', 'Where', `<a class="fpath" href="${esc(blobUrl(x.file, x.line))}" target="_blank" rel="noopener">${esc(x.file)}${x.line ? ':' + x.line : ''}</a>${x.layer && L(x.layer) ? ` ${lchip(x.layer)}` : ''}`]);
    steps.forEach((st, i) => rows.push(['do', steps.length > 1 ? `Step ${i + 1}` : 'Do', richText(st)]));
    rows.push(['verify', 'Verify', richText(verify)]);
    if (o && !compact) rows.push(['who', 'Ask', `${ownerHtml(x.file)}`]);
    else if (o) rows.push(['who', 'Ask', `<button class="link" data-person="${esc(o.login || o.name)}">@${esc(o.login || o.name)}</button> <span class="muted">last changed it ${ago(o.date)}</span>`]);
    return `<ol class="fixplan ${compact ? 'compact' : ''}">${rows.map(([k, label, html]) => `<li class="${k}"><span class="fk">${label}</span><div>${html}</div></li>`).join('')}</ol>`;
  }
  const todoKey = (t) => `done.${S.data?.repo?.fullName}.${t.slice(0, 60)}`;
  const todoList = (items) => `<ol class="todo">${items.map((t, i) => { const done = store.get(todoKey(t), false); return `<li class="${done ? 'done' : ''}"><button class="tick" data-todo="${esc(todoKey(t))}" aria-pressed="${done}" aria-label="Mark step ${i + 1} done">${icon('check')}</button><span class="n">${i + 1}</span><div>${richText(t)}</div></li>`; }).join('')}</ol>`;

  const riskPill = (r) => `<span class="pill" style="gap:5px">${bandDot(r)}<span class="score">${r ?? '—'}</span></span>`;
  const itemHtml = (i) => `<div class="item"><div class="t">${sevBars(i.severity)}<span>${esc(i.title)}</span>${i.source === 'ai' ? `<span class="ai-tag">${icon('sparkles')}AI</span>` : '<span class="rule-tag">rule</span>'}</div>${i.detail ? `<div class="d">${esc(i.detail)}</div>` : ''}${i.file ? `<div class="f">${esc(i.file)}</div>` : ''}${i.compounding ? `<div class="cmp">${esc(i.compounding)}</div>` : ''}${i.fix ? fixPlanHtml(i, { compact: true }) : ''}</div>`;
  const taskRow = (t) => `<div class="task-row"><span class="k">${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.key)}</a>` : esc(t.key)}</span><button style="text-align:left" data-task="${esc(t.key)}">${esc(t.title)}</button><span class="dlt ${t.delta > 0 ? 'pos' : t.delta < 0 ? 'neg' : ''}">${t.delta > 0 ? '+' : ''}${t.delta}</span></div>`;
  const hotRow = (h) => `<div role="button" tabindex="0" class="file-row" data-file="${esc(h.path)}" style="cursor:pointer"><div>${pathHtml(h.path)}<div style="margin-top:4px">${reasonChips(h.reasons)}</div>${ownerOf(h.path) ? `<div style="margin-top:4px">${ownerHtml(h.path)}</div>` : ''}</div>${riskPill(h.score)}</div>`;
  function deepHtml(r) {
    const ir = String(r.interestRate || '');
    return `<div class="deep">${ir ? `<div><span class="pill ${/critical|high/i.test(ir) ? 'crit' : ''}">Interest rate: ${esc(ir.split(/[\s—-]/)[0])}</span> <span class="muted" style="font-size:12px">${esc(ir.split(/[\s]/).slice(1).join(' ').replace(/^[—-]\s*/, ''))}</span></div>` : ''}
      <div class="narr"><div class="who">${icon('sparkles')} Assessment · ${esc(r.model || '')}</div>${keyPoints(r.assessment, 3)}</div>
      ${r.rootCauses?.length ? `<h5>Root causes</h5><ol>${r.rootCauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
      ${r.debtItems?.length ? `<h5>Findings</h5>${r.debtItems.map((i) => itemHtml({ ...i, severity: Math.max(1, Math.min(5, +i.severity || 2)), source: 'ai', fix: [i.fix, i.effort && `(effort ${i.effort})`].filter(Boolean).join(' ') })).join('')}` : ''}
      ${r.dependencyRisk ? `<h5>Dependency risk</h5><p>${esc(r.dependencyRisk)}</p>` : ''}
      ${r.refactorPlan?.length ? `<h5>Refactor plan</h5><ol>${r.refactorPlan.map((x) => `<li><b>${esc(x.step)}</b> <span class="pill">${esc(x.effort || '')}</span>${x.reducesScoreBy ? ` <span class="pill good">−${esc(String(x.reducesScoreBy).replace(/^-/, ''))} pts</span>` : ''}<br><span class="muted">${esc(x.why || '')}</span></li>`).join('')}</ol>` : ''}
      ${r.forecastNarrative ? `<h5>Forecast</h5><p>${esc(r.forecastNarrative)}</p>` : ''}</div>`;
  }

  function prPanel(p) {
    if (!p) return '';
    const tabs = [['summary', 'Summary'], ['debt', 'Findings', p.items.length], ['files', 'Files', p.fileCount]];
    if (!tabs.some((t) => t[0] === S.panelTab)) S.panelTab = 'summary';
    const secItems = p.items.filter((i) => i.category === 'Security');
    const meta = `${riskPill(p.risk)}<span class="advice ${p.mergeAdvice}">${esc((p.mergeAdvice || '').replace(/-/g, ' '))}</span><button class="pill" data-person="${esc(p.author || '')}" style="gap:5px">${avatar(p.author, p.avatar)}@${esc(p.author || '')}</button>${secItems.length ? `<span class="pill crit">${plural(secItems.length, 'security issue')}</span>` : ''}<span class="pill">${p.ageDays}d old</span><span class="pill">+${fmt(p.additions)} / −${fmt(p.deletions)}</span><span class="pill">${Math.round(p.pMerge * 100)}% merge odds</span>${p.draft ? '<span class="pill">draft</span>' : ''}${p.pending ? '<span class="pill accent"><span class="spinner"></span> AI reviewing</span>' : ''}`;
    let body = '';
    if (S.panelTab === 'summary') {
      body = `<div class="p-sec">${clampText(p.summary, 3, 'muted')}${p.forecast ? `<div class="narr" style="margin-top:10px"><div class="who">${icon('sparkles')} If merged as-is</div>${clampText(p.forecast, 3)}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">${icon('github')} Open on GitHub</a><button class="btn sm" data-show-pr="${p.number}">${icon('network')} Show on architecture</button></div></div>
        <div class="p-sec"><h4>Layers touched</h4><div class="p-meta" style="margin:0">${p.layers.map((l) => lchip(l)).join('')}</div></div>
        <div class="p-sec"><h4>Findings by category <span class="muted">${p.items.length}</span></h4><div class="p-meta" style="margin:0 0 10px">${Object.entries(p.items.reduce((m, i) => ((m[i.category] = (m[i.category] || 0) + 1), m), {})).map(([c, n]) => `<button class="pill" data-ptab="debt">${esc(c)} · ${n}</button>`).join('')}</div>${p.items.slice(0, 2).map(itemHtml).join('') || '<div class="muted">No debt detected.</div>'}${p.items.length > 3 ? `<button class="btn sm ghost" data-ptab="debt">See all ${p.items.length} ${icon('arrow-right')}</button>` : ''}</div>
        ${p.paydown?.length ? `<div class="p-sec"><h4>Debt it pays down</h4>${p.paydown.map((x) => `<div class="item"><div class="t" style="color:var(--good)">${icon('check')}<span>${esc(x.title)}</span></div>${x.detail ? `<div class="d">${esc(x.detail)}</div>` : ''}</div>`).join('')}</div>` : ''}
        ${p.conflicts?.length ? `<div class="p-sec"><h4>Overlaps with other open PRs</h4>${p.conflicts.map((c) => `<button class="file-row" data-pr="${c.number}" style="width:100%;text-align:left"><div><div>#${c.number}</div><div class="why mono">${esc(c.files.slice(0, 3).join(', '))}</div></div></button>`).join('')}</div>` : ''}`;
    } else if (S.panelTab === 'debt') {
      const g = {}; p.items.forEach((i) => (g[i.category] ||= []).push(i));
      body = `<div class="p-sec">${Object.entries(g).sort((a, b) => Math.max(...b[1].map((i) => i.severity)) - Math.max(...a[1].map((i) => i.severity))).map(([c, is], k) => acc(`prf-${p.number}-${c}`, `${sevChip(Math.max(...is.map((i) => i.severity)))}<span class="t">${esc(c)}</span>`, is.map((i) => `<div style="margin:2px 0 6px">${lchip(i.layer)}</div>${itemHtml(i)}`).join(''), { open: k === 0, meta: `<span>${is.length}</span>` })).join('') || '<div class="muted">No debt detected.</div>'}</div>`;
    } else {
      body = `<div class="p-sec">${p.files.map((f) => `<div class="file-row"><div><div class="p">${esc(f.path)}</div><div class="why">${esc(lname(f.layer))} · ${esc(f.status)}</div></div><span class="mono muted">+${f.additions} −${f.deletions}</span></div>`).join('')}</div>`;
    }
    return panelHead(icon('pr'), `<span class="muted">#${p.number}</span> ${esc(p.title)}`, '', meta, tabs) + `<div class="p-body">${body}</div>`;
  }

  function modulePanel(id) {
    const l = L(id.split('::')[0]); const m = l?.modules.find((x) => x.id === id); if (!m) return '';
    const hs = [...S.data.hotspots, ...l.hotspots].filter((h, i, a) => inMod(h.path, m) && a.findIndex((x) => x.path === h.path) === i);
    const prs = S.data.prs.filter((p) => p.files.some((f) => inMod(f.path, m)));
    const outE = S.data.moduleEdges.filter((e) => e.source === id).sort((a, b) => b.weight - a.weight), inE = S.data.moduleEdges.filter((e) => e.target === id).sort((a, b) => b.weight - a.weight);
    const mname = (x) => { const [ly, p] = x.split('::'); return `<span class="mono">${esc(p.split('/').slice(-2).join('/'))}</span>${ly !== l.id ? ` <span class="muted">· ${esc(lname(ly))}</span>` : ''}`; };
    const meta = `${bandBadge(m.score, true)}<span class="pill">${m.files} files</span><span class="pill">${fmt(m.loc)} LOC</span><span class="pill">${m.todos} TODOs</span>`;
    return panelHead(icon('file'), `<span class="mono" style="font-size:13px">${esc(m.path.split('/').slice(-2).join('/'))}</span>`, `<span class="mono">${esc(m.path)}</span> · ${esc(l.name)}`, meta) + `<div class="p-body">
      <div class="p-sec"><h4>Riskiest files</h4>${hs.slice(0, 6).map(hotRow).join('') || '<div class="muted">None in the hotspot list.</div>'}</div>
      <div class="p-sec"><h4>Open PRs touching it</h4>${prs.map((p) => `<button class="file-row" data-pr="${p.number}" style="width:100%;text-align:left"><div>#${p.number} ${esc(p.title)}</div>${riskPill(p.risk)}</button>`).join('') || '<div class="muted">None.</div>'}</div>
      <div class="p-sec"><h4>Imports from</h4>${outE.slice(0, 8).map((e) => `<div class="file-row"><span>${mname(e.target)}</span><span class="mono muted">${e.weight}</span></div>`).join('') || '<div class="muted">—</div>'}</div>
      <div class="p-sec"><h4>Imported by</h4>${inE.slice(0, 8).map((e) => `<div class="file-row"><span>${mname(e.source)}</span><span class="mono muted">${e.weight}</span></div>`).join('') || '<div class="muted">—</div>'}</div></div>`;
  }

  function filePanel(path) {
    const h = [...S.data.hotspots, ...S.data.layers.flatMap((l) => l.hotspots)].find((x) => x.path === path); if (!h) return '';
    const prs = S.data.prs.filter((p) => p.files.some((f) => f.path === path));
    const items = S.data.prs.flatMap((p) => p.items.filter((i) => i.file === path));
    const meta = `${bandBadge(h.score, true)}${lchip(h.layer)}<span class="pill">${fmt(h.loc)} LOC</span><span class="pill">${h.complexity} conditionals</span><span class="pill">fan-in ${h.fanIn ?? '—'}</span><span class="pill ${h.tested ? 'good' : 'crit'}">${h.tested ? 'has tests' : 'no linked tests'}</span>`;
    return panelHead(icon('file'), `<span class="mono" style="font-size:13px">${esc(path.split('/').pop())}</span>`, `<span class="mono">${esc(path)}</span>`, meta) + `<div class="p-body">
      <div class="p-sec"><h4>Why it is a hotspot</h4>${(h.reasons || []).length ? reasonChips(h.reasons) : '<div class="muted">—</div>'}</div>
      <div class="p-sec"><h4>Open PRs changing this file</h4>${prs.map((p) => `<button class="file-row" data-pr="${p.number}" style="width:100%;text-align:left"><div>#${p.number} ${esc(p.title)}</div>${riskPill(p.risk)}</button>`).join('') || '<div class="muted">None.</div>'}${items.map(itemHtml).join('')}</div></div>`;
  }

  function taskPanel(t) {
    if (!t) return '';
    const meta = `<span class="imp ${t.delta < 0 ? 'paydown' : t.delta > 0 ? 'accrual' : 'mixed'}">${esc(t.category)}</span><span class="pill"><span class="dlt ${t.delta > 0 ? 'pos' : 'neg'}">${t.delta > 0 ? '+' : ''}${t.delta}</span>&nbsp;debt points</span>${t.status ? `<span class="pill">${esc(t.status)}</span>` : ''}${t.type ? `<span class="pill">${esc(t.type)}</span>` : ''}`;
    return panelHead(icon('list'), esc(t.title), `${esc(t.key)}${t.doc ? ` · ${esc(t.doc)}` : ''}`, meta) + `<div class="p-body">
      <div class="p-sec"><h4>Layers it will touch</h4><div class="p-meta" style="margin:0">${t.layers.map((l) => lchip(l)).join('')}</div></div>
      <div class="p-sec"><h4>Why this forecast</h4><p style="margin:0;color:var(--text-2)">${esc(t.rationale)}</p>${t.mitigation ? `<div class="item" style="margin-top:10px"><div class="fix">${esc(t.mitigation)}</div></div>` : ''}</div>
      ${t.body ? `<div class="p-sec"><h4>Description</h4><p style="margin:0;color:var(--text-2);white-space:pre-wrap">${esc(t.body)}</p></div>` : ''}
      ${t.url ? `<div class="p-sec"><a class="btn sm" href="${esc(t.url)}" target="_blank" rel="noopener">${icon('external')} Open ticket</a></div>` : ''}</div>`;
  }

  function bindPanel(el) {
    $$('[data-close]', el).forEach((b) => b.addEventListener('click', () => select(null)));
    $$('[data-ptab]', el).forEach((b) => b.addEventListener('click', () => { S.panelTab = b.dataset.ptab; renderPanel(); }));
    $$('[data-deep]', el).forEach((b) => b.addEventListener('click', () => deepDive(b.dataset.deep)));
    $$('[data-drill]', el).forEach((b) => b.addEventListener('click', () => drillInto(b.dataset.drill)));
    $$('[data-show-scenario]', el).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.showScenario; S.drill = null; G.rendered = false; S.sel = { type: 'scenario', id }; setPage('arch'); requestAnimationFrame(() => select({ type: 'scenario', id })); }));
    $$('[data-show-pr]', el).forEach((b) => b.addEventListener('click', () => { const n = +b.dataset.showPr; S.drill = null; G.rendered = false; S.sel = { type: 'pr', id: n }; setPage('arch'); requestAnimationFrame(() => select({ type: 'pr', id: n })); }));
  }

  async function deepDive(layerId) {
    S.deep[layerId] = { loading: true }; renderPanel({ soft: true });
    const st = settings();
    try {
      const r = await fetch('/api/deep-dive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: S.data.jobId, layerId, openaiKey: st.openaiKey, model: st.model, openaiBaseUrl: st.openaiBaseUrl }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      S.deep[layerId] = { data: j };
    } catch (e) { S.deep[layerId] = { error: e.message }; }
    if (S.sel?.type === 'layer' && S.sel.id === layerId) renderPanel({ soft: true });
  }

  /* =====================================================================
     Charts
     ===================================================================== */
  function repoComponents() {
    const d = S.data; const ls = d.layers.filter((l) => l.id !== 'tests' && l.id !== 'config');
    const w = ls.map((l) => Math.sqrt(l.loc + 50)); const W0 = w.reduce((a, b) => a + b, 0) || 1;
    return d.days.map((_, k) => { const o = { total: d.summary.series[k] }; COMPONENTS.forEach((c) => (o[c.key] = ls.reduce((a, l, i) => a + l.series[k][c.key] * w[i], 0) / W0)); return o; });
  }
  function mountChart(el) {
    const kind = el.dataset.chart;
    if (kind === 'layer') { const l = L(el.dataset.layer); if (l) stackChart(el, l.series, { height: 150, whatIf: l.whatIfAllMerged }); }
    if (kind === 'repo') stackChart(el, repoComponents(), { height: 150, zones: true, compactLegend: true });
  }
  function stackChart(el, series, { height = 150, whatIf = null, zones = false, compactLegend = false } = {}) {
    const days = S.data.days; const width = Math.max(260, el.clientWidth || 360);
    const m = { l: 26, r: zones ? 54 : 10, t: 10, b: 22 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const x = (i) => m.l + (i / (days.length - 1)) * iw, y = (v) => m.t + (1 - Math.max(0, Math.min(100, v)) / 100) * ih;
    const stacks = series.map((s) => {
      const pos = COMPONENTS.map((c) => Math.max(0, s[c.key])); const sum = pos.reduce((a, b) => a + b, 0) || 1; const f = s.total / sum;
      let acc = 0; return pos.map((v) => { const a = acc; acc += v * f; return [a, acc]; });
    });
    let svg = `<svg viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="Debt forecast chart">`;
    svg += `<g class="grid">${[0, 25, 50, 75, 100].map((v) => `<line x1="${m.l}" x2="${width - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>`;
    svg += `<g class="axis">${[0, 50, 100].map((v) => `<text x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('')}${days.map((dd, i) => `<text x="${x(i)}" y="${height - 6}" text-anchor="middle" ${i === S.day ? 'style="fill:var(--accent);font-weight:600"' : ''}>${dd === 0 ? 'now' : dd + 'd'}</text>`).join('')}</g>`;
    if (zones) svg += BANDS.slice(0, 3).map((b, i) => `<line x1="${m.l}" x2="${width - m.r}" y1="${y(b.max)}" y2="${y(b.max)}" style="stroke:var(${BANDS[i + 1].v});stroke-dasharray:2 4;opacity:.7"/><text class="zone-label" x="${width - m.r + 6}" y="${y(b.max) - 3}">${BANDS[i + 1].label}</text>`).join('') + `<text class="zone-label" x="${width - m.r + 6}" y="${y(12)}">Healthy</text>`;
    COMPONENTS.forEach((c, j) => {
      const top = stacks.map((s, i) => `${x(i)},${y(s[j][1])}`), bot = stacks.map((s, i) => `${x(i)},${y(s[j][0])}`).reverse();
      svg += `<polygon points="${[...top, ...bot].join(' ')}" style="fill:var(${c.v});fill-opacity:${j === 0 ? 0.4 : 0.85}"/>`;
    });
    svg += `<polyline points="${series.map((s, i) => `${x(i)},${y(s.total)}`).join(' ')}" fill="none" style="stroke:var(--text)" stroke-width="2" stroke-linejoin="round"/>`;
    if (whatIf != null) svg += `<line x1="${m.l}" x2="${width - m.r}" y1="${y(whatIf)}" y2="${y(whatIf)}" style="stroke:var(--c-pending)" stroke-dasharray="4 4" stroke-width="1.5"/>`;
    svg += `<line class="xh" x1="${x(S.day)}" x2="${x(S.day)}" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--accent)" stroke-width="1.2"/><circle class="xd" cx="${x(S.day)}" cy="${y(series[S.day].total)}" r="4" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2"/>`;
    svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" style="cursor:crosshair"/></svg>`;
    const legend = compactLegend ? '' : `<div class="legend-row">${COMPONENTS.map((c) => `<span><i style="background:var(${c.v})"></i>${c.label}</span>`).join('')}<span><i style="background:var(--text);height:2px;width:14px;border-radius:0"></i>Total</span>${whatIf != null ? `<span><i class="ln"></i>All PRs merged today</span>` : ''}</div>`;
    el.innerHTML = svg + `<div class="chart-tip" hidden></div>${legend}`;
    const tip = $('.chart-tip', el), hit = $('.hit', el), xh = $('.xh', el), xd = $('.xd', el), svgEl = $('svg', el);
    const place = (i) => { xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xd.setAttribute('cx', x(i)); xd.setAttribute('cy', y(series[i].total)); };
    const show = (i) => {
      const s = series[i]; place(i);
      const sc = svgEl.clientWidth / width;
      tip.hidden = false; tip.style.left = `${x(i) * sc}px`; tip.style.top = `${y(s.total) * sc - 10}px`;
      tip.innerHTML = `<b>${days[i] === 0 ? 'Today' : `In ${days[i]} days`}</b>${COMPONENTS.map((c) => `<div class="r"><span><i style="background:var(${c.v})"></i>${c.label}</span>${s[c.key] >= 0 ? '+' : '−'}${Math.abs(s[c.key]).toFixed(1)}</div>`).join('')}<div class="r tot"><span>Debt index</span>${Math.round(s.total)} · ${band(s.total).label}</div>`;
    };
    const idxAt = (e) => { const r = hit.getBoundingClientRect(); return Math.max(0, Math.min(days.length - 1, Math.round(((e.clientX - r.left) / r.width) * (days.length - 1)))); };
    hit.addEventListener('mousemove', (e) => show(idxAt(e)));
    hit.addEventListener('mouseleave', () => { tip.hidden = true; place(S.day); });
    hit.addEventListener('click', (e) => setDay(idxAt(e)));
  }
  const spark = (vals, w = 64, h = 20) => {
    const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
    const yy = (v) => h - ((v - min) / (max - min || 1)) * h;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="overflow:visible"><polyline points="${vals.map((v, i) => `${(i / (vals.length - 1)) * w},${yy(v)}`).join(' ')}" fill="none" style="stroke:var(--text-2)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${w}" cy="${yy(vals.at(-1))}" r="2.5" style="fill:${bandColor(vals.at(-1))}"/></svg>`;
  };

  /* =====================================================================
     Pages
     ===================================================================== */
  function renderOverview() {
    const d = S.data, s = d.summary, sc = d.security;
    const core = d.layers.filter((l) => !['tests', 'config'].includes(l.id));
    const worst = [...core].sort((a, b) => b.score90 - a.score90)[0];
    const riskiest = d.prs[0];
    const acc0 = d.backlog.tasks.filter((t) => t.delta > 0), pay = d.backlog.tasks.filter((t) => t.delta < 0);
    const net = d.backlog.tasks.reduce((a, t) => a + t.delta, 0);
    const risks = s.topRisks?.length ? s.topRisks : derivedRisks();
    const loading = S.live && d.phase !== 'final';
    const df = d.history?.diff;
    $('#page-overview').innerHTML = `<div class="wrap">
      <div class="page-head"><div><h1>${esc(d.repo.fullName)}</h1><p>${esc(d.repo.description || d.archNotes || '')}</p></div>
        <div class="actions"><button class="btn" data-go="security">${icon('shield')} Security</button><button class="btn primary" data-go="arch">${icon('network')} Explore architecture</button></div></div>
      <div class="ov-hero">
        <div class="card headline">
          <div style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px">${s.narrative ? `${icon('sparkles')} AI briefing` : 'Summary'}${loading ? ' · <span class="spinner" style="color:var(--accent)"></span> AI agents still working' : ''}</div>
          <h2>${esc(s.headline || '')}</h2>
          <div class="insights">${insightChips(d)}</div>
          ${s.narrative ? acc('ov-brief', `${icon('sparkles')}<span class="t">Read the AI briefing</span>`, keyPoints(s.narrative, 4), { cls: 'flat brief' }) : loading ? `<p><span class="skeleton" style="display:block;height:12px;margin:4px 0">&nbsp;</span><span class="skeleton" style="display:block;height:12px;width:70%">&nbsp;</span></p>` : `<p class="muted" style="margin:0">Add an OpenAI key in Settings for a written briefing, AI PR reviews and a threat model.</p>`}
          <div class="meta">${d.repo.language ? `<span class="pill">${esc(d.repo.language)}</span>` : ''}<span class="pill">${fmt(s.files)} files</span><span class="pill">${fmt(s.loc)} LOC</span><span class="pill">${plural(d.layers.length, 'layer')}</span><span class="pill">analyzed ${ago(d.analyzedAt)}</span>${df ? `<button class="pill accent" data-go="timeline">${icon('history')} ${df.index[1] - df.index[0] >= 0 ? '+' : ''}${df.index[1] - df.index[0]} since ${ago(df.from)}</button>` : ''}</div>
        </div>
        <div class="card index-card">
          <div style="display:flex;justify-content:space-between;align-items:center"><span class="muted" style="font-size:12px;font-weight:500">Repo debt index</span>${bandBadge(s.index)}</div>
          <div class="row"><span class="big">${s.index}</span><span class="arrow">→</span><span class="big2">${s.index90}</span><span class="muted" style="font-size:12px">in 90 days ${deltaHtml(s.index, s.index90)}</span></div>
          <div class="chart" data-chart="repo"></div>
        </div>
      </div>
      <div class="grid g-4" style="margin-bottom:14px">
        <button class="card stat click" ${worst ? `data-goto-layer="${worst.id}"` : ''}><span class="k">${icon('target')} Riskiest layer</span><span class="v">${esc(worst?.name.split(' /')[0] || '—')}</span><span class="s">${worst ? `${bandBadge(worst.score90)} reaches ${worst.score90} by day 90` : ''}</span></button>
        <button class="card stat click" data-go="security"><span class="k">${icon('shield')} Security exposure</span><span class="v">${sc ? sc.score : '—'}<small>${sc ? sc.posture.verdict + ' to be attacked' : ''}</small></span><span class="s">${sc ? `${sc.posture.critical} critical · ${sc.posture.high} high · ${sc.deps.vulnerablePackages} vulnerable deps` : 'not scanned'}</span></button>
        <button class="card stat click" data-go="prs"><span class="k">${icon('pr')} Unmerged PRs</span><span class="v">${s.analyzedPRs}<small>of ${s.openPRs} open</small></span><span class="s">${riskiest ? `riskiest #${riskiest.number} · risk ${riskiest.risk}` : 'nothing waiting to merge'}</span></button>
        <button class="card stat click" data-go="backlog"><span class="k">${icon('list')} Planned work</span><span class="v">${d.backlog.tasks.length}<small>${d.backlog.tasks.length ? `net ${net > 0 ? '+' : ''}${net} pts` : 'items'}</small></span><span class="s">${d.backlog.tasks.length ? `${acc0.length} add debt · ${pay.length} pay it down` : 'connect Jira or paste a design doc'}</span></button>
      </div>
      <div class="grid g-2">
        <div class="card"><div class="card-h"><h3>Layers</h3><span class="sub">sorted by 90-day forecast · click to inspect</span></div><div class="card-b" style="padding:4px 6px 6px;overflow-x:auto">
          <table class="lt"><thead><tr><th>Layer</th><th>Status</th><th class="num">Today</th><th class="num">90 days</th><th>Trend</th><th class="num" title="Security debt">Security</th><th class="num">PRs</th><th class="num" title="Layers that depend on it">Blast</th></tr></thead><tbody>
          ${[...d.layers].sort((a, b) => b.score90 - a.score90).map((l) => `<tr data-goto-layer="${l.id}"><td><span class="lname">${icon(LAYER_ICON[l.id])}${esc(l.name)}</span></td><td>${bandBadge(l.score)}</td><td class="num score">${l.score}</td><td class="num"><span class="score">${l.score90}</span> ${deltaHtml(l.score, l.score90)}</td><td>${spark(l.series.map((x) => x.total))}</td><td class="num">${l.security ? `<span style="display:inline-flex;gap:5px;align-items:center">${bandDot(l.security.score)}${l.security.score}</span>` : '—'}</td><td class="num">${l.prCount || '<span class="muted">0</span>'}</td><td class="num">${l.blastRadius}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Top risks</h3><span class="sub" style="display:inline-flex;gap:4px;align-items:center">${s.topRisks?.length ? `${icon('sparkles')} AI · expand for details` : 'from static analysis'}</span></div><div class="card-b">
          ${risks.length ? risks.slice(0, 5).map((r, i) => acc(`risk-${i}-${r.title}`, `<span class="n" style="width:20px;height:20px;border-radius:6px;background:var(--surface-2);display:grid;place-items:center;font-size:11px;flex-shrink:0">${i + 1}</span><span class="t">${esc(r.title)}</span>`, `<p style="margin:0 0 6px;color:var(--text-2)">${esc(r.why)}</p>${r.action ? `<h5 class="mini-h">What needs to be done</h5>${todoList(splitSteps(r.action).length ? splitSteps(r.action) : [r.action])}` : ''}${L(r.layer) ? `<div style="margin-top:8px">${lchip(r.layer)}</div>` : ''}`, { open: i === 0, cls: 'flat', meta: r.horizon ? `<span class="pill">${esc(r.horizon === 'now' ? 'act now' : 'within ' + r.horizon)}</span>` : '' })).join('') : '<div class="empty"><b>No major risks</b>No layer scores above Watch.</div>'}
        </div></div>
      </div>
      ${s.recommendations?.length ? `<div style="margin-top:14px">${acc('ov-recs', `${icon('sparkles')}<span class="t">Recommended next steps</span>`, todoList(s.recommendations), { open: true, meta: `<span>${s.recommendations.filter((r) => store.get(todoKey(r), false)).length}/${s.recommendations.length} done</span>` })}</div>` : ''}
    </div>`;
    $$('[data-chart]', $('#page-overview')).forEach(mountChart);
  }

  function insightChips(d) {
    const core = d.layers.filter((l) => !['tests', 'config'].includes(l.id)); const out = [];
    const mover = [...core].sort((a, b) => b.score90 - b.score - (a.score90 - a.score))[0];
    if (mover && mover.score90 - mover.score > 0) out.push(`<button class="ins" data-goto-layer="${mover.id}">${icon('arrow-right')}<span><b>${esc(mover.name.split(' /')[0])}</b> rises fastest</span><em class="up">+${mover.score90 - mover.score}</em></button>`);
    const sc = d.security; if (sc) out.push(`<button class="ins" data-go="security">${icon('shield')}<span><b>${esc(sc.posture.verdict)}</b> to be attacked</span><em style="color:${bandColor(sc.score)}">${sc.score}</em></button>`);
    if (d.prs[0]) out.push(`<button class="ins" data-pr="${d.prs[0].number}">${icon('pr')}<span>Riskiest PR <b>#${d.prs[0].number}</b></span><em style="color:${bandColor(d.prs[0].risk)}">${d.prs[0].risk}</em></button>`);
    const top = d.hotspots[0]; if (top) out.push(`<button class="ins" data-file="${esc(top.path)}">${icon('flame')}<span>Hottest file <b>${esc(top.path.split('/').pop())}</b></span><em style="color:${bandColor(top.score)}">${top.score}</em></button>`);
    if (d.cycles.length || d.summary.violations) out.push(`<button class="ins" data-sub="report:structure">${icon('cycle')}<span><b>${d.cycles.length}</b> cycles · <b>${d.summary.violations}</b> violations</span></button>`);
    return out.join('');
  }
  function derivedRisks() {
    const d = S.data; const out = [];
    for (const l of [...d.layers].filter((x) => !['tests', 'config'].includes(x.id)).sort((a, b) => b.score90 - a.score90).slice(0, 3)) {
      if (l.score90 < 30) continue;
      const top = l.staticDrivers[0];
      out.push({ title: `${l.name}: ${band(l.score90).label.toLowerCase()} by day 90`, layer: l.id, why: `${top ? `${top.label} (${top.detail})` : 'Static signals'}${l.prItems.length ? `; ${plural(l.prItems.length, 'finding')} from open PRs` : ''}${l.series[0].inherited > 2 ? `; inherits +${Math.round(l.series[0].inherited)} from dependencies` : ''}.`, action: l.hotspots[0] ? `Start with ${l.hotspots[0].path.split('/').pop()}` : '', horizon: l.score90 >= 70 ? 'now' : '30d' });
    }
    if (d.prs[0]?.risk >= 50) out.push({ title: `PR #${d.prs[0].number} adds significant debt`, layer: d.prs[0].primaryLayer, why: d.prs[0].items.slice(0, 2).map((i) => i.title).join('; '), action: 'Review before merging', horizon: 'now' });
    return out;
  }

  function renderPRs() {
    const d = S.data, f = S.prFilter; const el = $('#page-prs');
    const layersIn = [...new Set(d.prs.flatMap((p) => p.layers))];
    const list = d.prs.filter((p) => (f.advice === 'all' || p.mergeAdvice === f.advice) && (!f.layer || p.layers.includes(f.layer)) && (!f.q || `${p.number} ${p.title} ${p.author}`.toLowerCase().includes(f.q.toLowerCase())));
    const counts = { all: d.prs.length }; d.prs.forEach((p) => (counts[p.mergeAdvice] = (counts[p.mergeAdvice] || 0) + 1));
    el.innerHTML = `<div class="wrap">
      <div class="page-head"><div><h1>Unmerged pull requests</h1><p>${d.prs.length ? `${d.prs.length} analyzed of ${d.summary.openPRs} open. Repo merge rate ${Math.round(d.summary.velocity.mergeRate * 100)}%, median ${d.summary.velocity.medianDaysToMerge} days to merge. Each PR's debt is weighted by its merge odds.` : ''}</p></div></div>
      ${d.prs.length ? `<div class="filters"><div class="search">${icon('search')}<input id="prSearch" placeholder="Filter PRs" value="${esc(f.q)}" aria-label="Filter pull requests" /></div>
        ${[['all', 'All'], ['rework', 'Rework'], ['merge-with-fixes', 'Merge with fixes'], ['merge', 'Merge']].map(([k, t]) => `<button class="chip ${f.advice === k ? 'on' : ''}" data-advice="${k}" style="font-family:var(--font)">${t} <span class="muted">${counts[k] || 0}</span></button>`).join('')}
        <span class="spacer"></span>${layersIn.map((l) => `<button class="chip ${f.layer === l ? 'on' : ''}" data-flayer="${l}" style="font-family:var(--font)">${esc(lname(l).split(' /')[0])}</button>`).join('')}</div>
      <div class="card list">${list.map((p) => `<button class="row-item ${S.sel?.type === 'pr' && S.sel.id === p.number ? 'on' : ''}" data-pr="${p.number}">
          <div class="risk-meter" title="Risk ${p.risk}: ${band(p.risk).label}"><b>${p.risk}</b><div class="track"><i style="width:${p.risk}%;background:${bandColor(p.risk)}"></i></div></div>
          <div style="min-width:0"><div class="ri-title"><span class="num">#${p.number}</span><span class="tt">${esc(p.title)}</span></div>
            <div class="ri-meta"><span>${esc(p.author || '')}</span><span>${p.ageDays}d</span><span class="mono">+${fmt(p.additions)} −${fmt(p.deletions)}</span>${p.draft ? '<span class="pill">draft</span>' : ''}${ldots(p.layers)}${p.pending ? '<span class="pill accent"><span class="spinner"></span> AI</span>' : p.analyzedBy === 'ai' ? `<span class="ai-tag">${icon('sparkles')}AI</span>` : ''}</div></div>
          <div class="ri-right"><span class="advice ${p.mergeAdvice}">${esc((p.mergeAdvice || '').replace(/-/g, ' '))}</span>${sevStack(p.items)}<span>${Math.round(p.pMerge * 100)}% merge odds</span></div>
        </button>`).join('') || '<div class="empty"><b>No PRs match</b>Try clearing the filters.</div>'}</div>`
        : `<div class="card"><div class="empty"><b>No open pull requests</b>Nothing is waiting to merge, so the forecast includes no PR debt.</div></div>`}
    </div>`;
    const q = $('#prSearch', el); q?.addEventListener('input', debounce(() => { S.prFilter.q = q.value; renderPRs(); const n = $('#prSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 150));
    $$('[data-advice]', el).forEach((b) => b.addEventListener('click', () => { S.prFilter.advice = b.dataset.advice; renderPRs(); }));
    $$('[data-flayer]', el).forEach((b) => b.addEventListener('click', () => { S.prFilter.layer = S.prFilter.layer === b.dataset.flayer ? null : b.dataset.flayer; renderPRs(); }));
  }

  function renderBacklog() {
    const b = S.data.backlog, o = b.overview || {}, el = $('#page-backlog'), f = S.blFilter;
    if (!b.tasks.length) {
      el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>Backlog forecast</h1><p>See how planned work will add debt to each layer or pay it down.</p></div></div><div class="card"><div class="empty"><b>No backlog connected</b>Connect Jira, paste a PRD or design doc, or upload a Jira/Linear CSV, then analyze again. GitHub Issues are used automatically when the repo has them.<br><button class="btn primary" data-open-settings>${icon('settings')} Connect a backlog</button></div></div></div>`;
      return;
    }
    const by = {}; b.tasks.forEach((t) => t.layers.forEach((l) => { by[l] ||= { pos: 0, neg: 0 }; const v = t.delta / t.layers.length; if (v > 0) by[l].pos += v; else by[l].neg -= v; }));
    const maxV = Math.max(1, ...Object.values(by).flatMap((v) => [v.pos, v.neg]));
    const list = b.tasks.filter((t) => (f.kind === 'all' || (f.kind === 'accrual' ? t.delta > 0 : t.delta < 0)) && (!f.q || `${t.key} ${t.title} ${t.rationale}`.toLowerCase().includes(f.q.toLowerCase())));
    el.innerHTML = `<div class="wrap">
      <div class="page-head"><div><h1>Backlog forecast</h1><p>Sources: ${esc(b.sources.join(' · ') || '—')}</p></div></div>
      <div class="grid g-2e" style="margin-bottom:14px">
        <div class="card"><div class="card-h"><h3>What the plan does to debt</h3></div><div class="card-b">
          <p style="margin:0 0 8px;color:var(--text-2)">${esc(o.summary || '')}</p>${o.forecast ? `<p style="margin:0 0 6px">${esc(o.forecast)}</p>` : ''}
          ${o.themes?.length ? `<div style="margin-top:8px">${o.themes.map((t) => `<div class="theme-row"><span class="imp ${esc(t.impact)}">${esc(t.impact)}</span><div style="flex:1;min-width:0"><b>${esc(t.name)}</b><div class="muted" style="font-size:12.5px">${esc(t.detail || '')}</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${(t.layers || []).filter((x) => L(x)).map((x) => lchip(x)).join('')}</div></div></div>`).join('')}</div>` : ''}
          ${o.missingWork?.length ? `<h4 style="margin:14px 0 6px;font-size:12px">Missing from the backlog</h4><ul style="margin:0;padding-left:18px;color:var(--text-2)">${o.missingWork.map((mw) => `<li style="margin-bottom:4px">${esc(mw)}</li>`).join('')}</ul>` : ''}
        </div></div>
        <div class="card"><div class="card-h"><h3>Net impact by layer</h3><span class="sub">debt points</span></div><div class="card-b">
          <div class="dv-head"><span></span><span>◀ pays down</span><span>adds debt ▶</span><span></span></div>
          <div class="diverge">${Object.entries(by).sort((a, b2) => b2[1].pos - b2[1].neg - (a[1].pos - a[1].neg)).map(([l, v]) => { const n = Math.round(v.pos - v.neg); return `<div class="dv" title="${esc(lname(l))}: +${v.pos.toFixed(1)} added, −${v.neg.toFixed(1)} paid down"><span class="l">${icon(LAYER_ICON[l])}${esc(lname(l).split(' /')[0])}</span><span class="neg"><i style="width:${(v.neg / maxV) * 100}%"></i></span><span class="pos"><i style="width:${(v.pos / maxV) * 100}%"></i></span><span class="n dlt ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${n > 0 ? '+' : ''}${n}</span></div>`; }).join('')}</div>
          ${b.designDocs?.length ? `<h4 style="margin:16px 0 6px;font-size:12px">Design docs read</h4>${b.designDocs.map((x) => `<div class="file-row"><span class="p">${esc(x.path)}</span><span class="mono muted">${fmt(x.size)} chars</span></div>`).join('')}` : ''}
        </div></div>
      </div>
      <div class="filters"><div class="search">${icon('search')}<input id="blSearch" placeholder="Filter items" value="${esc(f.q)}" aria-label="Filter backlog" /></div>
        ${[['all', 'All', b.tasks.length], ['accrual', 'Adds debt', b.tasks.filter((t) => t.delta > 0).length], ['paydown', 'Pays down', b.tasks.filter((t) => t.delta < 0).length]].map(([k, t, n]) => `<button class="chip ${f.kind === k ? 'on' : ''}" data-kind="${k}" style="font-family:var(--font)">${t} <span class="muted">${n}</span></button>`).join('')}</div>
      <div class="card" style="overflow:hidden"><table class="dt"><thead><tr><th>Item</th><th>Layers</th><th style="width:200px">Debt impact</th></tr></thead><tbody>
        ${list.map((t) => `<tr class="click" data-task="${esc(t.key)}" title="${esc(t.rationale)}"><td><span class="mono muted">${esc(t.key)}</span> <b style="font-weight:550">${esc(t.title)}</b><div class="muted" style="font-size:11.5px">${esc([t.status, t.type].filter(Boolean).join(' · '))}</div></td><td>${ldots(t.layers)}</td><td>${impactBar(t.delta)}</td></tr>`).join('') || `<tr><td colspan="3"><div class="empty">No items match.</div></td></tr>`}
      </tbody></table></div></div>`;
    const q = $('#blSearch', el); q?.addEventListener('input', debounce(() => { S.blFilter.q = q.value; renderBacklog(); const n = $('#blSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 150));
    $$('[data-kind]', el).forEach((x) => x.addEventListener('click', () => { S.blFilter.kind = x.dataset.kind; renderBacklog(); }));
  }

  function renderHotspots() {
    const d = S.data, el = $('#page-hotspots');
    const files = [...d.hotspots, ...d.layers.flatMap((l) => l.hotspots)].filter((h, i, a) => a.findIndex((x) => x.path === h.path) === i);
    el.innerHTML = `<div class="wrap">
      <div class="page-head"><div><h1>Hotspots</h1><p>The riskiest files, grouped by layer. Circle size is lines of code; colour is the debt band. A file ranks high for conditional complexity, size, how many files import it, nesting, debt markers, suppressions, and import cycles.</p></div></div>
      <div class="card" style="margin-bottom:14px"><div class="card-b"><div class="pack" id="pack"></div><div class="legend-row" style="justify-content:center">${BANDS.map((b) => `<span>${bandDot(b.max - 5)}${b.label}</span>`).join('')}</div></div></div>
      <div class="card" style="overflow-x:auto"><table class="dt"><thead><tr><th class="num">Score</th><th>File</th><th>Layer</th><th>Signals</th><th>Last change</th></tr></thead><tbody>
        ${[...files].sort((a, b) => b.score - a.score).slice(0, 50).map((h) => `<tr class="click" data-file="${esc(h.path)}"><td class="num">${riskPill(h.score)}</td><td>${pathHtml(h.path)}</td><td>${ldots([h.layer])}</td><td>${reasonChips(h.reasons)}</td><td>${ownerOf(h.path) ? ownerHtml(h.path) : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    requestAnimationFrame(() => renderPack(files));
  }
  function renderPack(files) {
    const host = $('#pack'); if (!host || typeof d3 === 'undefined' || !host.clientWidth) return;
    const width = host.clientWidth, height = Math.min(560, Math.max(340, width * 0.5));
    const groups = d3.groups(files.filter((f) => f.layer !== 'tests'), (f) => f.layer).map(([layer, fs]) => ({ name: layer, children: fs.map((f) => ({ name: f.path, value: Math.max(30, f.loc), f })) }));
    if (!groups.length) { host.innerHTML = '<div class="empty">No hotspots.</div>'; return; }
    const rootH = d3.hierarchy({ children: groups }).sum((x) => x.value || 0).sort((a, b) => b.value - a.value);
    d3.pack().size([width, height]).padding((n) => (n.depth === 0 ? 14 : 3))(rootH);
    const svg = d3.select(host).html('').append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('height', height).attr('role', 'img').attr('aria-label', 'Hotspot map');
    const lay = svg.selectAll('g.l').data(rootH.children || []).join('g');
    lay.append('circle').attr('class', 'lyr').attr('cx', (n) => n.x).attr('cy', (n) => n.y).attr('r', (n) => n.r);
    lay.append('text').attr('class', 'lyr-l').attr('x', (n) => n.x).attr('y', (n) => n.y - n.r + 14).attr('text-anchor', 'middle').text((n) => (n.r > 40 ? lname(n.data.name).split(' /')[0] : ''));
    svg.selectAll('circle.f').data(rootH.leaves()).join('circle').attr('class', 'f').attr('cx', (n) => n.x).attr('cy', (n) => n.y).attr('r', (n) => n.r)
      .attr('style', (n) => `fill:${bandColor(n.data.f.score)};fill-opacity:.85`)
      .on('mouseenter', (ev, n) => { const f = n.data.f; packTip(ev, `<b class="mono" style="font-size:11.5px;color:var(--text)">${esc(f.path)}</b><div style="margin:4px 0">${bandBadge(f.score, true)} ${lchip(f.layer, false)}</div>${esc((f.reasons || []).slice(0, 3).join(' · '))}`); })
      .on('mousemove', (ev) => packTip(ev)).on('mouseleave', () => { const t = $('.chart-tip', host); if (t) t.hidden = true; })
      .on('click', (ev, n) => select({ type: 'file', id: n.data.f.path }));
    svg.selectAll('text.fl').data(rootH.leaves().filter((n) => n.r > 26)).join('text').attr('class', 'fl').attr('x', (n) => n.x).attr('y', (n) => n.y + 3).attr('text-anchor', 'middle').text((n) => { const b = n.data.name.split('/').pop(); const max = Math.floor(n.r / 3.4); return b.length > max ? b.slice(0, max) + '…' : b; });
    host.insertAdjacentHTML('beforeend', '<div class="chart-tip" hidden style="transform:translate(12px,12px);white-space:normal;width:260px"></div>');
    function packTip(ev, html) { const t = $('.chart-tip', host); if (html) t.innerHTML = html; t.hidden = false; const r = host.getBoundingClientRect(); t.style.left = Math.min(ev.clientX - r.left, r.width - 280) + 'px'; t.style.top = ev.clientY - r.top + 'px'; }
  }

  function renderReport() {
    const d = S.data, s = d.summary, el = $('#page-report');
    const risks = s.topRisks?.length ? s.topRisks : derivedRisks();
    const viol = d.edges.filter((e) => e.violation);
    const tabs = [['briefing', 'Briefing', 'file'], ['agents', 'AI agents', 'bot', d.usage ? Object.keys(d.usage.agents || {}).length : 0], ['structure', 'Structure', 'network', d.cycles.length + viol.length], ['run', 'Run details', 'clock', d.warnings?.length || null]];
    if (!tabs.some((t) => t[0] === S.sub.report)) S.sub.report = 'briefing';
    let body = '';
    if (S.sub.report === 'briefing') {
      body = `<div class="report"><p class="muted" style="margin:0 0 6px">${esc(d.repo.fullName)} · ${new Date(d.analyzedAt).toLocaleString()}</p><h1>${esc(s.headline)}</h1>
        ${s.narrative ? `<div class="lead">${keyPoints(s.narrative, 5)}</div>` : `<p class="lead muted">Add an OpenAI key in Settings and re-run for a written briefing.</p>`}
        ${d.archNotes ? `<p class="muted" style="margin-top:10px"><b style="color:var(--text)">Architecture.</b> ${esc(d.archNotes)}</p>` : ''}
        <h3>Top risks</h3>${risks.map((r, i) => acc(`rr-${i}`, `<span class="t">${i + 1}. ${esc(r.title)}</span>`, `<p style="margin:0 0 6px;color:var(--text-2)">${esc(r.why)}</p>${r.action ? `<div class="item"><div class="fix">${esc(r.action)}</div></div>` : ''}`, { open: i < 2, meta: `${L(r.layer) ? lchip(r.layer, false) : ''}${r.horizon ? `<span class="pill">${esc(r.horizon)}</span>` : ''}` })).join('') || '<p class="muted">None.</p>'}
        ${d.security ? `<h3>Security</h3>${acc('rs-sec', `<span class="t">Exposure ${d.security.score} · ${esc(d.security.posture.verdict)} to be attacked</span>`, `${clampText(d.security.posture.aiWhy || d.security.posture.summary, 3, 'muted')}<div style="margin-top:8px">${d.security.threats.scenarios.slice(0, 4).map((x) => `<button class="file-row" data-scenario="${x.id}" style="width:100%;text-align:left"><span>${esc(x.title)}</span><span class="li"><span class="${x.impact}">${x.impact}</span></span></button>`).join('')}</div>`, { open: true })}` : ''}
        ${s.recommendations?.length ? `<h3>What needs to be done</h3>${todoList(s.recommendations)}` : ''}
        <div style="display:flex;gap:8px;margin-top:20px"><button class="btn" id="exportBtn">${icon('download')} Export JSON</button><button class="btn" id="printBtn">${icon('file')} Print</button></div></div>`;
    } else if (S.sub.report === 'agents') {
      body = agentsBoard();
    } else if (S.sub.report === 'structure') {
      body = `<div class="grid g-2e">
        <div class="card"><div class="card-h"><h3>Import cycles</h3><span class="sub">${d.cycles.length}</span></div><div class="card-b">${d.cycles.length ? d.cycles.slice(0, 8).map((c, i) => acc(`cy-${i}`, `<span class="t">${c.size} files</span>${c.layers.map((l) => lchip(l, false)).join(' ')}`, c.files.map((x) => `<div class="mono" style="font-size:11.5px;padding:2px 0">${esc(x)}</div>`).join(''), { cls: 'flat' })).join('') : '<p class="muted" style="margin:0">No import cycles.</p>'}</div></div>
        <div class="card"><div class="card-h"><h3>Layering violations</h3><span class="sub">${viol.length}</span></div><div class="card-b">${viol.map((e, i) => acc(`vi-${i}`, `${lchip(e.source, false)} → ${lchip(e.target, false)}`, (e.samples || []).map((x) => `<div class="mono" style="font-size:11.5px;padding:2px 0">${esc(x.from)} → ${esc(x.to)}</div>`).join(''), { cls: 'flat', meta: `<span>${plural(e.weight, 'import')}</span>` })).join('') || '<p class="muted" style="margin:0">None. Every layer only imports layers below it.</p>'}</div></div></div>`;
    } else {
      body = `<div class="card"><div class="card-b"><div class="kv" style="grid-template-columns:160px 1fr"><span>Mode</span><span>${esc(d.mode)}${d.model ? ` · ${esc(d.model)}` : ''}</span><span>Files</span><span>${d.stats.analysedFiles} analysed of ${d.stats.totalFiles}</span><span>GitHub API calls</span><span>${d.stats.githubCalls}</span><span>Total time</span><span>${d.stats.seconds ?? '—'}s</span>${d.usage ? `<span>OpenAI</span><span>${d.usage.calls} calls, ${d.usage.cached || 0} cached, ${fmt((d.usage.prompt || 0) + (d.usage.completion || 0))} tokens</span>` : ''}${d.stats.timings ? `<span>Stages</span><span>${Object.entries(d.stats.timings).map(([k, v]) => `<span class="pill" style="margin:0 4px 4px 0">${esc(k)} ${v}s</span>`).join('')}</span>` : ''}</div>
        ${d.warnings?.length ? `<div style="margin-top:14px">${acc('warn', `<span class="t">${plural(d.warnings.length, 'warning')}</span>`, `<ul style="margin:0;color:var(--text-2)">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`)}</div>` : ''}</div></div>`;
    }
    el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>Report & agents</h1><p>The briefing, which AI agents and engines ran behind it, and run diagnostics.</p></div></div>${subtabs('report', tabs)}${body}</div>`;
    $('#exportBtn')?.addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = `narc-${d.repo.fullName.replace('/', '-')}.json`; a.click(); });
    $('#printBtn')?.addEventListener('click', () => window.print());
  }

  /* =====================================================================
     v3 shared components
     ===================================================================== */
  const subtabs = (page, tabs) => `<div class="subtabs" role="tablist">${tabs.map(([id, label, ic, n]) => `<button data-sub="${page}:${id}" class="${S.sub[page] === id ? 'on' : ''}" role="tab" aria-selected="${S.sub[page] === id}">${ic ? icon(ic) : ''}${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  const acc = (id, summary, body, { open = false, meta = '', cls = '' } = {}) => `<details class="acc ${cls}" data-acc="${esc(id)}" ${S.open.has(id) || (open && !S.closed.has(id)) ? 'open' : ''}><summary>${icon('chevron', 'chev')}<span class="ttl">${summary}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</summary><div class="acc-b">${body}</div></details>`;
  const clampText = (text, lines = 3, cls = '') => (!text ? '' : String(text).length < 260 ? `<p class="${cls}" style="margin:0">${esc(text)}</p>` : `<div class="clamp ${cls}" style="--lines:${lines}">${esc(text)}</div><button class="more" data-more>Show more</button>`);
  const SEV_LABEL = { 5: 'Critical', 4: 'High', 3: 'Medium', 2: 'Low', 1: 'Info' };
  const SEV_SHAPE = { 5: BANDS[3].shape, 4: BANDS[2].shape, 3: BANDS[1].shape, 2: BANDS[0].shape, 1: BANDS[0].shape };
  const sevChip = (s) => `<span class="sev-chip s${s}"><svg viewBox="0 0 10 10">${SEV_SHAPE[s] || SEV_SHAPE[1]}</svg>${SEV_LABEL[s] || 'Info'}</span>`;
  const techInfo = (id) => S.tech?.get(id) || { id, name: id, tactic: '', url: id.startsWith('AML.') ? `https://atlas.mitre.org/techniques/${id}` : `https://attack.mitre.org/techniques/${id.replace('.', '/')}/` };
  const techChip = (t, full = false) => { const x = typeof t === 'string' ? techInfo(t) : t; return `<button class="tech ${x.id.startsWith('AML.') ? 'atlas' : ''}" data-tech="${esc(x.id)}" title="${esc(x.name)}${x.tactic ? ` · ${esc(x.tactic)}` : ''}"><b>${esc(x.id)}</b>${full || x.name.length < 26 ? esc(x.name) : esc(x.name.slice(0, 24)) + '…'}</button>`; };
  const initials = (s) => esc(String(s || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?');
  const avatar = (login, url, lg = false) => (url ? `<img class="avatar ${lg ? 'lg' : ''}" src="${esc(url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar${lg ? ' lg' : ''}',textContent:'${initials(login)}'}))">` : `<span class="avatar ${lg ? 'lg' : ''}">${initials(login)}</span>`);
  const prLink = (n) => (S.data.prs.some((p) => p.number === n) ? `<button class="link" data-pr="${n}">#${n}</button>` : `<a href="${esc(S.data.repo.url)}/pull/${n}" target="_blank" rel="noopener">#${n}</a>`);
  const ownerOf = (path) => S.data.people?.fileOwners?.[path]?.[0];
  const ownerHtml = (path, { full = false } = {}) => {
    const o = ownerOf(path); if (!o) return '';
    return `<span class="owner">${avatar(o.login || o.name, o.avatar)}<button class="link" data-person="${esc(o.login || o.name)}"><b>${esc(o.login ? '@' + o.login : o.name)}</b></button>${full ? `<span>· ${esc(o.message)}</span>` : ''}<span>· ${ago(o.date)}</span>${o.pr ? `<span>· ${prLink(o.pr)}</span>` : ''}<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.short)}</a></span>`;
  };
  const blobUrl = (file, line) => `${S.data.repo.url}/blob/${S.data.repo.defaultBranch || 'main'}/${file}${line ? `#L${line}` : ''}`;
  const sec = () => S.data.security;
  const findingBy = (fp) => sec()?.findings.find((f) => f.fp === fp) || sec()?.prFindings?.find((f) => f.fp === fp);
  const entryLayers = () => { const s = sec(); const set = new Set((s?.surface.endpoints || []).map((e) => e.layer)); ['api', 'ui', 'integrations'].forEach((l) => L(l) && set.add(l)); return [...set].filter(L); };
  function shortestPath(from, to) {
    if (from === to) return [from];
    const edges = S.data.edges; const prev = new Map([[from, null]]); const q = [from];
    while (q.length) { const v = q.shift(); for (const e of edges) if (e.source === v && e.source !== 'tests' && !prev.has(e.target)) { prev.set(e.target, v); if (e.target === to) { const p = [to]; let c = v; while (c) { p.unshift(c); c = prev.get(c); } return p; } q.push(e.target); } }
    return null;
  }
  const exposurePath = (layer) => entryLayers().map((e) => shortestPath(e, layer)).filter(Boolean).sort((a, b) => a.length - b.length)[0] || [layer];
  const reachable = (layer) => { const out = new Set(); const q = [layer]; while (q.length) { const v = q.shift(); for (const e of S.data.edges) if (e.source === v && !out.has(e.target) && e.target !== layer) { out.add(e.target); q.push(e.target); } } return [...out]; };
  const chainHtml = (path, { entryLabel = null, target = null, inert = false } = {}) => `<div class="chain-path">${entryLabel ? `<span class="hop entry">${icon('crosshair')}${esc(entryLabel)}</span><span class="arr">→</span>` : ''}${path.map((l, i) => `<${inert ? 'span' : 'button'} class="hop ${!entryLabel && i === 0 ? 'entry' : ''}" ${inert ? '' : `data-goto-layer="${l}"`}>${icon(LAYER_ICON[l] || 'layers')}${esc(lname(l).split(' /')[0])}</${inert ? 'span' : 'button'}>`).join('<span class="arr">→</span>')}${target && !L(target) ? `<span class="arr">→</span><span class="hop target">${icon('database')}${esc(target)}</span>` : ''}</div>`;
  const AGENT_INFO = {
    'Layer Architect': ['network', 'Checks directory-to-layer assignments and fixes misclassified folders.'],
    'PR Reviewer': ['pr', 'Reads each unmerged PR diff and forecasts the debt and security issues it introduces.'],
    'Doc Reader': ['file', 'Extracts planned work, deferred items and limitations from design docs.'],
    'Backlog Analyst': ['list', 'Maps each backlog item to layers and estimates debt added or paid down.'],
    'Backlog Strategist': ['target', 'Summarises what the roadmap does to debt and what work is missing.'],
    'Threat Modeler': ['bug', 'Red-teams the repo: builds attack scenarios from findings, CVEs and endpoints, mapped to MITRE.'],
    'Executive Briefer': ['sparkles', 'Writes the headline, top risks and recommended next steps.'],
    'Layer Narrator': ['layers', 'Writes a short assessment for every layer.'],
    'Deep Diver': ['search', 'On demand: reads a layer\'s riskiest files and writes a refactor plan.'],
  };
  const ENGINES = [
    ['Static analyzer', 'cpu', 'Metrics, imports, cycles, layering rules and hotspots for every file.'],
    ['Security scanner', 'shield', `${'~30'} rules (secrets, injection, SSRF, XSS, crypto, CI/CD, LLM) mapped to CWE + MITRE.`],
    ['OSV.dev', 'package', 'Free vulnerability database: checks every declared dependency version for known CVEs.'],
    ['GitHub', 'github', 'Source archive, PRs and diffs, issues, commits, contributors, releases.'],
    ['Threat intel', 'globe', 'Tavily / Exa web search for exploits and advisories (optional keys).'],
  ];
  function liveStatusText() {
    const run = Object.entries(S.agentsLive).filter(([, a]) => a.running > 0).map(([n, a]) => (a.running > 1 ? `${n} ×${a.running}` : n));
    return run.length ? run.slice(0, 2).join(' · ') + (run.length > 2 ? ` +${run.length - 2}` : '') : null;
  }
  function onAgent(ev) {
    const a = (S.agentsLive[ev.agent] ||= { running: 0, done: 0, cached: 0, errors: 0, ms: 0, model: ev.model, engine: !!ev.engine });
    if (ev.model) a.model = ev.model;
    if (ev.state === 'start') a.running++;
    else if (ev.state === 'done') { a.running = Math.max(0, a.running - (ev.engine ? a.running : 1)); a.done++; a.ms += ev.ms || 0; }
    else if (ev.state === 'cached') a.cached++;
    else if (ev.state === 'error') { a.running = Math.max(0, a.running - 1); a.errors++; }
    if (S.data && S.live) { const t = liveStatusText(); if (t) setStatus({ text: t, p: S.statusP || 0.4 }); }
    if (S.page === 'report' && S.sub.report === 'agents') renderReport();
  }

  /* =====================================================================
     Security page
     ===================================================================== */
  function renderSecurity() {
    const el = $('#page-security'); const s = sec();
    if (!s) { el.innerHTML = `<div class="wrap"><div class="card"><div class="empty"><b>No security data</b>Re-run the analysis to scan for security debt.</div></div></div>`; return; }
    const tabs = [['posture', 'Posture', 'shield'], ['findings', 'Findings', 'bug', s.findings.length], ['deps', 'Dependencies', 'package', s.vulns.length], ['surface', 'Attack surface', 'crosshair', s.surface.total], ['threats', 'Threats & MITRE', 'target', s.threats.scenarios.length], ['intel', 'Threat intel', 'globe', s.intel.length]];
    if (!tabs.some((t) => t[0] === S.sub.security)) S.sub.security = 'posture';
    const head = `<div class="page-head"><div><h1>Security</h1><p>Security debt, known-vulnerable dependencies, where an attacker can probe, and how an attack could unfold, mapped to MITRE ATT&CK and ATLAS.</p></div></div>`;
    const body = { posture: secPosture, findings: secFindings, deps: secDeps, surface: secSurface, threats: secThreats, intel: secIntel }[S.sub.security](s);
    el.innerHTML = `<div class="wrap">${head}${subtabs('security', tabs)}${body}</div>`;
    const q = $('#secSearch', el); q?.addEventListener('input', debounce(() => { S.secFilter.q = q.value; renderSecurity(); hydrate(el); const n = $('#secSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 150));
  }
  function gaugeSvg(v, size = 150, label = '') {
    const r = size / 2 - 12, c = 2 * Math.PI * r, arc = c * 0.75, f = (arc * Math.min(100, v)) / 100;
    return `<svg width="${size}" height="${size * 0.82}" viewBox="0 0 ${size} ${size * 0.82}" role="img" aria-label="${label} ${v}"><g transform="rotate(135 ${size / 2} ${size / 2})"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:var(--surface-3)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${arc} ${c}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${bandColor(v)}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${f} ${c}"/></g><text x="50%" y="${size / 2 + 4}" text-anchor="middle" style="fill:var(--text);font-size:${size / 4}px;font-weight:700;letter-spacing:-.04em">${v}</text><text x="50%" y="${size / 2 + size / 6}" text-anchor="middle" style="fill:var(--muted);font-size:11px">out of 100</text></svg>`;
  }
  function secPosture(s) {
    const p = s.posture; const cnt = (fn) => s.findings.filter(fn).length;
    const tiles = [
      ['Critical', p.critical, 'alert', 'findings', { sev: 5 }], ['High', p.high, 'alert', 'findings', { sev: 4 }], ['Vulnerable packages', s.deps.vulnerablePackages, 'package', 'deps'],
      ['Open sensitive endpoints', s.surface.sensitiveOpen, 'crosshair', 'surface'], ['Secrets', cnt((f) => f.category === 'Secrets'), 'key', 'findings', { cat: 'Secrets' }], ['AI / LLM issues', cnt((f) => f.category === 'AI / LLM'), 'sparkles', 'findings', { cat: 'AI / LLM' }],
    ];
    const layersSorted = S.data.layers.filter((l) => l.security).sort((a, b) => b.security.score - a.security.score);
    const cats = Object.entries(s.categories).sort((a, b) => b[1] - a[1]); const maxC = Math.max(1, ...cats.map((c) => c[1]));
    const top = [...s.findings.filter((f) => f.severity >= 4).slice(0, 5).map((f) => ({ k: 'f', f })), ...s.vulns.filter((v) => v.severity >= 4 && !v.dev).slice(0, 3).map((v) => ({ k: 'v', v }))];
    const d = S.data.history?.diff;
    const probe = p.firstProbe || (s.surface.endpoints.find((e) => e.auth === 'none' && e.sensitive) && (() => { const e = s.surface.endpoints.find((x) => x.auth === 'none' && x.sensitive); return `${e.method} ${e.path} (${e.file.split('/').pop()}) has no visible auth check.`; })());
    return `<div class="sec-hero">
        <div class="card gauge-card">${gaugeSvg(s.score, 160, 'Security exposure')}<div>${bandBadge(s.score)}</div><span class="lbl">Security exposure</span></div>
        <div class="card verdict ${p.verdict}">
          <div class="q">${icon('bug')} Can this be attacked?</div>
          <div class="a"><span class="dot"></span>${p.verdict === 'likely' ? 'Likely: realistic footholds today' : p.verdict === 'possible' ? 'Possible, if someone targets it' : 'Unlikely from static signals'}</div>
          ${clampText(p.aiWhy || p.summary, 2)}
          ${probe ? `<div class="probe">${icon('crosshair')}<div><b>Where an attacker would probe first</b><div class="muted">${esc(probe)}</div></div></div>` : ''}
          <div class="tiles">${tiles.map(([k, v, ic, tab, f]) => `<button class="tile" data-sub="security:${tab}" ${f ? `data-secfilter='${JSON.stringify(f)}'` : ''}><span class="k">${icon(ic)}${k}</span><span class="v">${v}</span></button>`).join('')}</div>
        </div>
      </div>
      <div class="grid g-2e" style="margin-bottom:14px">
        <div class="card"><div class="card-h"><h3>Security debt by layer</h3><span class="sub">0–100, higher is worse</span></div><div class="card-b">${layersSorted.map((l) => `<button class="hbar" data-goto-layer="${l.id}" data-ptab-next="sec" style="width:100%;text-align:left"><div class="lab"><span class="lname">${icon(LAYER_ICON[l.id])}${esc(l.name)}</span><small>${plural(l.security.findings, 'finding')} · ${plural(l.security.vulns, 'vulnerable dep')} · ${l.security.openEndpoints} open endpoints</small></div><div class="track"><i style="width:${l.security.score}%;background:${bandColor(l.security.score)}"></i></div><span class="val">${l.security.score}</span></button>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Findings by category</h3><span class="sub">${plural(s.findings.length, 'finding')}</span></div><div class="card-b">${cats.length ? cats.map(([c, n]) => `<button class="hbar" data-sub="security:findings" data-secfilter='${JSON.stringify({ cat: c })}' style="width:100%;text-align:left"><div class="lab">${esc(c)}</div><div class="track"><i style="width:${(n / maxC) * 100}%;background:var(--text-2)"></i></div><span class="val">${n}</span></button>`).join('') : '<div class="empty">No static findings.</div>'}</div></div>
      </div>
      <div class="grid g-2e">
        <div class="card"><div class="card-h"><h3>Top exposures</h3><span class="sub">expand for details</span></div><div class="card-b">${top.length ? top.map((x, i) => x.k === 'f'
          ? acc(`top-${x.f.fp}`, `${sevChip(x.f.severity)}<span class="t">${esc(x.f.title)}</span>`, `<div class="code">${x.f.line ? `<span class="ln">${x.f.line}</span>` : ''}${esc(x.f.snippet)}</div><div style="margin-top:8px">${fixPlanHtml(x.f, { compact: true })}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${x.f.attack.map((a) => techChip(a)).join('')}</div><div style="margin-top:8px">${ownerHtml(x.f.file)}</div><button class="btn sm" data-finding="${x.f.fp}" style="margin-top:8px">Open details ${icon('arrow-right')}</button>`, { meta: `<span class="mono">${esc(x.f.file.split('/').pop())}${x.f.line ? ':' + x.f.line : ''}</span>`, cls: 'flat', open: i === 0 })
          : acc(`top-${x.v.id}`, `${sevChip(x.v.severity)}<span class="t">${esc(x.v.package)}@${esc(x.v.version)}: ${esc(x.v.aliases[0] || x.v.id)}</span>`, `<p style="margin:0 0 6px;color:var(--text-2)">${esc(x.v.summary)}</p><div class="kv"><span>Fixed in</span><span>${esc(x.v.fixed || 'no fix listed')}</span><span>Used by</span><span>${(x.v.usedBy?.layers || []).map((l) => lchip(l)).join(' ') || '—'}</span></div><button class="btn sm" data-vuln="${esc(x.v.package)}" style="margin-top:8px">Open package ${icon('arrow-right')}</button>`, { meta: esc(x.v.ecosystem), cls: 'flat' })).join('') : '<div class="empty"><b>Nothing high-severity</b>No high or critical findings.</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>Since the last analysis</h3><span class="sub">${d ? ago(d.from) : 'no previous snapshot'}</span></div><div class="card-b">${d ? `<div class="diff-grid">
            <div class="tile"><span class="k">Exposure</span><span class="v">${d.security[1] ?? '—'}</span>${d.security[0] != null ? deltaHtml(d.security[0], d.security[1]) : ''}</div>
            <div class="tile"><span class="k">New findings</span><span class="v">${d.newFindings.length}</span></div>
            <div class="tile"><span class="k">Fixed</span><span class="v" style="color:var(--good)">${d.fixedFindings.length}</span></div>
            <div class="tile"><span class="k">New CVEs</span><span class="v">${d.newVulns.length}</span></div></div>
            ${d.newFindings.slice(0, 4).map((f) => `<div class="file-row"><span>${sevChip(f.severity)} ${esc(f.title)}</span><span class="mono muted">${esc(f.file.split('/').pop())}</span></div>`).join('')}
            <button class="btn sm ghost" data-go="timeline" style="margin-top:6px">See full timeline ${icon('arrow-right')}</button>`
          : '<div class="empty">Run the analysis again later to see what changed. Each run is saved as a snapshot.</div>'}</div></div>
      </div>`;
  }
  function secFindings(s) {
    const f = S.secFilter; const q = f.q.toLowerCase();
    const list = s.findings.filter((x) => (f.cat === 'all' || x.category === f.cat) && x.severity >= (f.sev || 0) && (!q || `${x.title} ${x.file} ${x.cwe} ${x.snippet}`.toLowerCase().includes(q)));
    const cats = {}; s.findings.forEach((x) => (cats[x.category] = (cats[x.category] || 0) + 1));
    const groups = {}; list.forEach((x) => (groups[x.category] ||= []).push(x));
    const row = (x) => `<div role="button" tabindex="0" class="row-item" data-finding="${x.fp}" style="grid-template-columns:90px minmax(0,1fr) auto;padding:10px 6px;cursor:pointer"><span>${sevChip(x.severity)}</span><div style="min-width:0"><div class="ri-title"><span class="tt">${esc(x.title)}</span><span class="cwe">${esc(x.cwe)}</span></div><div class="ri-meta">${ldots([x.layer])}${pathHtml(x.file, x.line)}${x.attack.slice(0, 2).map((a) => `<span class="tech ${a.startsWith('AML') ? 'atlas' : ''}"><b>${esc(a)}</b></span>`).join('')}</div></div><div class="ri-right">${ownerHtml(x.file)}</div></div>`;
    return `<div class="filters"><div class="search">${icon('search')}<input id="secSearch" placeholder="Search findings, files, CWE" value="${esc(f.q)}" aria-label="Search findings" /></div>
        <button class="chip ${f.cat === 'all' ? 'on' : ''}" data-secfilter='{"cat":"all"}' style="font-family:var(--font)">All <span class="muted">${s.findings.length}</span></button>
        ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="chip ${f.cat === c ? 'on' : ''}" data-secfilter='${JSON.stringify({ cat: c })}' style="font-family:var(--font)">${esc(c)} <span class="muted">${n}</span></button>`).join('')}
        <span class="spacer"></span><div class="seg">${[[0, 'Any'], [3, 'Medium+'], [4, 'High+'], [5, 'Critical']].map(([v, t]) => `<button class="${(f.sev || 0) === v ? 'on' : ''}" data-secfilter='{"sev":${v}}'>${t}</button>`).join('')}</div></div>
      ${Object.keys(groups).length ? Object.entries(groups).map(([c, xs], i) => acc(`fg-${c}`, `<span class="t">${esc(c)}</span>`, `<div class="list">${xs.map(row).join('')}</div>`, { open: i < 2, meta: `${xs.filter((x) => x.severity >= 4).length ? sevChip(Math.max(...xs.map((x) => x.severity))) : ''}<span>${plural(xs.length, 'finding')}</span>` })).join('') : '<div class="card"><div class="empty"><b>No findings match</b>Try another filter.</div></div>'}
      ${s.prFindings?.length ? `<h3 style="font-size:13px;margin:22px 0 10px">Introduced by unmerged PRs</h3>${acc('pr-sec', `<span class="t">${plural(s.prFindings.length, 'security issue')} waiting to merge</span>`, `<div class="list">${s.prFindings.map((x) => `<div class="file-row"><div><div>${sevChip(x.severity)} <b>${esc(x.title)}</b> <span class="cwe">${esc(x.cwe)}</span></div><div class="why mono">${esc(x.file)} · ${esc(x.snippet)}</div></div><span class="owner">${avatar(x.author, x.avatar)}<button class="link" data-person="${esc(x.author)}">@${esc(x.author)}</button> · ${prLink(x.pr)}</span></div>`).join('')}</div>`, { open: true })}` : ''}`;
  }
  function secDeps(s) {
    const byPkg = {}; s.vulns.forEach((v) => (byPkg[v.package] ||= []).push(v));
    const pk = Object.entries(byPkg).sort((a, b) => Math.max(...b[1].map((v) => v.severity)) - Math.max(...a[1].map((v) => v.severity)));
    return `<div class="tiles" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:16px">
        <div class="tile"><span class="k">${icon('package')}Dependencies declared</span><span class="v">${s.deps.total}</span></div>
        <div class="tile"><span class="k">Ecosystems</span><span class="v" style="font-size:15px;padding-top:6px">${esc(s.deps.ecosystems.join(', ') || '—')}</span></div>
        <div class="tile"><span class="k">${icon('alert')}Vulnerable packages</span><span class="v">${pk.length}</span></div>
        <div class="tile"><span class="k">Critical / high advisories</span><span class="v">${s.vulns.filter((v) => v.severity >= 4).length}</span></div>
        <div class="tile"><span class="k">Unpinned (prod)</span><span class="v">${s.deps.unpinned.length}</span></div></div>
      ${s.deps.pending ? `<div class="note" style="margin:0 0 12px">OSV lookup still running; vulnerabilities appear when AI review finishes.</div>` : ''}
      ${pk.length ? pk.map(([name, vs], i) => { const v0 = vs[0]; const maxS = Math.max(...vs.map((v) => v.severity)); return acc(`pkg-${name}`, `${sevChip(maxS)}<span class="t"><span class="mono">${esc(name)}@${esc(v0.version)}</span></span>`, `
          <div class="kv" style="margin-bottom:10px"><span>Ecosystem</span><span>${esc(v0.ecosystem)}${v0.dev ? ' · dev dependency' : ''}</span><span>Declared in</span><span class="mono">${esc(v0.manifest)} (${esc(v0.spec)})</span><span>Fix</span><span>${esc(vs.map((v) => v.fixed).filter(Boolean).sort().at(-1) || 'no fixed version listed')}</span><span>Blast radius</span><span>${(v0.usedBy?.layers || []).map((l) => lchip(l)).join(' ') || '<span class="muted">not imported directly</span>'} ${v0.usedBy?.files ? `<span class="muted">· ${plural(v0.usedBy.files, 'file')} import it</span>` : ''}</span></div>
          ${vs.map((v) => `<div class="item"><div class="t">${sevChip(v.severity)}<span><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.aliases[0] || v.id)}</a> <span class="muted" style="font-weight:400">${esc(v.id !== (v.aliases[0] || v.id) ? v.id : '')}</span></span></div><div class="d">${esc(v.summary)}</div>${v.fixed ? `<div class="fix">Upgrade to ${esc(v.fixed)} or later</div>` : ''}<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${v.attack.map((a) => techChip(a)).join('')}</div></div>`).join('')}`, { open: i === 0, meta: `<span>${plural(vs.length, 'advisory', 'advisories')}</span>${v0.dev ? '<span class="pill">dev</span>' : ''}` }); }).join('') : '<div class="card"><div class="empty"><b>No known vulnerabilities</b>OSV.dev found no advisories for the declared versions.</div></div>'}
      ${s.deps.unpinned.length ? acc('unpinned', `<span class="t">Unpinned production dependencies</span>`, s.deps.unpinned.map((d) => `<div class="file-row"><span class="mono">${esc(d.name)} <span class="muted">${esc(d.spec || '(no version)')}</span></span><span class="mono muted">${esc(d.manifest)}</span></div>`).join(''), { meta: `<span>${s.deps.unpinned.length}</span>` }) : ''}`;
  }
  function secSurface(s) {
    const f = S.secFilter.ep || 'all';
    const eps = s.surface.endpoints.filter((e) => f === 'all' || (f === 'open' ? e.auth === 'none' : f === 'sensitive' ? e.sensitive : e.webhook));
    const byFile = {}; eps.forEach((e) => (byFile[e.file] ||= []).push(e));
    return `<p class="muted" style="margin:-4px 0 14px">Probe points: routes an attacker can reach from outside. The auth check is a heuristic (it looks for middleware, decorators or guards next to each route), so verify anything marked "no visible auth".</p>
      <div class="tiles" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:16px">
        <button class="tile" data-secfilter='{"ep":"all"}'><span class="k">${icon('crosshair')}Endpoints</span><span class="v">${s.surface.total}</span></button>
        <button class="tile" data-secfilter='{"ep":"open"}'><span class="k">No visible auth</span><span class="v" style="color:var(--crit)">${s.surface.open}</span></button>
        <button class="tile" data-secfilter='{"ep":"sensitive"}'><span class="k">Sensitive</span><span class="v">${s.surface.endpoints.filter((e) => e.sensitive).length}</span></button>
        <button class="tile" data-secfilter='{"ep":"webhook"}'><span class="k">Webhooks</span><span class="v">${s.surface.webhooks}</span></button></div>
      <div class="filters">${[['all', 'All'], ['open', 'No visible auth'], ['sensitive', 'Sensitive'], ['webhook', 'Webhooks']].map(([k, t]) => `<button class="chip ${f === k ? 'on' : ''}" data-secfilter='{"ep":"${k}"}' style="font-family:var(--font)">${t}</button>`).join('')}</div>
      ${Object.keys(byFile).length ? Object.entries(byFile).sort((a, b) => b[1].filter((e) => e.auth === 'none').length - a[1].filter((e) => e.auth === 'none').length).map(([file, es], i) => acc(`ep-${file}`, `<span class="t mono" style="font-size:12px">${esc(file)}</span>${lchip(es[0].layer, false)}`, es.map((e) => `<button class="file-row" data-ep="${esc(`${e.method} ${e.path} ${e.file}`)}" style="width:100%;text-align:left;align-items:center"><span style="display:flex;gap:10px;align-items:center"><span class="ep-method">${esc(e.method)}</span><span class="mono">${esc(e.path)}</span>${e.sensitive ? '<span class="pill crit">sensitive</span>' : ''}${e.webhook ? '<span class="pill">webhook</span>' : ''}</span><span class="auth ${e.auth}">${e.auth === 'likely' ? '✓ auth check' : e.auth === 'file-level' ? '~ file-level auth' : '✕ no visible auth'}</span></button>`).join(''), { open: i < 3, meta: `<span>${plural(es.length, 'route')}</span>${es.some((e) => e.auth === 'none') ? `<span class="auth none">${es.filter((e) => e.auth === 'none').length} open</span>` : ''}` })).join('') : '<div class="card"><div class="empty"><b>No endpoints detected</b>Narc recognises Express, Fastify, Next.js, FastAPI, Flask, Django, Go and Spring routes.</div></div>'}`;
  }
  function secThreats(s) {
    const scen = s.threats.scenarios; const tactics = ['Reconnaissance', 'Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Exfiltration', 'Impact', ...(s.mitre.some((t) => t.tactic === 'Other') ? ['Other'] : [])];
    const byT = {}; s.mitre.forEach((t) => (byT[t.tactic] ||= []).push(t));
    const maxN = Math.max(1, ...s.mitre.map((t) => t.findings + t.vulns + t.scenarios));
    return `<div class="card-h" style="padding:0 0 10px"><h3>Attack scenarios</h3><span class="sub">${s.threats.source === 'ai' ? `${icon('sparkles')} Threat Modeler` : 'from static analysis'} · click a card to trace it</span></div>
      <div class="scen-grid" style="margin-bottom:24px">${scen.map((x) => `<div role="button" tabindex="0" class="scen ${S.sel?.type === 'scenario' && S.sel.id === x.id ? 'on' : ''}" data-scenario="${x.id}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="li"><span class="${x.likelihood}">${x.likelihood} likelihood</span><span class="${x.impact}">${x.impact} impact</span></span>${x.source === 'ai' ? `<span class="ai-tag">${icon('sparkles')}AI</span>` : '<span class="rule-tag">rule</span>'}</div>
          <h4>${esc(x.title)}</h4>
          ${chainHtml(x.path.length ? x.path : [x.entryPoint.layer], { entryLabel: x.entryPoint.endpoint, target: x.target, inert: true })}
          <div style="display:flex;gap:4px;flex-wrap:wrap">${x.techniques.slice(0, 3).map((t) => `<span class="tech ${t.id.startsWith('AML') ? 'atlas' : ''}"><b>${esc(t.id)}</b>${esc(t.name.length > 22 ? t.name.slice(0, 21) + '…' : t.name)}</span>`).join('')}${x.techniques.length > 3 ? `<span class="pill">+${x.techniques.length - 3}</span>` : ''}</div>
        </div>`).join('') || '<div class="card"><div class="empty"><b>No scenarios</b>No exploitable chains from the current evidence.</div></div>'}</div>
      <div class="card"><div class="card-h"><h3>MITRE ATT&CK & ATLAS coverage</h3><span class="sub">techniques evidenced in this repo · click a cell</span></div><div class="card-b"><div class="matrix">
        ${tactics.map((t) => `<div class="mcol"><h5>${t}</h5>${(byT[t] || []).map((x) => { const n = x.findings + x.vulns + x.scenarios; return `<button class="mcell" data-tech="${esc(x.id)}"><span class="heat" style="opacity:${(0.06 + 0.3 * (n / maxN) + (x.maxSeverity >= 5 ? 0.1 : 0)).toFixed(2)}"></span><span class="id"><span>${esc(x.id)}</span>${x.atlas ? '<span style="color:var(--accent)">ATLAS</span>' : ''}</span><span>${esc(x.name)}</span><span class="muted" style="display:block;font-size:10.5px;margin-top:3px">${[x.findings && `${x.findings} findings`, x.vulns && `${x.vulns} CVEs`, x.scenarios && `${x.scenarios} scenarios`].filter(Boolean).join(' · ')}</span></button>`; }).join('') || '<div class="mcell empty"><span class="muted">—</span></div>'}</div>`).join('')}
      </div></div></div>`;
  }
  function secIntel(s) {
    if (!s.intel.length) {
      const configured = store.get('tavilyKey', '') || store.get('exaKey', '') || health.tavily || health.exa;
      return `<div class="card"><div class="empty"><b>${configured ? 'No threat intel results' : 'Threat intel is off'}</b>${configured ? 'The searches returned nothing relevant this time.' : 'Add a Tavily or Exa API key. Narc will then search the web for exploits, PoCs and advisories for your vulnerable packages, frameworks and AI stack, and pass them to the Threat Modeler.'}<br>${configured ? '' : `<button class="btn primary" data-open-settings>${icon('settings')} Add a key</button>`}</div></div>`;
    }
    const byTopic = {}; s.intel.forEach((x) => (byTopic[x.topic] ||= []).push(x));
    return Object.entries(byTopic).map(([topic, xs], i) => acc(`intel-${topic}`, `<span class="t">${esc(topic)}</span>`, `<div class="scen-grid">${xs.map((x) => `<div class="intel-card"><div style="display:flex;gap:6px;align-items:center"><span class="src ${x.source.toLowerCase()}">${esc(x.source)}</span>${x.published ? `<span class="muted" style="font-size:11.5px">${esc(String(x.published).slice(0, 10))}</span>` : ''}</div><a class="t" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>${clampText(x.snippet, 3, 'muted')}<span class="mono muted" style="font-size:11px">${esc(new URL(x.url).host)}</span></div>`).join('')}</div>`, { open: i < 2, meta: `<span>${plural(xs.length, 'source')}</span>` })).join('');
  }

  /* Security panels */
  function findingPanel(fp) {
    const f = findingBy(fp); if (!f) return '';
    const tabs = [['summary', 'Details'], ['trace', 'Trace'], ['mitre', 'MITRE', f.attack.length]];
    if (!tabs.some((t) => t[0] === S.panelTab)) S.panelTab = 'summary';
    const meta = `${sevChip(f.severity)}<span class="pill">${esc(f.category)}</span><span class="pill mono">${esc(f.cwe)}</span>${lchip(f.layer)}${f.pr ? `<span class="pill accent">in PR #${f.pr}</span>` : ''}`;
    let body = '';
    if (S.panelTab === 'summary') {
      body = `<div class="p-sec"><h4>Evidence</h4><div class="code">${f.line ? `<span class="ln">${f.line}</span>` : ''}${esc(f.snippet)}</div>${f.more ? `<p class="muted" style="font-size:12px;margin:6px 0 0">+${f.more} more in this file</p>` : ''}</div>
        <div class="p-sec"><h4>What needs to be done</h4>${fixPlanHtml(f)}</div>
        <div class="p-sec"><h4>Where it lives</h4><div class="kv"><span>File</span><span><a class="mono" href="${esc(blobUrl(f.file, f.line))}" target="_blank" rel="noopener">${esc(f.file)}${f.line ? ':' + f.line : ''}</a></span><span>Layer</span><span>${lchip(f.layer)}</span><span>Last changed</span><span>${ownerHtml(f.file) || (f.author ? `<span class="owner">${avatar(f.author, f.avatar)}@${esc(f.author)} · ${prLink(f.pr)}</span>` : '<span class="muted">not traced</span>')}</span></div></div>`;
    } else if (S.panelTab === 'trace') {
      const path = exposurePath(f.layer); const reach = reachable(f.layer);
      const owners = S.data.people?.fileOwners?.[f.file] || [];
      const prs = S.data.prs.filter((p) => p.files.some((x) => x.path === f.file));
      const scen = sec().threats.scenarios.filter((s) => (s.evidence || []).some((e) => (e.fp || e) === f.fp) || s.entryPoint?.file === f.file);
      body = `<div class="p-sec"><h4>How an attacker reaches it</h4>${chainHtml(path)}<p class="muted" style="font-size:12px;margin:8px 0 0">Shortest route from a public entry layer, following the import graph.</p></div>
        <div class="p-sec"><h4>Blast radius if exploited <span class="muted">${plural(reach.length, 'layer')} reachable</span></h4><div class="p-meta" style="margin:0">${reach.map((l) => lchip(l)).join('') || '<span class="muted">Nothing downstream.</span>'}</div></div>
        <div class="p-sec"><h4>Who touched this file</h4>${owners.length ? owners.map((o) => `<div class="file-row"><span class="owner">${avatar(o.login || o.name, o.avatar)}<button class="link" data-person="${esc(o.login || o.name)}"><b>${esc(o.login ? '@' + o.login : o.name)}</b></button> ${esc(o.message)}</span><span class="mono muted">${ago(o.date)}${o.pr ? ` · ${prLink(o.pr)}` : ''} · <a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.short)}</a></span></div>`).join('') : '<div class="muted">Not traced (only the riskiest files are traced, to save GitHub API calls; add a token to trace more).</div>'}</div>
        <div class="p-sec"><h4>Open PRs changing it</h4>${prs.map((p) => `<button class="file-row" data-pr="${p.number}" style="width:100%;text-align:left"><span>#${p.number} ${esc(p.title)}</span>${riskPill(p.risk)}</button>`).join('') || '<div class="muted">None.</div>'}</div>
        ${scen.length ? `<div class="p-sec"><h4>Used in attack scenarios</h4>${scen.map((s) => `<button class="file-row" data-scenario="${s.id}" style="width:100%;text-align:left"><span>${esc(s.title)}</span><span class="li"><span class="${s.impact}">${s.impact}</span></span></button>`).join('')}</div>` : ''}`;
    } else {
      body = `<div class="p-sec">${f.attack.map((a) => { const t = techInfo(a); return `<div class="item"><div class="t"><span>${techChip(t, true)}</span></div><div class="d">${esc(t.tactic || '')}</div><a class="btn sm ghost" href="${esc(t.url)}" target="_blank" rel="noopener" style="margin-top:6px">${icon('external')} View on MITRE</a></div>`; }).join('')}</div>`;
    }
    return panelHead(icon('shield'), esc(f.title), `<span class="mono">${esc(f.file)}${f.line ? ':' + f.line : ''}</span>`, meta, tabs) + `<div class="p-body">${body}</div>`;
  }
  function vulnPanel(pkg) {
    const vs = sec()?.vulns.filter((v) => v.package === pkg) || []; if (!vs.length) return '';
    const v0 = vs[0]; const maxS = Math.max(...vs.map((v) => v.severity));
    return panelHead(icon('package'), `<span class="mono">${esc(pkg)}@${esc(v0.version)}</span>`, `${esc(v0.ecosystem)} · ${esc(v0.manifest)}`, `${sevChip(maxS)}<span class="pill">${plural(vs.length, 'advisory', 'advisories')}</span>${v0.dev ? '<span class="pill">dev only</span>' : ''}`) + `<div class="p-body">
      <div class="p-sec"><h4>Blast radius</h4><div class="p-meta" style="margin:0">${(v0.usedBy?.layers || []).map((l) => lchip(l)).join('') || '<span class="muted">Not imported directly by source files</span>'}</div>${v0.usedBy?.files ? `<p class="muted" style="font-size:12px;margin:8px 0 0">${plural(v0.usedBy.files, 'file')} import ${esc(pkg)}.</p>` : ''}</div>
      <div class="p-sec"><h4>Advisories</h4>${vs.map((v, i) => acc(`pv-${v.id}`, `${sevChip(v.severity)}<span class="t">${esc(v.aliases[0] || v.id)}</span>`, `<p style="margin:0 0 6px;color:var(--text-2)">${esc(v.summary)}</p><div class="kv"><span>Fixed in</span><span>${esc(v.fixed || '—')}</span><span>Published</span><span>${v.published ? esc(v.published.slice(0, 10)) : '—'}</span></div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${v.attack.map((a) => techChip(a)).join('')}</div><a class="btn sm ghost" href="${esc(v.url)}" target="_blank" rel="noopener" style="margin-top:8px">${icon('external')} OSV</a>`, { open: i === 0, cls: 'flat' })).join('')}</div></div>`;
  }
  function endpointPanel(key) {
    const e = sec()?.surface.endpoints.find((x) => `${x.method} ${x.path} ${x.file}` === key); if (!e) return '';
    const toData = L('data') ? shortestPath(e.layer, 'data') : null;
    const fs = sec().findings.filter((f) => f.file === e.file);
    const scen = sec().threats.scenarios.filter((s) => s.entryPoint?.endpoint && s.entryPoint.endpoint.includes(e.path));
    return panelHead(icon('crosshair'), `<span class="ep-method">${esc(e.method)}</span> <span class="mono">${esc(e.path)}</span>`, `<span class="mono">${esc(e.file)}:${e.line}</span>`, `<span class="auth ${e.auth}">${e.auth === 'likely' ? '✓ auth check found' : e.auth === 'file-level' ? '~ file-level auth' : '✕ no visible auth'}</span>${e.sensitive ? '<span class="pill crit">sensitive</span>' : ''}${lchip(e.layer)}`) + `<div class="p-body">
      <div class="p-sec"><h4>Probe path into the system</h4>${chainHtml(toData || [e.layer], { entryLabel: `${e.method} ${e.path}` })}<p class="muted" style="font-size:12px;margin:8px 0 0">${toData ? 'Requests here can reach the data layer through these imports.' : 'No import route to the data layer from here.'}</p></div>
      <div class="p-sec"><h4>Findings in the same file</h4>${fs.map((f) => `<button class="file-row" data-finding="${f.fp}" style="width:100%;text-align:left"><span>${sevChip(f.severity)} ${esc(f.title)}</span><span class="mono muted">L${f.line ?? '—'}</span></button>`).join('') || '<div class="muted">None.</div>'}</div>
      ${scen.length ? `<div class="p-sec"><h4>Attack scenarios starting here</h4>${scen.map((s) => `<button class="file-row" data-scenario="${s.id}" style="width:100%;text-align:left"><span>${esc(s.title)}</span><span class="li"><span class="${s.impact}">${s.impact}</span></span></button>`).join('')}</div>` : ''}
      <div class="p-sec"><h4>Owner</h4>${ownerHtml(e.file, { full: true }) || '<span class="muted">Not traced</span>'}</div>
      <div class="p-sec"><a class="btn sm" href="${esc(blobUrl(e.file, e.line))}" target="_blank" rel="noopener">${icon('github')} View route on GitHub</a></div></div>`;
  }
  function scenarioPanel(id) {
    const x = sec()?.threats.scenarios.find((s) => s.id === id); if (!x) return '';
    const ev = (x.evidence || []).map((e) => (typeof e === 'string' ? e : e.fp || e.vuln)).filter(Boolean);
    return panelHead(icon('bug'), esc(x.title), x.source === 'ai' ? 'Threat Modeler (AI)' : 'Derived from static findings', `<span class="li"><span class="${x.likelihood}">${x.likelihood} likelihood</span><span class="${x.impact}">${x.impact} impact</span></span>`) + `<div class="p-body">
      <div class="p-sec"><h4>Attack path</h4>${chainHtml(x.path.length ? x.path : [x.entryPoint.layer], { entryLabel: x.entryPoint.endpoint, target: x.target })}<button class="btn sm" data-show-scenario="${x.id}" style="margin-top:10px">${icon('network')} Show on architecture</button></div>
      ${x.steps?.length ? `<div class="p-sec"><h4>Kill chain</h4><ol class="steps-v">${x.steps.map((st, i) => `<li><span class="n">${i + 1}</span><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${techChip(st.technique)}</div><div style="margin-top:4px">${esc(st.action)}</div>${st.where ? `<div class="w">${esc(st.where)}</div>` : ''}</li>`).join('')}</ol></div>` : `<div class="p-sec"><h4>What happens</h4>${clampText(x.narrative, 4)}<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${x.techniques.map((t) => techChip(t)).join('')}</div></div>`}
      ${ev.length ? `<div class="p-sec"><h4>Evidence</h4>${ev.map((e) => { const f = findingBy(e); if (f) return `<button class="file-row" data-finding="${f.fp}" style="width:100%;text-align:left"><span>${sevChip(f.severity)} ${esc(f.title)}</span><span class="mono muted">${esc(f.file.split('/').pop())}:${f.line ?? ''}</span></button>`; const v = sec().vulns.find((vv) => vv.id === e || vv.aliases.includes(e)); return v ? `<button class="file-row" data-vuln="${esc(v.package)}" style="width:100%;text-align:left"><span>${sevChip(v.severity)} ${esc(v.aliases[0] || v.id)}</span><span class="mono muted">${esc(v.package)}</span></button>` : `<div class="file-row"><span class="mono">${esc(e)}</span></div>`; }).join('')}</div>` : ''}
      ${x.detection ? `<div class="p-sec"><h4>Where to watch (detection)</h4><div class="probe">${icon('eye')}<span>${esc(x.detection)}</span></div></div>` : ''}
      ${x.mitigations?.length ? `<div class="p-sec"><h4>What needs to be done</h4>${todoList(x.mitigations)}</div>` : ''}</div>`;
  }
  function techPanel(id) {
    const t = techInfo(id); const roll = sec()?.mitre.find((m) => m.id === id) || t;
    const fs = sec().findings.filter((f) => f.attack.includes(id)); const vs = sec().vulns.filter((v) => v.attack.includes(id)); const ss = sec().threats.scenarios.filter((s) => s.techniques.some((x) => x.id === id));
    return panelHead(icon('target'), `<span class="mono">${esc(id)}</span> ${esc(t.name)}`, esc(t.tactic || ''), `<span class="pill ${id.startsWith('AML') ? 'accent' : ''}">${id.startsWith('AML') ? 'MITRE ATLAS' : 'MITRE ATT&CK'}</span><a class="pill" href="${esc(t.url)}" target="_blank" rel="noopener">${icon('external')} reference</a>`, [['summary', 'Evidence', fs.length + vs.length + ss.length]]) + `<div class="p-body">
      ${ss.length ? `<div class="p-sec"><h4>Scenarios</h4>${ss.map((s) => `<button class="file-row" data-scenario="${s.id}" style="width:100%;text-align:left"><span>${esc(s.title)}</span><span class="li"><span class="${s.impact}">${s.impact}</span></span></button>`).join('')}</div>` : ''}
      ${fs.length ? `<div class="p-sec"><h4>Findings <span class="muted">${fs.length}</span></h4>${fs.slice(0, 20).map((f) => `<button class="file-row" data-finding="${f.fp}" style="width:100%;text-align:left"><span>${sevChip(f.severity)} ${esc(f.title)}</span><span class="mono muted">${esc(f.file.split('/').pop())}:${f.line ?? ''}</span></button>`).join('')}</div>` : ''}
      ${vs.length ? `<div class="p-sec"><h4>Vulnerable dependencies <span class="muted">${vs.length}</span></h4>${vs.slice(0, 12).map((v) => `<button class="file-row" data-vuln="${esc(v.package)}" style="width:100%;text-align:left"><span>${sevChip(v.severity)} ${esc(v.aliases[0] || v.id)}</span><span class="mono muted">${esc(v.package)}</span></button>`).join('')}</div>` : ''}
      ${!fs.length && !vs.length && !ss.length ? '<div class="p-sec"><div class="muted">No evidence for this technique.</div></div>' : ''}</div>`;
  }

  /* =====================================================================
     People
     ===================================================================== */
  function peopleIndex() {
    const d = S.data, p = d.people || { contributors: [], commits: [], fileOwners: {} };
    const map = new Map();
    const get = (login, av) => { if (!login) return null; if (!map.has(login)) map.set(login, { login, avatar: av, commits: 0, contributions: 0, openPrs: [], merged: [], files: new Set(), recent: [] }); const x = map.get(login); if (!x.avatar && av) x.avatar = av; return x; };
    p.contributors.forEach((c) => { const x = get(c.login, c.avatar); x.contributions = c.contributions; x.url = c.url; });
    p.commits.forEach((c) => { const x = get(c.login || c.name, c.avatar); if (x) { x.commits++; if (x.recent.length < 12) x.recent.push(c); } });
    d.prs.forEach((pr) => { const x = get(pr.author, pr.avatar); x?.openPrs.push(pr); });
    (d.merged || []).forEach((m) => { const x = get(m.author, m.avatar); x?.merged.push(m); });
    Object.entries(p.fileOwners || {}).forEach(([f, cs]) => { const x = get(cs[0]?.login || cs[0]?.name, cs[0]?.avatar); x?.files.add(f); });
    const fsFor = (x) => [...x.files];
    for (const x of map.values()) {
      x.secFindings = (sec()?.findings || []).filter((f) => x.files.has(f.file)).length + (sec()?.prFindings || []).filter((f) => f.author === x.login).length;
      x.debt = x.openPrs.reduce((a, pr) => a + pr.items.length, 0);
      x.layers = [...new Set([...fsFor(x).map((f) => (S.data.hotspots.find((h) => h.path === f) || sec()?.findings.find((g) => g.file === f))?.layer).filter(Boolean), ...x.openPrs.flatMap((pr) => pr.layers)])];
    }
    return [...map.values()].sort((a, b) => b.openPrs.length * 50 + b.files.size * 20 + b.contributions - (a.openPrs.length * 50 + a.files.size * 20 + a.contributions));
  }
  function renderPeople() {
    const el = $('#page-people'); const ppl = peopleIndex(); S.people = ppl;
    const owners = Object.entries(S.data.people?.fileOwners || {});
    const tabs = [['people', 'Contributors', 'users', ppl.length], ['ownership', 'Ownership of risk', 'target', owners.length]];
    if (!tabs.some((t) => t[0] === S.sub.people)) S.sub.people = 'people';
    let body = '';
    if (S.sub.people === 'people') {
      body = ppl.length ? `<div class="ppl-grid">${ppl.slice(0, 30).map((x) => `<button class="person ${S.sel?.type === 'person' && S.sel.id === x.login ? 'on' : ''}" data-person="${esc(x.login)}"><div class="top">${avatar(x.login, x.avatar, true)}<div style="min-width:0"><b>@${esc(x.login)}</b><span>${x.contributions ? `${x.contributions} contributions` : `${x.commits} recent commits`}</span></div></div>
          <div class="stats"><div><b>${x.openPrs.length}</b><span>open PRs</span></div><div><b>${x.files.size}</b><span>risky files</span></div><div><b style="color:${x.secFindings ? 'var(--crit)' : 'inherit'}">${x.secFindings}</b><span>security</span></div></div>
          ${x.layers.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${x.layers.slice(0, 3).map((l) => lchip(l, false)).join('')}</div>` : ''}</button>`).join('')}</div>` : '<div class="card"><div class="empty"><b>No contributor data</b>GitHub returned no commit history (rate limit or empty repo).</div></div>';
    } else {
      body = `<p class="muted" style="margin:-4px 0 14px">Last change to each traced risky file (hotspots and files with security findings). This shows who to ask, not who to blame.</p><div class="card" style="overflow-x:auto"><table class="dt"><thead><tr><th>File</th><th>Risk</th><th>Last changed by</th><th>Change</th><th>When</th></tr></thead><tbody>
        ${owners.map(([f, cs]) => { const o = cs[0]; const h = S.data.hotspots.find((x) => x.path === f); const fs = sec()?.findings.filter((x) => x.file === f) || []; return `<tr class="click" ${fs[0] ? `data-finding="${fs[0].fp}"` : h ? `data-file="${esc(f)}"` : ''}><td class="p">${esc(f)}</td><td>${fs.length ? sevChip(Math.max(...fs.map((x) => x.severity))) : ''} ${h ? riskPill(h.score) : ''}</td><td><span class="owner">${avatar(o.login || o.name, o.avatar)}<b>${esc(o.login ? '@' + o.login : o.name)}</b></span></td><td><span class="muted">${esc(o.message)}</span>${o.pr ? ` ${prLink(o.pr)}` : ''} <a class="mono" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.short)}</a></td><td class="muted">${ago(o.date)}</td></tr>`; }).join('') || '<tr><td colspan="5"><div class="empty">No files traced.</div></td></tr>'}
      </tbody></table></div>`;
    }
    el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>People</h1><p>Who is changing the risky parts of the codebase: open PRs, the files they last touched, and the security findings in those files.</p></div></div>${subtabs('people', tabs)}${body}</div>`;
  }
  function personPanel(login) {
    const x = (S.people || peopleIndex()).find((p) => p.login === login); if (!x) return '';
    const tabs = [['summary', 'Footprint'], ['prs', 'PRs', x.openPrs.length + x.merged.length], ['commits', 'Commits', x.recent.length]];
    if (!tabs.some((t) => t[0] === S.panelTab)) S.panelTab = 'summary';
    let body = '';
    if (S.panelTab === 'summary') {
      const files = [...x.files];
      body = `<div class="p-sec"><div class="trio"><div><span>Open PRs</span><b>${x.openPrs.length}</b></div><div><span>PR debt findings</span><b>${x.debt}</b></div><div><span>Security in their files</span><b style="color:${x.secFindings ? 'var(--crit)' : 'inherit'}">${x.secFindings}</b></div></div></div>
        <div class="p-sec"><h4>Layers they work in</h4><div class="p-meta" style="margin:0">${x.layers.map((l) => lchip(l)).join('') || '<span class="muted">—</span>'}</div></div>
        <div class="p-sec"><h4>Risky files they last changed</h4>${files.map((f) => { const fs = sec()?.findings.filter((g) => g.file === f) || []; const h = S.data.hotspots.find((y) => y.path === f); return `<button class="file-row" ${fs[0] ? `data-finding="${fs[0].fp}"` : `data-file="${esc(f)}"`} style="width:100%;text-align:left"><div><div class="p">${esc(f)}</div><div class="why">${fs.length ? `${plural(fs.length, 'security finding')}` : ''}${fs.length && h ? ' · ' : ''}${h ? `hotspot ${h.score}` : ''}</div></div>${fs.length ? sevChip(Math.max(...fs.map((g) => g.severity))) : h ? riskPill(h.score) : ''}</button>`; }).join('') || '<div class="muted">None of the traced files.</div>'}</div>`;
    } else if (S.panelTab === 'prs') {
      body = `<div class="p-sec"><h4>Open</h4>${x.openPrs.map((p) => `<button class="file-row" data-pr="${p.number}" style="width:100%;text-align:left"><div><div>#${p.number} ${esc(p.title)}</div><div class="why">${plural(p.items.length, 'finding')} · ${p.ageDays}d old</div></div>${riskPill(p.risk)}</button>`).join('') || '<div class="muted">None.</div>'}</div>
        <div class="p-sec"><h4>Recently merged</h4>${x.merged.map((m) => `<div class="file-row"><a href="${esc(m.url)}" target="_blank" rel="noopener">#${m.number} ${esc(m.title)}</a><span class="muted">${ago(m.mergedAt)}</span></div>`).join('') || '<div class="muted">None in the last 60 closed PRs.</div>'}</div>`;
    } else {
      body = `<div class="p-sec">${x.recent.map((c) => `<div class="file-row"><div><div>${esc(c.message)}</div><div class="why"><a class="mono" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.short)}</a>${c.pr ? ` · ${prLink(c.pr)}` : ''}</div></div><span class="muted">${ago(c.date)}</span></div>`).join('') || '<div class="muted">No commits in the last 100.</div>'}</div>`;
    }
    return panelHead(avatar(x.login, x.avatar, true), `@${esc(x.login)}`, x.contributions ? `${x.contributions} contributions` : '', x.url ? `<a class="pill" href="${esc(x.url)}" target="_blank" rel="noopener">${icon('github')} profile</a>` : '', tabs) + `<div class="p-body">${body}</div>`;
  }

  /* =====================================================================
     Timeline (snapshots, releases, merged PRs, commits)
     ===================================================================== */
  function renderTimeline() {
    const el = $('#page-timeline'); const d = S.data; const h = d.history || { snapshots: [] }; const p = d.people || { commits: [], releases: [] };
    const tabs = [['changes', 'What changed', 'history'], ['activity', 'Activity', 'clock'], ['snapshots', 'Snapshots', 'layers', h.snapshots.length], ['releases', 'Releases', 'tag', p.releases.length]];
    if (!tabs.some((t) => t[0] === S.sub.timeline)) S.sub.timeline = 'changes';
    let body = '';
    if (S.sub.timeline === 'changes') {
      const df = h.diff;
      body = df ? `<p class="muted" style="margin:-4px 0 14px">Compared with the analysis from ${ago(df.from)}${df.prevSha && df.curSha ? ` (commit <span class="mono">${esc(String(df.prevSha).slice(0, 7))}</span> → <span class="mono">${esc(String(df.curSha).slice(0, 7))}</span>)` : ''}.${df.sameCommit ? ' The code has not changed since then; differences come from PRs, the backlog or the model.' : ''}</p>
        <div class="diff-grid" style="margin-bottom:14px">
          <div class="card stat"><span class="k">Debt index</span><span class="v">${df.index[1]} ${deltaHtml(df.index[0], df.index[1])}</span><span class="s">was ${df.index[0]}</span></div>
          <div class="card stat"><span class="k">Security exposure</span><span class="v">${df.security[1] ?? '—'} ${df.security[0] != null ? deltaHtml(df.security[0], df.security[1]) : ''}</span><span class="s">was ${df.security[0] ?? '—'}</span></div>
          <div class="card stat"><span class="k">Findings</span><span class="v">+${df.newFindings.length}<small style="color:var(--good)">−${df.fixedFindings.length}</small></span><span class="s">new · fixed</span></div>
          <div class="card stat"><span class="k">Pull requests</span><span class="v">+${df.prsOpened.length}<small>−${df.prsClosed.length}</small></span><span class="s">opened · closed</span></div></div>
        ${acc('d-layers', `<span class="t">Layer score changes</span>`, df.layers.map((x) => `<div class="file-row"><span>${lchip(x.id)}</span><span>debt ${x.from ?? '—'} → <b>${x.to}</b> ${x.from != null ? deltaHtml(x.from, x.to) : ''} · security ${x.secFrom ?? '—'} → <b>${x.secTo ?? '—'}</b></span></div>`).join('') || '<div class="muted">No layer changed.</div>', { open: true, meta: `<span>${df.layers.length}</span>` })}
        ${acc('d-new', `<span class="t">New security findings</span>`, df.newFindings.map((f) => `<button class="file-row" data-finding="${esc(f.fp)}" style="width:100%;text-align:left"><span>${sevChip(f.severity)} ${esc(f.title)}</span><span class="mono muted">${esc(f.file)}${f.line ? ':' + f.line : ''}</span></button>`).join('') || '<div class="muted">None.</div>', { open: !!df.newFindings.length, meta: `<span>${df.newFindings.length}</span>` })}
        ${acc('d-fixed', `<span class="t">Fixed since last time</span>`, df.fixedFindings.map((f) => `<div class="file-row"><span style="color:var(--good)">✓ ${esc(f.title)}</span><span class="mono muted">${esc(f.file)}</span></div>`).join('') || '<div class="muted">None.</div>', { meta: `<span>${df.fixedFindings.length}</span>` })}
        ${acc('d-vulns', `<span class="t">Dependency advisories</span>`, [...df.newVulns.map(([id, pkg]) => `<div class="file-row"><span>${sevChip(4)} ${esc(id)}</span><span class="mono muted">${esc(pkg)} · new</span></div>`), ...df.fixedVulns.map(([id, pkg]) => `<div class="file-row"><span style="color:var(--good)">✓ ${esc(id)}</span><span class="mono muted">${esc(pkg)} · resolved</span></div>`)].join('') || '<div class="muted">No change.</div>', { meta: `<span>+${df.newVulns.length} / −${df.fixedVulns.length}</span>` })}`
        : `<div class="card"><div class="empty"><b>This is the first snapshot of ${esc(d.repo.fullName)}</b>Every analysis is saved. Run Narc again after new commits or PRs to see exactly what changed: debt per layer, new and fixed findings, new CVEs and PR churn.</div></div>`;
    } else if (S.sub.timeline === 'activity') {
      const f = S.tlFilter || 'all';
      const ev = [
        ...h.snapshots.map((s) => ({ t: s.at, k: 'snap', ic: 'radar', html: `<b>Narc analysis</b> · debt ${s.index} → ${s.index90} in 90d${s.security != null ? ` · security ${s.security}` : ''} ${s.current ? '<span class="pill accent">current</span>' : ''}` })),
        ...p.releases.map((r) => ({ t: r.date, k: 'release', ic: 'tag', html: `<b>Released <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.tag)}</a></b>${r.author ? ` by @${esc(r.author)}` : ''}${r.prerelease ? ' <span class="pill">pre-release</span>' : ''}` })),
        ...(d.merged || []).map((m) => ({ t: m.mergedAt, k: 'merge', ic: 'merge', html: `${avatar(m.author, m.avatar)} <b>@${esc(m.author || '?')}</b> merged <a href="${esc(m.url)}" target="_blank" rel="noopener">#${m.number}</a> ${esc(m.title)}` })),
        ...d.prs.map((pr) => ({ t: pr.createdAt, k: 'pr', ic: 'pr', html: `${avatar(pr.author, pr.avatar)} <b>@${esc(pr.author || '?')}</b> opened ${prLink(pr.number)} ${esc(pr.title)} ${riskPill(pr.risk)}` })),
        ...p.commits.slice(0, 40).map((c) => ({ t: c.date, k: 'commit', ic: 'commit', html: `${avatar(c.login || c.name, c.avatar)} <b>${esc(c.login ? '@' + c.login : c.name)}</b> ${esc(c.message)} <a class="mono" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.short)}</a>${c.pr ? ` ${prLink(c.pr)}` : ''}` })),
      ].filter((e) => e.t && (f === 'all' || e.k === f)).sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 120);
      body = `<div class="filters">${[['all', 'All'], ['snap', 'Snapshots'], ['release', 'Releases'], ['merge', 'Merged PRs'], ['pr', 'Opened PRs'], ['commit', 'Commits']].map(([k, t]) => `<button class="chip ${f === k ? 'on' : ''}" data-tlf="${k}" style="font-family:var(--font)">${t}</button>`).join('')}</div>
        <div class="card"><div class="card-b" style="padding-top:16px"><ol class="tl-v">${ev.map((e) => `<li class="${e.k}"><span class="when">${new Date(e.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<br><span style="font-size:10.5px">${ago(e.t)}</span></span><span class="ic">${icon(e.ic)}</span><div class="body">${e.html}</div></li>`).join('') || '<div class="empty">No activity.</div>'}</ol></div></div>`;
    } else if (S.sub.timeline === 'snapshots') {
      const vals = h.snapshots.slice().reverse();
      body = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Trend across analyses</h3><span class="sub">${plural(h.snapshots.length, 'snapshot')}</span></div><div class="card-b">${vals.length > 1 ? `<div style="display:flex;gap:24px;flex-wrap:wrap"><div><div class="muted" style="font-size:12px">Debt index</div>${spark(vals.map((s) => s.index), 220, 48)}</div>${vals.some((s) => s.security != null) ? `<div><div class="muted" style="font-size:12px">Security exposure</div>${spark(vals.map((s) => s.security ?? 0), 220, 48)}</div>` : ''}</div>` : '<div class="muted">One snapshot so far.</div>'}</div></div>
        <div class="card" style="overflow-x:auto"><table class="dt"><thead><tr><th>When</th><th>Commit</th><th class="num">Debt</th><th class="num">90d</th><th class="num">Security</th><th class="num">Findings</th><th class="num">CVEs</th><th class="num">Open PRs</th><th>Mode</th></tr></thead><tbody>${h.snapshots.map((s) => `<tr><td>${new Date(s.at).toLocaleString()} ${s.current ? '<span class="pill accent">current</span>' : ''}</td><td class="mono">${esc(String(s.headSha || '—').slice(0, 7))}</td><td class="num">${s.index}</td><td class="num">${s.index90}</td><td class="num">${s.security ?? '—'}</td><td class="num">${s.findings ?? '—'}</td><td class="num">${s.vulns ?? '—'}</td><td class="num">${s.prs ?? '—'}</td><td>${esc(s.mode || '')}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      body = p.releases.length ? p.releases.map((r, i) => acc(`rel-${r.tag}`, `${icon('tag')}<span class="t">${esc(r.name)}</span>${r.prerelease ? '<span class="pill">pre-release</span>' : ''}`, `${r.notes ? `<div class="code" style="white-space:pre-wrap">${esc(r.notes)}</div>` : '<span class="muted">No release notes.</span>'}<a class="btn sm ghost" href="${esc(r.url)}" target="_blank" rel="noopener" style="margin-top:8px">${icon('external')} View release</a>`, { open: i === 0, meta: `<span>${new Date(r.date).toLocaleDateString()}</span>${r.author ? `<span>@${esc(r.author)}</span>` : ''}` })).join('') : '<div class="card"><div class="empty"><b>No releases</b>This repository has no GitHub releases.</div></div>';
    }
    el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>Timeline</h1><p>Version changes and snapshots: how debt and security move between analyses, alongside releases, merged PRs and commits.</p></div></div>${subtabs('timeline', tabs)}${body}</div>`;
  }

  /* =====================================================================
     Agents board
     ===================================================================== */
  function agentsBoard() {
    const used = S.data.usage?.agents || {}; const live = S.agentsLive || {};
    const names = [...new Set([...Object.keys(AGENT_INFO), ...Object.keys(used)])].filter((n) => used[n] || live[n] || n !== 'Deep Diver' || S.deep && Object.keys(S.deep).length);
    const card = (n) => {
      const u = used[n] || {}; const lv = live[n] || {}; const [ic, role] = AGENT_INFO[n] || ['bot', ''];
      const state = lv.running > 0 ? 'running' : lv.errors || u.errors ? 'error' : (u.calls || lv.done) ? 'done' : (u.cached || lv.cached) ? 'cached' : 'idle';
      return `<div class="agent"><div class="hd"><span class="av">${icon(ic)}</span><div><b>${esc(n)}</b><span>${esc(u.model || lv.model || S.data.model || '—')}</span></div><span class="state ${state}"><i class="dot"></i>${state === 'running' ? `working${lv.running > 1 ? ` ×${lv.running}` : ''}` : state === 'cached' ? 'from cache' : state}</span></div><p>${esc(role)}</p>
        <div class="st"><span><b>${u.calls || 0}</b> calls</span><span><b>${u.cached || 0}</b> cached</span><span><b>${u.calls ? ((u.ms / u.calls) / 1000).toFixed(1) : '—'}</b>s avg</span><span><b>${fmt((u.prompt || 0) + (u.completion || 0))}</b> tokens</span></div></div>`;
    };
    const eng = (n, ic, role) => { const lv = live[n] || {}; const state = lv.running > 0 ? 'running' : lv.errors ? 'error' : lv.done ? 'done' : 'idle'; const extra = n === 'OSV.dev' ? `${S.data.engines?.osv?.queried ?? '—'} packages checked` : n === 'GitHub' ? `${S.data.stats.githubCalls} API calls · ${S.data.engines?.github?.traced ?? 0} files traced` : n === 'Threat intel' ? [S.data.engines?.tavily && 'Tavily', S.data.engines?.exa && 'Exa'].filter(Boolean).join(' + ') || 'no key configured' : n === 'Security scanner' ? `${sec()?.findings.length ?? 0} findings` : `${fmt(S.data.stats.analysedFiles)} files`; return `<div class="agent"><div class="hd"><span class="av eng">${icon(ic)}</span><div><b>${esc(n)}</b><span>${esc(extra)}</span></div>${state !== 'idle' ? `<span class="state ${state}"><i class="dot"></i>${state}</span>` : ''}</div><p>${esc(role)}</p></div>`; };
    return `<div class="card-h" style="padding:0 0 10px"><h3>AI agents</h3><span class="sub">${S.data.mode === 'ai' ? `${esc(S.data.model)}${S.data.usage ? ` · ${S.data.usage.calls} calls · ${S.data.usage.cached || 0} cached` : ''}` : 'AI is off: add an OpenAI key in Settings'}</span></div>
      <div class="agent-grid" style="margin-bottom:24px">${S.data.mode === 'ai' ? names.map(card).join('') : '<div class="card"><div class="empty">No AI agents ran in this analysis.</div></div>'}</div>
      <div class="card-h" style="padding:0 0 10px"><h3>Engines</h3><span class="sub">deterministic analysis and data sources</span></div>
      <div class="agent-grid">${ENGINES.map(([n, ic, role]) => eng(n, ic, role)).join('')}</div>`;
  }

  /* =====================================================================
     Command palette
     ===================================================================== */
  let palItems = [], palIdx = 0;
  function openPalette() { $('#paletteBg').hidden = false; $('#paletteInput').value = ''; renderPalette(''); setTimeout(() => $('#paletteInput').focus(), 10); }
  function closePalette() { $('#paletteBg').hidden = true; }
  function fuzzy(q, s) { q = q.toLowerCase(); s = s.toLowerCase(); if (!q) return 1; if (s.includes(q)) return 3 - s.indexOf(q) / 100; let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length ? 1 : 0; }
  function renderPalette(q) {
    const d = S.data; const items = [];
    const repo = parseRepo(q);
    if (repo) items.push({ g: 'Analyze', ic: 'github', label: `Analyze ${repo}`, run: () => analyze(repo) });
    if (d) {
      [['overview', 'Overview', 'grid'], ['arch', 'Architecture', 'network'], ['security', 'Security', 'shield'], ['hotspots', 'Hotspots', 'flame'], ['prs', 'Pull requests', 'pr'], ['backlog', 'Backlog', 'list'], ['people', 'People', 'users'], ['timeline', 'Timeline', 'clock'], ['report', 'Report & agents', 'file']]
        .forEach(([p, t, ic], i) => items.push({ g: 'Go to', ic, label: t, hint: String(i + 1), run: () => { if ($('#app').dataset.view !== 'dash') setView('dash'); setPage(p); } }));
      d.layers.forEach((l) => items.push({ g: 'Layers', ic: LAYER_ICON[l.id], label: l.name, sub: `${band(l.score).label} · ${l.score} → ${l.score90}`, run: () => { setView('dash'); gotoLayer(l.id); } }));
      d.prs.forEach((p) => items.push({ g: 'Pull requests', ic: 'pr', label: `#${p.number} ${p.title}`, sub: `risk ${p.risk}`, run: () => { setView('dash'); setPage('prs'); select({ type: 'pr', id: p.number }); } }));
      d.hotspots.slice(0, 40).forEach((h) => items.push({ g: 'Files', ic: 'file', label: h.path, sub: `score ${h.score}`, run: () => { setView('dash'); setPage('hotspots'); select({ type: 'file', id: h.path }); } }));
      d.backlog.tasks.forEach((t) => items.push({ g: 'Backlog', ic: 'list', label: `${t.key} ${t.title}`, sub: `${t.delta > 0 ? '+' : ''}${t.delta}`, run: () => { setView('dash'); setPage('backlog'); select({ type: 'task', id: t.key }); } }));
      (d.security?.findings || []).slice(0, 60).forEach((f) => items.push({ g: 'Security', ic: 'shield', label: `${f.title} · ${f.file.split('/').pop()}`, sub: `${SEV_LABEL[f.severity]} · ${f.cwe}`, run: () => { setView('dash'); setPage('security'); select({ type: 'finding', id: f.fp }); } }));
      (d.security?.threats.scenarios || []).forEach((x) => items.push({ g: 'Security', ic: 'bug', label: x.title, sub: `${x.impact} impact`, run: () => { setView('dash'); S.sub.security = 'threats'; setPage('security'); select({ type: 'scenario', id: x.id }); } }));
      [...new Set((d.security?.vulns || []).map((v) => v.package))].forEach((p) => items.push({ g: 'Security', ic: 'package', label: `Vulnerable package: ${p}`, run: () => { setView('dash'); S.sub.security = 'deps'; setPage('security'); select({ type: 'vuln', id: p }); } }));
      (d.security?.mitre || []).forEach((t) => items.push({ g: 'MITRE', ic: 'target', label: `${t.id} ${t.name}`, sub: t.tactic, run: () => { setView('dash'); S.sub.security = 'threats'; setPage('security'); select({ type: 'tech', id: t.id }); } }));
      (S.people || []).slice(0, 30).forEach((x) => items.push({ g: 'People', ic: 'users', label: `@${x.login}`, sub: `${x.openPrs.length} open PRs`, run: () => { setView('dash'); setPage('people'); select({ type: 'person', id: x.login }); } }));
      d.layers.filter((l) => l.modules.length > 1).forEach((l) => items.push({ g: 'Actions', ic: 'network', label: `Open module map: ${l.name}`, run: () => { setView('dash'); drillInto(l.id); } }));
    }
    items.push({ g: 'Actions', ic: 'github', label: 'Analyze another repository…', run: () => { setView('landing'); setTimeout(() => $('#heroInput').focus(), 20); } });
    items.push({ g: 'Actions', ic: 'play', label: 'Load demo data', run: loadDemo });
    items.push({ g: 'Actions', ic: effectiveTheme() === 'dark' ? 'sun' : 'moon', label: `Switch to ${effectiveTheme() === 'dark' ? 'light' : 'dark'} theme`, run: () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark') });
    items.push({ g: 'Actions', ic: 'settings', label: 'Open settings', run: openSheet });
    items.push({ g: 'Actions', ic: 'help', label: 'How scores work', run: openHelp });
    palItems = items.map((it) => ({ ...it, s: fuzzy(q, `${it.label} ${it.sub || ''}`) })).filter((it) => it.s > 0);
    if (q) palItems.sort((a, b) => b.s - a.s);
    palItems = palItems.slice(0, 60); palIdx = 0;
    let html = '', lastG = null;
    palItems.forEach((it, i) => { if (!q && it.g !== lastG) { html += `<div class="pl-group">${esc(it.g)}</div>`; lastG = it.g; } html += `<button class="pl-item ${i === 0 ? 'on' : ''}" data-i="${i}" role="option">${icon(it.ic)}<span class="lbl">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.hint ? `<kbd>${it.hint}</kbd>` : q ? `<span class="muted" style="font-size:11px">${esc(it.g)}</span>` : ''}</button>`; });
    $('#paletteList').innerHTML = html || '<div class="empty">No matches</div>';
    $$('#paletteList .pl-item').forEach((b) => { b.addEventListener('click', () => runPal(+b.dataset.i)); b.addEventListener('mousemove', () => movePal(+b.dataset.i)); });
  }
  function movePal(i) { palIdx = Math.max(0, Math.min(palItems.length - 1, i)); $$('#paletteList .pl-item').forEach((b) => b.classList.toggle('on', +b.dataset.i === palIdx)); $(`#paletteList .pl-item[data-i="${palIdx}"]`)?.scrollIntoView({ block: 'nearest' }); }
  function runPal(i) { const it = palItems[i]; if (!it) return; closePalette(); it.run(); }

  /* =====================================================================
     Help
     ===================================================================== */
  function openHelp() {
    const k = isMac ? '⌘' : 'Ctrl';
    const desc = { static: 'Measured from the code today: test gaps, conditional complexity, TODO/FIXME markers, import cycles, layering violations, oversized files and suppressions.', drift: 'Debt left alone compounds, at about 8% of the existing-code score per quarter.', pending: "Debt from open PRs, weighted by each PR's merge odds over time. The odds come from the repo's own merge rate and time-to-merge.", backlog: 'Planned tickets and design-doc items: some add debt, others pay it down.', inherited: 'Part of the debt in the layers this one imports, above a healthy baseline. The share shrinks with each step of distance and grows with tighter coupling.' };
    $('#helpBody').innerHTML = `<h4>The debt index</h4><p>Every layer gets a score from 0 to 100, where higher means more debt. The repo index is a size-weighted average of the layers, excluding tests and config.</p>
      <div class="band-scale">${BANDS.map((b, i) => `<div>${bandBadge(b.max - 5)}<b>${i ? BANDS[i - 1].max : 0}–${Math.min(100, b.max - 1)}</b></div>`).join('')}</div>
      <h4>What goes into a score</h4>${COMPONENTS.map((c) => `<p><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(${c.v});margin-right:6px"></span><b style="color:var(--text)">${c.label}.</b> ${desc[c.key]}</p>`).join('')}
      <h4>Security exposure</h4><p>A separate 0–100 score per layer, built from ~30 static rules (secrets, injection, SSRF, XSS, weak crypto, CI/CD, LLM prompt injection), known CVEs in declared dependency versions (OSV.dev), and routes with no visible auth. Each finding is mapped to a CWE and to MITRE ATT&CK, or MITRE ATLAS for AI-specific attacks. The Threat Modeler agent chains them into attack scenarios that follow the dependency graph.</p>
      <h4>Reading the architecture map</h4><p>Layers run top to bottom, from presentation down to foundation, and an arrow means "imports from". Red dashed arrows are layering violations, where a lower layer reaches up. Select a layer to see what it depends on (blue) and what depends on it (orange). Drag the timeline to move through the forecast.</p>
      <h4>Keyboard</h4><div class="kbd-grid"><span><kbd>${k}</kbd> <kbd>K</kbd></span><span>Search and commands</span><span><kbd>1</kbd> – <kbd>9</kbd></span><span>Switch section</span><span><kbd>/</kbd></span><span>Focus the repo input (home)</span><span><kbd>←</kbd> <kbd>→</kbd></span><span>Step the forecast (architecture)</span><span><kbd>Space</kbd></span><span>Play the forecast (architecture)</span><span><kbd>F</kbd></span><span>Fit graph to screen</span><span><kbd>Esc</kbd></span><span>Close panel / go back</span><span><kbd>?</kbd></span><span>This help</span></div>`;
    $('#helpBg').hidden = false;
  }
  const closeHelp = () => ($('#helpBg').hidden = true);

  /* =====================================================================
     Global wiring
     ===================================================================== */
  document.addEventListener('click', (e) => {
    const td = e.target.closest('[data-todo]');
    if (td) { const v = !store.get(td.dataset.todo, false); store.set(td.dataset.todo, v); td.setAttribute('aria-pressed', v); td.closest('li').classList.toggle('done', v); return; }
    const more = e.target.closest('[data-more]');
    if (more) { const c = more.previousElementSibling; c.classList.toggle('open'); more.textContent = c.classList.contains('open') ? 'Show less' : 'Show more'; return; }
    const sf = e.target.closest('[data-secfilter]');
    if (sf) { Object.assign(S.secFilter, JSON.parse(sf.dataset.secfilter)); if (sf.dataset.sub) { const [pg, id] = sf.dataset.sub.split(':'); S.sub[pg] = id; } renderSecurity(); return; }
    const st = e.target.closest('[data-sub]');
    if (st) { const [pg, id] = st.dataset.sub.split(':'); S.sub[pg] = id; if (S.page !== pg) setPage(pg); else ({ security: renderSecurity, people: renderPeople, timeline: renderTimeline, report: renderReport })[pg]?.(); $('#page-' + pg).scrollTop = 0; return; }
    const tl = e.target.closest('[data-tlf]');
    if (tl) { S.tlFilter = tl.dataset.tlf; renderTimeline(); return; }
    const t2 = e.target.closest('[data-finding],[data-vuln],[data-ep],[data-scenario],[data-tech],[data-person]');
    if (t2 && !t2.closest('#paletteBg')) {
      e.preventDefault();
      const ds = t2.dataset;
      if (ds.finding) select({ type: 'finding', id: ds.finding }); else if (ds.vuln) select({ type: 'vuln', id: ds.vuln }); else if (ds.ep) select({ type: 'endpoint', id: ds.ep });
      else if (ds.scenario) { select({ type: 'scenario', id: ds.scenario }); if (S.page === 'security') renderSecurity(); }
      else if (ds.tech) select({ type: 'tech', id: ds.tech }); else if (ds.person) { select({ type: 'person', id: ds.person }); if (S.page === 'people') renderPeople(); }
      return;
    }
    const t = e.target.closest('[data-goto-layer],[data-go],[data-pr],[data-task],[data-file],[data-module],[data-open-settings],[data-day]');
    if (!t || t.closest('#paletteBg') || t.closest('#graph')) return;
    if (t.dataset.gotoLayer) { e.preventDefault(); gotoLayer(t.dataset.gotoLayer); if (t.dataset.ptabNext) { S.panelTab = t.dataset.ptabNext; renderPanel(); } }
    else if (t.dataset.go) setPage(t.dataset.go);
    else if (t.dataset.pr) select({ type: 'pr', id: +t.dataset.pr });
    else if (t.dataset.task) select({ type: 'task', id: t.dataset.task });
    else if (t.dataset.file) select({ type: 'file', id: t.dataset.file });
    else if (t.dataset.module) { const lid = t.dataset.module.split('::')[0]; if (S.drill !== lid) drillInto(lid); select({ type: 'module', id: t.dataset.module }); }
    else if (t.dataset.openSettings !== undefined) openSheet();
    else if (t.dataset.day !== undefined) setDay(+t.dataset.day);
  });
  document.addEventListener('toggle', (e) => { const d = e.target; if (!d.matches?.('details[data-acc]')) return; const id = d.dataset.acc; if (d.open) { S.open.add(id); S.closed.delete(id); } else { S.open.delete(id); S.closed.add(id); } }, true);
  $('#topStatus').addEventListener('click', () => { if (!S.data) return; S.sub.report = 'agents'; setPage('report'); });
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => setPage(b.dataset.page)));
  $('#brand').addEventListener('click', () => { setView('landing'); history.replaceState(null, '', location.pathname); });
  $('#heroForm').addEventListener('submit', (e) => { e.preventDefault(); analyze($('#heroInput').value); });
  $('#heroInput').addEventListener('input', () => ($('#heroError').hidden = true));
  $$('.examples [data-repo]').forEach((c) => c.addEventListener('click', () => analyze(c.dataset.repo)));
  $('#demoBtn').addEventListener('click', loadDemo);
  $('#paletteBtn').addEventListener('click', openPalette);
  $('#paletteBg').addEventListener('click', (e) => { if (e.target.id === 'paletteBg') closePalette(); });
  $('#paletteInput').addEventListener('input', (e) => renderPalette(e.target.value.trim()));
  $('#paletteInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePal(palIdx + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); movePal(palIdx - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); runPal(palIdx); } else if (e.key === 'Escape') closePalette();
  });
  $('#themeBtn').addEventListener('click', () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));
  $$('#themeSeg button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeOpt)));
  $('#helpBtn').addEventListener('click', openHelp); $('#helpClose').addEventListener('click', closeHelp); $('#helpBg').addEventListener('click', (e) => { if (e.target.id === 'helpBg') closeHelp(); });
  $('#settingsBtn').addEventListener('click', openSheet); $('#sheetClose').addEventListener('click', closeSheet); $('#sheetCancel').addEventListener('click', closeSheet); $('#sheetBg').addEventListener('click', closeSheet); $('#sheetSave').addEventListener('click', saveSheet);
  $('#sDocFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; $('#sDoc').value = await f.text(); $('#sDocName').textContent = f.name; store.set('docName', f.name); });
  $('#daySlider').addEventListener('input', (e) => setDay(e.target.value));
  $('#playBtn').addEventListener('click', togglePlay);
  $('#zoomIn').addEventListener('click', () => { G.userZoomed = true; d3.select('#graph').transition().duration(200).call(G.zoom.scaleBy, 1.25); });
  $('#zoomOut').addEventListener('click', () => { G.userZoomed = true; d3.select('#graph').transition().duration(200).call(G.zoom.scaleBy, 0.8); });
  $('#zoomFit').addEventListener('click', () => G.fit());
  $('#supportBtn').addEventListener('click', () => { S.support = !S.support; graphRender(); });
  $$('.toolbar-float [data-color]').forEach((b) => b.addEventListener('click', () => { S.colorBy = b.dataset.color; $$('.toolbar-float [data-color]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); G.paint?.(); }));
  window.addEventListener('resize', debounce(() => { if (!S.data) return; if (S.page === 'arch' && !G.userZoomed) G.fit(false); if (S.page === 'overview') renderOverview(); if (S.page === 'hotspots') renderHotspots(); if (S.sel) renderPanel({ soft: true }); }, 150));

  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][tabindex]')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#paletteBg').hidden ? openPalette() : closePalette(); return; }
    if (e.key === 'Escape') {
      if (!$('#paletteBg').hidden) return closePalette();
      if (!$('#helpBg').hidden) return closeHelp();
      if ($('#sheet').classList.contains('open')) return closeSheet();
      if (typing) return document.activeElement.blur();
      if (S.sel) return select(null);
      if (S.drill) return exitDrill();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const view = $('#app').dataset.view;
    if (e.key === '/' && view === 'landing') { e.preventDefault(); $('#heroInput').focus(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (view !== 'dash') return;
    const pages = ['overview', 'arch', 'security', 'hotspots', 'prs', 'backlog', 'people', 'timeline', 'report'];
    if (/^[1-9]$/.test(e.key)) { setPage(pages[+e.key - 1]); return; }
    if (S.page !== 'arch') return;
    if (e.key === 'ArrowRight') { setDay(S.day + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { setDay(S.day - 1); e.preventDefault(); }
    if (e.key === ' ' && !document.activeElement?.closest?.('.g-node')) { e.preventDefault(); togglePlay(); }
    if (e.key.toLowerCase() === 'f') G.fit();
  });

  /* =====================================================================
     Boot
     ===================================================================== */
  setTheme(store.get('theme', 'system'));
  $('#paletteBtn kbd').textContent = isMac ? '⌘K' : 'Ctrl K';
  hydrate();
  renderRecent();
  fetch('/api/health').then((r) => r.json()).then((h) => {
    health = h; renderAiNote();
    $('#serverNote').innerHTML = `Server: OpenAI <b>${h.openai ? `configured (${esc(h.model)})` : 'not set'}</b> · GitHub token <b>${h.github ? 'set' : 'not set'}</b> · Jira <b>${h.jira ? 'set' : 'not set'}</b>. Values you enter here override the server's .env and stay in this browser.`;
  }).catch(() => renderAiNote());
  const jobParam = new URLSearchParams(location.search).get('job');
  if (jobParam) { showAnalyzing(location.hash.slice(1) || 'repository'); attach(jobParam); }
  else if (location.hash === '#demo') loadDemo();
  else setView('landing');
})();

/* Narc — Incidents: Investigations, MITRE map and Blast radius tabs (vanilla JS, uses helpers from app.js)

   Investigations and the attack chain come from data/incidents.json: Narc's investigation engine run on the
   Acme Cloud synthetic logs (see scripts/export_incidents.py). The repo blast radius is computed live from the
   analyzed repo's layer graph. */
(() => {
  'use strict';
  const U = window.NarcUI;
  if (!U) return;
  const { S, $, esc, icon, hydrate, plural, acc, bandColor, bandBadge, bandDot, lname, LAYER_ICON } = U;

  const PAGES = ['investigate', 'mitre', 'blast'];
  const I = { data: null, loading: null, error: null, caseId: 'C4', evOpen: new Set(), chainState: 'before', tech: null, blastMode: 'repo', blastLayer: null, blastCase: 'C4', blastState: 'before' };
  const SUSPECT = {
    change: { label: 'Bad change', ic: 'commit', plain: 'one of our own deploys broke it' },
    vendor: { label: 'Vendor outage', ic: 'cloud', plain: 'a company we depend on had an outage' },
    attack: { label: 'Attack', ic: 'bug', plain: 'someone got in on purpose' },
  };
  const TACTICS = ['Reconnaissance', 'Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Exfiltration', 'Impact', 'Other'];
  const CRIT_KINDS = new Set(['secret', 'takeover', 'exfil', 'money', 'pii', 'customer']);
  const NO_BLAST = new Set(['tests', 'config']); // nothing "depends on" tests or config (same rule as lib/forecast.js)

  const when = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  const code = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const techUrl = (id) => (id.startsWith('AML.') ? `https://atlas.mitre.org/techniques/${id}` : `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`);
  const techMeta = (id) => I.data?.techniques?.[id] || S.data?.security?.mitre?.find((t) => t.id === id) || { name: id, tactic: 'Other' };
  const techBtn = (id) => { const t = techMeta(id); return `<button class="tech ${id.startsWith('AML.') ? 'atlas' : ''}" data-inc-tech="${esc(id)}" title="${esc(t.name)} · open in MITRE map"><b>${esc(id)}</b>${esc(t.name.length > 30 ? t.name.slice(0, 29) + '…' : t.name)}</button>`; };
  const seg = (name, cur, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-inc-set="${name}:${v}">${l}</button>`).join('')}</div>`;
  const synthNote = () => `<div class="inc-note">${icon('alert')}<span><b>Synthetic logs, not this repo.</b> ${esc(I.data.source)}: ${I.data.event_count} events from ${I.data.log_sources.length} systems. Search results: ${esc(I.data.search_mode)}.</span></div>`;

  /* ---------------------------------------------------------------- data */
  function ensure(page) {
    if (I.data || I.error) return true;
    if (!I.loading) {
      I.loading = fetch('/api/incidents')
        .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error || r.statusText)))))
        .then((d) => { I.data = d; const n = $('#navInv'); if (n) n.textContent = d.cases.length; })
        .catch((e) => { I.error = e.message; })
        .finally(() => { if (PAGES.includes(S.page)) render(S.page); });
    }
    $('#page-' + page).innerHTML = `<div class="wrap"><div class="card"><div class="empty"><span class="spinner"></span> Loading incident logs…</div></div></div>`;
    return false;
  }
  const failed = () => `<div class="card"><div class="empty"><b>No incident data</b>${esc(I.error)}</div></div>`;

  /* ---------------------------------------------------------------- Investigations */
  function rawHtml(id) {
    const e = I.data.events[id];
    if (!e) return `<pre class="inc-raw">${esc(id)}: not in the export</pre>`;
    const detail = Object.fromEntries(Object.entries(e.detail || {}).filter(([k]) => k !== 'diff' || (e.detail.diff || []).length < 30));
    return `<pre class="inc-raw"><b>${esc(id)}</b>  ${esc(e.ts)}  ${esc(e.source)}/${esc(e.kind)}  ${esc(e.actor)}\n${esc(e.summary)}${e.raw ? `\n\n${esc(e.raw)}` : ''}\n\n${esc(JSON.stringify(detail, null, 1))}</pre>`;
  }
  function clueHtml(cl) {
    const pts = cl.points > 0 ? `+${cl.points}` : cl.points < 0 ? `−${Math.abs(cl.points)}` : '0';
    const prov = cl.provenance ? `<div class="inc-prov"><span class="muted">Hidden text asked for</span>${cl.provenance.asked.map((a) => `<code>${esc(a)}</code>`).join('')}<span class="muted">· agent shipped</span>${cl.provenance.done.map((a) => `<code>${esc(a)}</code>`).join('')}</div>` : '';
    const src = cl.sources?.length ? `<div class="inc-src">${cl.sources.map((s) => `<span>${icon('globe')}${esc(s.title)} <span class="mono muted">${esc(s.url)}</span></span>`).join('')}</div>` : '';
    const evs = cl.events.length ? `<div class="inc-evs"><span class="muted">Evidence</span>${cl.events.map((id) => `<button class="inc-ev ${I.evOpen.has(id) ? 'on' : ''}" data-inc-ev="${esc(id)}">${esc(id)}</button>`).join('')}</div>` : '';
    return `<li class="inc-clue ${cl.points > 0 ? 'pos' : cl.points < 0 ? 'neg' : 'zero'}"><span class="inc-pts">${pts}</span><div class="inc-clue-b"><p>${code(cl.text)}</p>
      ${cl.tech.length ? `<div class="inc-techs">${cl.tech.map(techBtn).join('')}</div>` : ''}${prov}${src}${evs}${cl.events.filter((id) => I.evOpen.has(id)).map(rawHtml).join('')}</div></li>`;
  }
  function verdictPill(v) {
    return `<span class="inc-verdict ${v.verdict}">${icon(SUSPECT[v.verdict].ic)}${SUSPECT[v.verdict].label}</span><span class="pill ${v.confidence === 'high' ? 'good' : v.confidence === 'medium' ? 'accent' : ''}">${esc(v.confidence)}</span>`;
  }
  function renderInvestigate() {
    const el = $('#page-investigate');
    const head = `<div class="page-head"><div><h1>Investigations</h1><p>When production breaks, was it a bad change, a vendor outage, or an attack? Narc reads every system's logs, scores the three suspects, and cites the log lines behind each clue. It proposes a fix, and a person approves it.</p></div></div>`;
    if (I.error) { el.innerHTML = `<div class="wrap">${head}${failed()}</div>`; return; }
    const d = I.data;
    const c = d.cases.find((x) => x.id === I.caseId) || d.cases[0]; I.caseId = c.id;
    const v = c.investigation;
    const max = Math.max(1, ...Object.values(v.scores));
    const order = ['change', 'vendor', 'attack'].sort((a, b) => (a === v.verdict ? -1 : b === v.verdict ? 1 : 0));
    el.innerHTML = `<div class="wrap">${head}${synthNote()}
      <div class="inc-cases">${d.cases.map((x) => `<button class="scen inc-case ${x.id === c.id ? 'on' : ''}" data-inc-case="${x.id}">
          <div class="inc-row"><span class="mono muted">${x.id} · ${esc(x.date)}</span><span class="inc-row">${verdictPill(x.investigation)}</span></div>
          <h4>${esc(x.title)}</h4><span class="muted inc-q">${esc(x.question)}</span></button>`).join('')}</div>
      <div class="inc-grid">
        <div class="card inc-head-card"><div class="card-b">
          <div class="inc-row" style="justify-content:flex-start;gap:8px"><span class="muted" style="font-size:12px">Verdict</span>${verdictPill(v)}</div>
          <h2 class="inc-culprit">${esc(SUSPECT[v.verdict].label)}: ${esc(v.culprit)}</h2>
          <p class="muted" style="margin:0 0 10px">${esc(c.story)}</p>
          <div class="inc-meta"><span class="pill">${icon('clock')} looked at ${esc(v.window.label)} before the alert${v.window.since_rollback ? ' (since the last rollback)' : ''}</span><span class="pill">${v.window.events} events</span><span class="pill">${v.window.sources.length} systems: ${esc(v.window.sources.join(', '))}</span></div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Suspect scores</h3><span class="sub">evidence points, not probabilities</span></div><div class="card-b">
          ${['change', 'vendor', 'attack'].map((k) => `<div class="inc-score ${k === v.verdict ? 'win' : ''}"><span class="lbl">${icon(SUSPECT[k].ic)}${SUSPECT[k].label}</span><span class="bar"><i style="width:${(v.scores[k] / max) * 100}%"></i></span><b>${v.scores[k]}</b></div>`).join('')}
          <p class="muted inc-small">High confidence: the top suspect has 5+ points and leads by 3+. Medium: 3+ and leads by 1+. Otherwise unclear.</p>
        </div></div>
      </div>
      <h3 class="inc-h3">Clues</h3>
      ${order.map((k) => acc(`inc-${c.id}-${k}`, `${icon(SUSPECT[k].ic)}<span class="t">${SUSPECT[k].label}</span><span class="muted" style="font-weight:400">· ${SUSPECT[k].plain}</span>`, `<ul class="inc-clues">${v.suspects[k].map(clueHtml).join('')}</ul>`, { open: k === v.verdict, meta: `<span>${plural(v.suspects[k].length, 'clue')}</span><b>${v.scores[k]} pts</b>` })).join('')}
      <div class="inc-grid" style="margin-top:18px">
        <div class="card"><div class="card-h"><h3>Timeline across systems</h3><span class="sub">click a row for the raw log</span></div><div class="card-b"><ol class="inc-tl">
          ${v.timeline.map((e) => `<li class="${e.key ? 'key' : ''}"><button data-inc-ev="${esc(e.id)}"><span class="mono muted">${when(e.ts)}</span><span class="pill">${esc(e.source)}</span><span class="s">${esc(e.summary)}</span></button>${I.evOpen.has(e.id) ? rawHtml(e.id) : ''}</li>`).join('')}
        </ol></div></div>
        <div class="card"><div class="card-h"><h3>Proposed fix</h3><span class="sub">a person approves; Narc changes nothing itself</span></div><div class="card-b">
          <ol class="inc-fix">${v.fix.map((f) => `<li>${code(f)}</li>`).join('')}</ol>
          <p class="muted inc-small" style="margin-top:10px">In plain words: ${esc(c.plain_fix)}</p>
          <button class="btn sm" data-inc-blast="${c.id}">${icon('radar')} What else broke? Blast radius</button>
          ${v.verdict === 'attack' ? `<button class="btn sm" data-inc-go="mitre">${icon('target')} Attack chain on the MITRE map</button>` : ''}
        </div></div>
      </div></div>`;
  }

  /* ---------------------------------------------------------------- MITRE map */
  function techRows() {
    const m = new Map();
    const add = (id, base) => {
      if (!m.has(id)) m.set(id, { id, name: base.name || id, tactic: TACTICS.includes(base.tactic) ? base.tactic : 'Other', url: base.url || techUrl(id), plain: base.plain || '', framework: base.framework || (id.startsWith('AML.') ? 'ATLAS' : 'ATT&CK'), clues: [], steps: [], repo: null });
      return m.get(id);
    };
    if (I.data) {
      for (const c of I.data.cases) for (const clues of Object.values(c.investigation.suspects)) for (const cl of clues) for (const t of cl.tech) add(t, techMeta(t)).clues.push({ caseId: c.id, text: cl.text, points: cl.points });
      for (const inc of I.data.incidents) for (const st of inc.steps) for (const t of st.tech) add(t, techMeta(t)).steps.push({ caseId: inc.id, label: st.label });
    }
    for (const t of S.data.security?.mitre || []) add(t.id, t).repo = t;
    return [...m.values()];
  }
  function chainHtml(inc) {
    const st = I.chainState;
    const removed = (I.data.blast[inc.id]?.nodes || []).filter((n) => n.kind === 'permission' && n.state === 'removed').map((n) => n.label);
    const done = inc.steps.filter((s) => s[st] === 'happens').length;
    return `<div class="card"><div class="card-h"><h3>${esc(inc.id)} attack chain: ${esc(inc.title)}</h3>${seg('chain', st, [['before', 'Before the fix'], ['after', 'After the fix']])}</div><div class="card-b">
      <p class="muted" style="margin:0 0 12px">${esc(inc.story)}</p>
      <ol class="inc-chain">${inc.steps.map((s) => { const ok = s[st] === 'happens'; return `<li class="${ok ? 'hit' : 'blocked'}"><span class="n">${s.index + 1}</span><div><div class="t">${esc(s.label)}${s.goal ? ' <span class="pill">attacker goal</span>' : ''}</div>
        <div class="inc-techs">${s.tech.map(techBtn).join('')}${s.needs ? `<span class="pill mono">${esc(s.agent)} needs ${esc(s.needs)}</span>` : ''}</div></div>
        <span class="pill ${ok ? 'crit' : 'good'}">${ok ? '✕ succeeds' : `✓ blocked · ${esc(s.why_blocked)}`}</span></li>`; }).join('')}</ol>
      <p class="inc-sum">${st === 'before' ? `<b>${done} of ${inc.steps.length} steps succeed.</b> Nothing stops the chain.` : `<b>${inc.goals_blocked} of ${inc.goals} attacker goals blocked</b> after taking away the permissions ${esc(inc.scope_agents.join(', '))} never used in 14 days of normal work${removed.length ? `: <span class="mono">${esc(removed.join(', '))}</span>` : ''}.`}</p>
    </div></div>`;
  }
  function techDetail(t) {
    if (!t) return `<div class="card"><div class="empty"><b>Pick a technique</b>Click any cell to see where it showed up: incident clues, attack steps, or this repo's security scan.</div></div>`;
    const r = t.repo;
    return `<div class="card inc-tech-detail"><div class="card-h"><h3><span class="tech ${t.id.startsWith('AML.') ? 'atlas' : ''}"><b>${esc(t.id)}</b>${esc(t.framework)}</span> ${esc(t.name)}</h3><a class="btn sm" href="${esc(t.url)}" target="_blank" rel="noopener">MITRE page ${icon('external')}</a></div><div class="card-b">
      <p class="muted" style="margin:0 0 10px">${esc(t.tactic)}${t.plain ? ` · ${esc(t.plain)}` : ''}</p>
      ${t.clues.length ? `<h4 class="inc-h4">Incident clues</h4><ul class="inc-list">${t.clues.map((x) => `<li><button class="link" data-inc-case-go="${x.caseId}">${x.caseId}</button> <b>+${x.points}</b> ${code(x.text)}</li>`).join('')}</ul>` : ''}
      ${t.steps.length ? `<h4 class="inc-h4">Attack chain steps</h4><ul class="inc-list">${t.steps.map((x) => `<li>${x.caseId}: ${esc(x.label)}</li>`).join('')}</ul>` : ''}
      ${r ? `<h4 class="inc-h4">This repo (${esc(S.data.repo.fullName)})</h4><p style="margin:0 0 8px">${[r.findings && plural(r.findings, 'finding'), r.vulns && plural(r.vulns, 'CVE'), r.scenarios && plural(r.scenarios, 'attack scenario')].filter(Boolean).join(' · ') || 'mapped by the security scan'}</p><button class="btn sm" data-tech="${esc(t.id)}">${icon('shield')} Open in the security panel</button>` : ''}
    </div></div>`;
  }
  function renderMitre() {
    const el = $('#page-mitre');
    const head = `<div class="page-head"><div><h1>MITRE map</h1><p>Every attack clue is mapped to MITRE ATT&CK, or MITRE ATLAS for attacks on AI systems. Techniques from incident investigations sit next to the ones this repo's security scan found.</p></div></div>`;
    const rows = techRows();
    const byT = {}; rows.forEach((t) => (byT[t.tactic] ||= []).push(t));
    const cols = TACTICS.filter((t) => byT[t]);
    const sel = rows.find((t) => t.id === I.tech) || null;
    el.innerHTML = `<div class="wrap">${head}
      ${I.data ? `${synthNote()}${I.data.incidents.map(chainHtml).join('')}` : I.error ? failed() : ''}
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>ATT&CK & ATLAS techniques</h3><span class="sub"><span class="inc-key inc">incident</span> <span class="inc-key repo">this repo</span> · click a cell</span></div><div class="card-b">
        ${cols.length ? `<div class="matrix">${cols.map((t) => `<div class="mcol"><h5>${t}</h5>${byT[t].map((x) => `<button class="mcell inc-cell ${I.tech === x.id ? 'on' : ''}" data-inc-tech="${esc(x.id)}"><span class="id"><span>${esc(x.id)}</span>${x.framework === 'ATLAS' ? '<span style="color:var(--accent)">ATLAS</span>' : ''}</span><span>${esc(x.name)}</span><span class="inc-tags">${x.clues.length || x.steps.length ? `<span class="inc-key inc">${[...new Set([...x.clues, ...x.steps].map((c) => c.caseId))].join(' ')}</span>` : ''}${x.repo ? `<span class="inc-key repo">${x.repo.findings + x.repo.vulns + x.repo.scenarios || '✓'}</span>` : ''}</span></button>`).join('')}</div>`).join('')}</div>` : '<div class="empty"><b>No techniques yet</b></div>'}
        <p class="muted inc-small">Incident technique ids were written from memory and are not hand-checked yet.</p>
      </div></div>
      <div id="incTechDetail" style="margin-top:16px">${techDetail(sel)}</div>
    </div>`;
  }

  /* ---------------------------------------------------------------- Blast radius */
  function repoBlast(id) {
    // Layers that depend on `id`, directly or through others: walk import edges backwards.
    const prev = new Map([[id, null]]), depth = new Map([[id, 0]]), q = [id];
    while (q.length) {
      const v = q.shift();
      if (v !== id && NO_BLAST.has(v)) continue;
      if (NO_BLAST.has(id)) break;
      for (const e of S.data.edges) if (e.target === v && !prev.has(e.source)) { prev.set(e.source, v); depth.set(e.source, depth.get(v) + 1); q.push(e.source); }
    }
    const path = (l) => { const p = [l]; let c = prev.get(l); while (c) { p.push(c); c = prev.get(c); } return p; };
    return [...depth.entries()].filter(([l]) => l !== id).map(([l, dpt]) => ({ layer: l, depth: dpt, path: path(l) })).sort((a, b) => a.depth - b.depth);
  }
  function columnsSvg({ cols, names, edges, w = 230 }) {
    const nodeW = 186, nodeH = 40, gap = 10, top = 28;
    const rows = Math.max(...cols.map((c) => c.length));
    const H = top + rows * (nodeH + gap) + 8, W = cols.length * w;
    const pos = new Map();
    cols.forEach((col, ci) => { const off = top + ((rows - col.length) * (nodeH + gap)) / 2; col.forEach((n, ri) => pos.set(n.id, { x: ci * w + 6, y: off + ri * (nodeH + gap), n })); });
    const trim = (s, k) => (s.length > k ? s.slice(0, k - 1) + '…' : s);
    const lines = edges.filter((e) => pos.has(e.s) && pos.has(e.t)).map((e) => { const a = pos.get(e.s), b = pos.get(e.t); const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2, mx = (x1 + x2) / 2; return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" class="inc-edge ${e.dim ? 'dim' : ''}"/>`; }).join('');
    const nodes = [...pos.values()].map(({ x, y, n }) => `<g class="inc-node ${n.dim ? 'dim' : ''} ${n.click ? 'click' : ''}" ${n.click ? `data-inc-layer="${esc(n.click)}" tabindex="0" role="button"` : ''} transform="translate(${x},${y})"><title>${esc(n.title || n.label)}</title>
        <rect width="${nodeW}" height="${nodeH}" rx="8" style="stroke:${n.color}"/><rect width="4" height="${nodeH - 12}" x="6" y="6" rx="2" style="fill:${n.color}"/>
        <text x="16" y="17" class="l">${esc(trim(n.label, 26))}</text><text x="16" y="31" class="s">${esc(trim(n.sub || '', 32))}</text></g>`).join('');
    return `<div class="inc-graph"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Blast radius graph">${names.map((t, i) => `<text x="${i * w + 6}" y="14" class="inc-colh">${esc(t)}</text>`).join('')}${lines}${nodes}</svg></div>`;
  }
  function blastRepo() {
    const d = S.data;
    const layers = d.layers.filter((l) => !NO_BLAST.has(l.id));
    if (!layers.length) return `<div class="card"><div class="empty"><b>No layers</b></div></div>`;
    if (!I.blastLayer || !L(I.blastLayer)) I.blastLayer = [...layers].sort((a, b) => b.blastRadius - a.blastRadius)[0].id;
    const l = L(I.blastLayer); const hit = repoBlast(l.id);
    const deep = Math.max(0, ...hit.map((h) => h.depth));
    const cols = [[l], ...Array.from({ length: deep }, (_, k) => hit.filter((h) => h.depth === k + 1).map((h) => L(h.layer)))].map((col) => col.filter(Boolean).map((x) => ({ id: x.id, label: x.name, sub: `${x.id === l.id ? 'breaks here' : 'depends on it'} · debt ${x.score}`, color: bandColor(x.score), click: x.id === l.id ? null : x.id, title: `${x.name}: debt ${x.score}, blast radius ${x.blastRadius}` })));
    const edges = hit.map((h) => ({ s: h.path[1], t: h.layer }));
    const avg = hit.length ? Math.round(hit.reduce((a, h) => a + (L(h.layer)?.score || 0), 0) / hit.length) : 0;
    return `<div class="inc-blast">
      <div class="card inc-layer-list"><div class="card-h"><h3>Pick a layer</h3><span class="sub">by blast radius</span></div><div class="card-b">${[...layers].sort((a, b) => b.blastRadius - a.blastRadius).map((x) => `<button class="link-row ${x.id === l.id ? 'on' : ''}" data-inc-layer="${x.id}"><span class="t">${bandDot(x.score)}${esc(x.name)}</span><span class="r">${plural(x.blastRadius, 'layer')}</span></button>`).join('')}</div></div>
      <div>
        <div class="tiles inc-tiles">
          <div class="tile"><div class="k">Layers hit if it breaks</div><div class="v">${hit.length}</div></div>
          <div class="tile"><div class="k">Directly</div><div class="v">${hit.filter((h) => h.depth === 1).length}</div></div>
          <div class="tile"><div class="k">Longest chain</div><div class="v">${deep ? plural(deep, 'hop') : '—'}</div></div>
          <div class="tile"><div class="k">Avg debt in the blast zone</div><div class="v">${hit.length ? avg : '—'}</div></div>
        </div>
        <div class="card" style="margin-top:12px"><div class="card-h"><h3>If ${esc(l.name)} breaks</h3><span class="sub">columns = hops away · colour = debt band · click a layer to re-centre</span></div><div class="card-b">
          ${hit.length ? columnsSvg({ cols, names: ['Breaks here', ...Array.from({ length: deep }, (_, k) => (k === 0 ? 'Depends on it directly' : `${k + 1} hops away`))], edges }) : `<div class="empty"><b>Nothing depends on ${esc(l.name)}</b>A change here can't break another layer through imports.</div>`}
        </div></div>
        ${hit.length ? `<div class="card" style="margin-top:12px"><div class="card-h"><h3>Why each layer is in the blast zone</h3>${bandBadge(l.score, true)}</div><div class="card-b">${hit.map((h) => `<div class="inc-why">${bandDot(L(h.layer)?.score)}<b>${esc(lname(h.layer))}</b><span class="muted">${h.depth === 1 ? 'imports it directly' : `through ${h.path.slice(1, -1).map(lname).map(esc).join(' → ')}`}</span><span class="mono muted">${h.path.map(lname).map(esc).join(' → ')}</span><button class="btn sm ghost" data-goto-layer="${h.layer}">${icon(LAYER_ICON[h.layer] || 'layers')} Architecture</button></div>`).join('')}</div></div>` : ''}
      </div></div>`;
  }
  function blastIncident() {
    if (I.error) return failed();
    const c = I.data.cases.find((x) => x.id === I.blastCase) || I.data.cases[0]; I.blastCase = c.id;
    const g = I.data.blast[c.id]; const st = I.blastState;
    const keys = g.type === 'keys';
    const names = [keys ? 'Incident' : 'Alert', ...g.ring_names.slice(1)];
    const nring = Math.max(...g.nodes.map((n) => n.ring)) + 1;
    const color = (n) => (n.ring === 0 ? 'var(--accent)' : n.critical || CRIT_KINDS.has(n.kind) ? 'var(--crit)' : n.kind === 'control' || n.ring === 1 ? 'var(--serious)' : 'var(--line-strong)');
    const cols = Array.from({ length: nring }, (_, r) => g.nodes.filter((n) => n.ring === r).map((n) => ({ id: n.id, label: n.label, sub: `${n.kind}${n.state ? ` · ${n.state}` : ''}${n.critical ? ' · critical' : ''}`, color: color(n), dim: !n[st], title: `${n.label} (${n.kind})` })));
    const b = g.before, a = g.after, cur = g[st];
    const tiles = keys ? [['Permissions', 'permissions'], ['Things reachable', 'assets'], ['Critical (secrets, takeover, exfil)', 'critical']] : [['Things affected', 'assets'], ['Critical', 'critical'], ['Services', 'service'], ['Data', 'data'], ['Dashboards', 'dashboard']];
    return `<div class="inc-cases">${I.data.cases.map((x) => `<button class="scen inc-case ${x.id === c.id ? 'on' : ''}" data-inc-bcase="${x.id}"><div class="inc-row"><span class="mono muted">${x.id}</span><span class="inc-row">${verdictPill(x.investigation)}</span></div><h4>${esc(x.title)}</h4></button>`).join('')}</div>
      <div class="inc-row" style="margin:14px 0 10px"><span class="muted">${keys ? 'What the hijacked agent\'s keys reach.' : 'Systems downstream of the part that broke.'}</span>${seg('bstate', st, keys ? [['before', 'Before the fix'], ['after', 'After removing unused keys']] : [['before', 'During the incident'], ['after', 'After the fix']])}</div>
      <div class="tiles inc-tiles">${tiles.map(([k, f]) => `<div class="tile"><div class="k">${k}</div><div class="v">${cur[f] ?? 0}${st === 'after' && b[f] !== a[f] ? ` <span class="muted inc-was">was ${b[f]}</span>` : ''}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:12px"><div class="card-h"><h3>${esc(c.title)}</h3><span class="sub">${g.caption ? esc(g.caption) + ' · ' : ''}faded = out of reach ${st === 'after' ? 'after the fix' : ''}</span></div><div class="card-b">${columnsSvg({ cols, names, edges: g.edges.map((e) => ({ s: e.s, t: e.t, dim: !e[st] })) })}</div></div>`;
  }
  const L = (id) => S.data?.layers.find((l) => l.id === id);
  function renderBlast() {
    const el = $('#page-blast');
    const head = `<div class="page-head"><div><h1>Blast radius</h1><p>If this breaks, what else breaks? For this repo: every layer that imports the one you pick, directly or through other layers. For incidents: the systems, keys and data a broken part or a hijacked AI agent reaches, before and after the fix.</p></div>${seg('bmode', I.blastMode, [['repo', `This repo's layers`], ['incident', 'Incidents']])}</div>`;
    const body = I.blastMode === 'repo' ? blastRepo() : (I.data || I.error ? `${I.data ? synthNote() : ''}${blastIncident()}` : '');
    if (I.blastMode === 'incident' && !ensure('blast')) return;
    el.innerHTML = `<div class="wrap">${head}${body}</div>`;
  }

  /* ---------------------------------------------------------------- wiring */
  function render(p) {
    if (!PAGES.includes(p) || !S.data) return;
    if (p === 'investigate') { if (ensure(p)) renderInvestigate(); }
    else if (p === 'mitre') { if (ensure(p)) renderMitre(); }
    else renderBlast();
    hydrate($('#page-' + p));
  }
  const rerender = () => render(S.page);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-inc-case],[data-inc-case-go],[data-inc-ev],[data-inc-tech],[data-inc-set],[data-inc-layer],[data-inc-bcase],[data-inc-blast],[data-inc-go]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.incCase) { I.caseId = ds.incCase; rerender(); }
    else if (ds.incCaseGo) { I.caseId = ds.incCaseGo; U.setPage('investigate'); }
    else if (ds.incEv) { I.evOpen.has(ds.incEv) ? I.evOpen.delete(ds.incEv) : I.evOpen.add(ds.incEv); rerender(); }
    else if (ds.incTech) { I.tech = ds.incTech; if (S.page !== 'mitre') U.setPage('mitre'); else rerender(); $('#incTechDetail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else if (ds.incSet) { const [k, v] = ds.incSet.split(':'); ({ chain: () => (I.chainState = v), bstate: () => (I.blastState = v), bmode: () => (I.blastMode = v) })[k](); rerender(); }
    else if (ds.incLayer) { I.blastLayer = ds.incLayer; rerender(); }
    else if (ds.incBcase) { I.blastCase = ds.incBcase; rerender(); }
    else if (ds.incBlast) { I.blastMode = 'incident'; I.blastCase = ds.incBlast; U.setPage('blast'); }
    else if (ds.incGo) U.setPage(ds.incGo);
  });
  document.addEventListener('keydown', (e) => { const n = e.target.closest?.('.inc-node.click'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); I.blastLayer = n.dataset.incLayer; rerender(); } });

  window.NarcIncidents = { render };
  if (PAGES.includes(S.page)) render(S.page);
})();

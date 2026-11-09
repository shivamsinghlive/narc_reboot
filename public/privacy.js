/* Narc — Privacy tab: who receives this app's user data, what they get, and which open PRs change that.

   Visual first: a live Telescreen map with data flowing to each company, scorecards with Yes / No / ? verdicts,
   flow cards drawn as "data → company", and bar charts for the data inventory and Narc's own requests.
   Data comes from lib/privacy.js (static analysis, nothing sent anywhere). Companies are researched with
   Tavily + Exa via POST /api/privacy/research (only the name and website are searched), and GET /api/egress
   lists every request Narc itself made while analysing the repo. */
(() => {
  'use strict';
  const U = window.NarcUI;
  if (!U) return;
  const { S, $, esc, icon, plural, bandColor, lname, LAYER_ICON } = U;

  const P = { research: {}, pending: new Set(), egress: null, egressFor: null, sel: null, kind: 'all' };
  const CAT_COLOR = { ads: 'var(--crit)', replay: 'var(--crit)', enrichment: 'var(--crit)', analytics: 'var(--serious)', marketing: 'var(--warn)', ai: 'var(--accent)', errors: 'var(--up)', messaging: 'var(--up)', payments: 'var(--good)', search: 'var(--up)' };
  const KIND = { share: 'Shared with companies', ai: 'Sent to AI', logs: 'In logs', storage: 'Stored unsafely', url: 'In URLs' };
  const PII_LABEL = { email: 'Email', phone: 'Phone', name: 'Name', address: 'Address', location: 'Location', ip: 'IP address', dob: 'Birth date', gov: 'Gov ID', card: 'Card', health: 'Health', password: 'Password', gender: 'Gender', typed: 'Typed text' };
  const GRADE_COLOR = { A: 'var(--good)', B: '#5aa83a', C: 'var(--warn)', D: 'var(--serious)', F: 'var(--crit)' };
  const sevColor = (s) => (s >= 5 ? 'var(--crit)' : s >= 4 ? 'var(--serious)' : s >= 3 ? 'var(--warn)' : 'var(--muted)');
  const sevLabel = (s) => (s >= 5 ? 'Critical' : s >= 4 ? 'High' : s >= 3 ? 'Medium' : 'Low');
  const ghLine = (f) => `${S.data.repo.url}/blob/${S.data.repo.defaultBranch || 'HEAD'}/${f.file}${f.line ? `#L${f.line}` : ''}`;
  const pv = () => S.data?.privacy;

  // Small line glyphs (24×24) for kinds of personal data and where it ends up
  const GLYPH = {
    email: 'M3 6h18v12H3z M3 6l9 7 9-7', phone: 'M7 3h10v18H7z M11 18h2', name: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6',
    gender: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6', address: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-5h4v5',
    location: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', ip: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
    dob: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4', gov: 'M3 5h18v14H3z M9 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 17c0-2 1.5-3 3-3s3 1 3 3 M14 10h4 M14 14h3',
    card: 'M3 6h18v12H3z M3 10h18 M7 15h4', health: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', password: 'M8 17a4 4 0 1 1 0-8 4 4 0 0 1 0 8z M11 12h10 M18 12v3 M21 12v2',
    typed: 'M3 7h18v10H3z M7 11h1 M11 11h1 M15 11h1 M8 14h8', logs: 'M6 3h9l3 3v15H6z M9 9h6 M9 13h6 M9 17h4',
    storage: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    url: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1', ai: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  };
  const glyph = (id, size = 16) => `<svg class="pv-g" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPH[id] || GLYPH.name}"/></svg>`;
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (r, size = 28) => `<span class="pv-av" style="--c:${CAT_COLOR[r.cat] || 'var(--muted)'};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials(r.name))}</span>`;
  const verdictOf = (r) => P.research[r.name]?.flags;
  const vIcon = (v) => (v === true ? icon('alert') : v === false ? icon('check') : icon('help'));
  const vCls = (v) => (v === true ? 'yes' : v === false ? 'no' : 'unk');

  /* ---------------------------------------------------------------- research (Tavily + Exa) */
  async function research(name) {
    if (P.research[name] || P.pending.has(name)) return;
    const domain = pv()?.recipients.find((r) => r.name === name)?.domain;
    P.pending.add(name); paint();
    try {
      const r = await fetch('/api/privacy/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, domain }) });
      const j = await r.json();
      P.research[name] = r.ok ? j : { error: j.error || 'Research failed' };
    } catch (e) { P.research[name] = { error: e.message }; }
    P.pending.delete(name); paint();
  }
  async function loadEgress() {
    if (!S.data?.jobId || P.egressFor === S.data.jobId + ':' + Object.keys(P.research).length) return;
    P.egressFor = S.data.jobId + ':' + Object.keys(P.research).length;
    try { P.egress = await (await fetch(`/api/egress?jobId=${encodeURIComponent(S.data.jobId)}`)).json(); } catch { P.egress = null; }
    paint();
  }

  /* ---------------------------------------------------------------- hero: grade + three visual answers */
  function hero(p) {
    const c = GRADE_COLOR[p.grade], r = 52, C = 2 * Math.PI * r;
    const kinds = [...new Set(p.flows.flatMap((f) => f.pii))].filter((k) => GLYPH[k]);
    const shown = kinds.length ? kinds : p.inventory.slice(0, 5).map((i) => i.id);
    return `<div class="card pv-hero">
      <div class="pv-grade"><svg viewBox="0 0 120 120" width="128" height="128"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="10"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * p.score / 100} ${C}" transform="rotate(-90 60 60)"/><text x="60" y="72" text-anchor="middle" font-size="44" font-weight="800" fill="${c}">${p.grade}</text></svg>
        <div><div class="pv-k">PRIVACY SCORE ${p.score}/100</div><div class="pv-verdict" style="color:${c}">${esc(p.verdict)}</div>
          <div class="pv-scale">${['A', 'B', 'C', 'D', 'F'].map((g) => `<span class="${g === p.grade ? 'on' : ''}" style="--c:${GRADE_COLOR[g]}">${g}</span>`).join('')}</div></div></div>
      <div class="pv-qs">
        <button class="pv-q" data-pv-go="flows"><span class="t">${icon('upload')} What leaves</span><div class="pv-icons">${shown.slice(0, 5).map((k) => `<span class="pv-ic" title="${esc(PII_LABEL[k] || k)}">${glyph(k, 18)}</span>`).join('') || '<span class="muted">nothing</span>'}</div><span class="s">${esc(shown.slice(0, 3).map((k) => PII_LABEL[k] || k).join(', '))}</span></button>
        <button class="pv-q" data-pv-go="map"><span class="t">${icon('users')} Who gets it</span><div class="pv-stack">${p.recipients.slice(0, 5).map((r) => avatar(r, 30)).join('')}${p.recipients.length > 5 ? `<span class="pv-more">+${p.recipients.length - 5}</span>` : ''}</div><span class="s"><b>${p.totals.recipients}</b> ${p.totals.recipients === 1 ? 'company' : 'companies'}</span></button>
        <button class="pv-q" data-pv-go="flows"><span class="t">${icon('file')} Proof</span><div class="pv-big">${p.totals.flows}</div><span class="s">exact lines on GitHub</span></button>
      </div></div>`;
  }

  /** The Telescreen: personal data on the left, the app in the middle, every company on the right, data moving along the wires. */
  function telescreen(p) {
    const R = p.recipients.slice(0, 9);
    if (!R.length) return `<div class="card pv-tele" id="pvMap"><div class="pv-empty-big">${icon('shield')}<b>Nobody outside is watching</b><span>No analytics, ads, session recording or AI SDKs in this repo.</span></div></div>`;
    const D = [...new Set([...p.flows.flatMap((f) => f.pii), ...R.flatMap((r) => r.pii)])].filter((k) => PII_LABEL[k]).slice(0, 7);
    const inv = D.length ? D : p.inventory.slice(0, 6).map((i) => i.id);
    const W = 1000, H = Math.max(300, 70 + Math.max(R.length, inv.length) * 46), cx = 470, cy = H / 2 + 8;
    const ry = (i, n) => 56 + (i + 0.5) * ((H - 70) / n);
    let edges = '', nodes = '', dots = '';
    inv.forEach((k, i) => {
      const y = ry(i, inv.length), hot = p.flows.some((f) => f.pii.includes(k) && f.severity >= 4), d = `M196,${y} C320,${y} 340,${cy} ${cx - 66},${cy}`;
      edges += `<path id="pvIn${i}" d="${d}" class="pv-e ${hot ? 'hot' : ''}"/>`;
      if (hot) dots += `<circle r="3.5" class="pv-dot-in"><animateMotion dur="${2 + i * 0.3}s" repeatCount="indefinite"><mpath href="#pvIn${i}"/></animateMotion></circle>`;
      nodes += `<g class="pv-n data ${hot ? 'hot' : ''}"><rect x="40" y="${y - 17}" width="156" height="34" rx="17"/><g transform="translate(52 ${y - 9}) scale(.75)" class="pv-gl"><path d="${GLYPH[k] || GLYPH.name}"/></g><text x="80" y="${y + 4}">${esc(PII_LABEL[k] || k)}</text></g>`;
    });
    R.forEach((r, i) => {
      const y = ry(i, R.length), col = CAT_COLOR[r.cat] || 'var(--muted)', f = verdictOf(r), sel = P.sel === r.id, x0 = 690;
      const d = `M${cx + 66},${cy} C${cx + 150},${cy} ${x0 - 90},${y} ${x0},${y}`;
      edges += `<path id="pvOut${i}" d="${d}" class="pv-e ${r.flows ? 'flow' : ''}" style="${r.flows ? `stroke:${col};stroke-width:${Math.min(5, 1.6 + r.flows)}` : ''}"/>`;
      dots += `<circle r="${r.flows ? 4 : 2.5}" style="fill:${col}" opacity="${r.flows ? 1 : 0.55}"><animateMotion dur="${r.flows ? 1.8 : 3.2}s" begin="${i * 0.25}s" repeatCount="indefinite"><mpath href="#pvOut${i}"/></animateMotion></circle>`;
      const badges = P.pending.has(r.name) ? `<text x="${x0 + 262}" y="${y + 4}" text-anchor="end" class="sb pv-pulse" style="fill:var(--accent)">researching…</text>`
        : f ? [['sells', 'S'], ['ads', 'A'], ['training', 'AI']].map(([k, l], j) => `<g transform="translate(${x0 + 196 + j * 24} ${y - 10})"><rect width="21" height="20" rx="5" class="pv-vb ${vCls(f[k])}"/><text x="10.5" y="14" text-anchor="middle" class="pv-vt ${vCls(f[k])}">${l}</text></g>`).join('') : '';
      nodes += `<g class="pv-n rec ${sel ? 'sel' : ''}" data-pv-rec="${esc(r.id)}"><rect x="${x0}" y="${y - 20}" width="276" height="40" rx="11"/>
        <circle cx="${x0 + 22}" cy="${y}" r="13" style="fill:${col}" opacity=".16"/><text x="${x0 + 22}" y="${y + 4}" text-anchor="middle" class="pv-avt" style="fill:${col}">${esc(initials(r.name))}</text>
        <text x="${x0 + 44}" y="${y - 2}" class="nm">${esc(r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name)}</text><text x="${x0 + 44}" y="${y + 12}" class="sb">${esc(r.category)}</text>${badges}</g>`;
    });
    const name = S.data.repo.name.length > 12 ? S.data.repo.name.slice(0, 11) + '…' : S.data.repo.name;
    nodes += `<g class="pv-n app"><circle cx="${cx}" cy="${cy}" r="66"/><text x="${cx}" y="${cy - 2}" text-anchor="middle" class="nm" style="font-size:15px">${esc(name)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="sb">your app</text></g>`;
    return `<div class="card pv-tele" id="pvMap"><div class="card-h"><h3>Telescreen</h3><span class="pv-legend"><span><i class="pv-vb yes"></i>Yes</span><span><i class="pv-vb no"></i>No</span><span><i class="pv-vb unk"></i>Not stated</span><span class="muted">S sells · A ads · AI training</span></span></div>
      <svg viewBox="0 0 ${W} ${H}" class="pv-svg"><text x="40" y="34" class="pv-lbl">USER DATA</text><text x="${cx}" y="34" text-anchor="middle" class="pv-lbl">YOUR APP</text><text x="690" y="34" class="pv-lbl">WHO GETS IT · CLICK ONE</text>${edges}${dots}${nodes}</svg></div>`;
  }

  /** One scorecard per company: avatar, three verdict tiles, and how much of the code talks to it. */
  function scorecards(p) {
    if (!p.recipients.length) return '';
    return `<div class="pv-cards">${p.recipients.map((r) => {
      const f = verdictOf(r), pend = P.pending.has(r.name);
      return `<button class="pv-sc ${P.sel === r.id ? 'sel' : ''}" data-pv-rec="${esc(r.id)}">
        <div class="pv-sc-h">${avatar(r, 34)}<div><b>${esc(r.name)}</b><span>${esc(r.category)}</span></div></div>
        <div class="pv-sc-v">${pend ? `<span class="pv-loading"><i></i>researching</span>` : f ? [['sells', 'Sells'], ['ads', 'Ads'], ['training', 'AI']].map(([k, l]) => `<span class="pv-tile ${vCls(f[k])}">${vIcon(f[k])}<em>${l}</em></span>`).join('') : `<span class="muted" style="font-size:12px">${icon('search')} tap to research</span>`}</div>
        <div class="pv-sc-f">${r.pii.slice(0, 4).map((k) => `<span class="pv-ic sm" title="${esc(PII_LABEL[k] || k)}">${glyph(k, 13)}</span>`).join('')}<span>${r.flows ? plural(r.flows, 'flow') : `${r.files} file${r.files === 1 ? '' : 's'}`}</span></div></button>`;
    }).join('')}</div>`;
  }

  function recipientPanel(p) {
    const r = p.recipients.find((x) => x.id === P.sel);
    if (!r) return '';
    const res = P.research[r.name], flows = p.flows.filter((f) => f.recipient === r.id);
    const tile = (v, label, ic) => `<div class="pv-bt ${vCls(v)}"><span class="pv-bt-i">${ic}</span><span class="pv-bt-l">${label}</span><b>${v === true ? 'Yes' : v === false ? 'No' : '?'}</b></div>`;
    return `<div class="card pv-rec"><div class="pv-rec-h">${avatar(r, 44)}<div><h3>${esc(r.name)}</h3><span class="muted">${esc(r.category)}${r.domain ? ` · ${esc(r.domain)}` : ''}</span></div><span class="pv-src">TAVILY + EXA</span><button class="btn" data-pv-close aria-label="Close">${icon('x')}</button></div>
      ${!res ? (P.pending.has(r.name) ? `<div class="pv-loading" style="padding:18px"><i></i>Reading ${esc(r.name)}'s own privacy policy… only the name is searched</div>` : `<div style="padding:16px"><button class="btn primary" data-pv-research="${esc(r.name)}">${icon('search')} Research with Tavily + Exa</button></div>`)
        : res.error ? `<div class="muted" style="padding:16px">${esc(res.error)}</div>`
        : `<div class="pv-bts">${tile(res.flags.sells, 'Sells your data', icon('download'))}${tile(res.flags.ads, 'Used for ads', icon('target'))}${tile(res.flags.training, 'Trains AI on it', icon('cpu'))}<div class="pv-bt ret"><span class="pv-bt-i">${icon('clock')}</span><span class="pv-bt-l">Keeps it for</span><b>${esc(res.flags.retention || '?')}</b></div></div>
          ${res.answer ? `<details class="pv-det"><summary>${icon('file')} What their policy says</summary><p>${esc(res.answer)}</p></details>` : ''}
          <div class="pv-srcs">${res.sources.map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}"><span class="src ${s.engine.toLowerCase()}">${s.engine === 'Tavily' ? 'T' : 'E'}${i + 1}</span>${esc((() => { try { return new URL(s.url).host.replace(/^www\./, ''); } catch { return s.url; } })())}</a>`).join('')}</div>`}
      <div class="pv-rec-code"><span class="pv-h">This code sends it</span>
        <div class="pv-icons">${(r.pii.length ? r.pii : []).map((k) => `<span class="pv-ic" title="${esc(PII_LABEL[k] || k)}">${glyph(k, 16)}<em>${esc(PII_LABEL[k] || k)}</em></span>`).join('') || `<span class="muted">${esc(r.typical.join(', '))} (typical)</span>`}</div>
        ${flows.slice(0, 3).map((f) => `<a class="pv-ev" href="${esc(ghLine(f))}" target="_blank" rel="noopener">${icon('external')}<span class="mono">${esc(f.file.split('/').slice(-2).join('/'))}:${f.line}</span></a>`).join('')}</div></div>`;
  }

  function prWatch(p) {
    if (!p.prChanges.length) return `<div class="card pv-prs"><div class="card-h"><h3>Open PRs</h3></div><div class="pv-ok-big">${icon('check')}<b>All clear</b><span>${plural(S.data.prs?.length || 0, 'open PR')} checked: none adds a tracker or new data flow</span></div></div>`;
    return `<div class="card pv-prs"><div class="card-h"><h3>Open PRs</h3><span class="pv-alert">${icon('alert')} ${plural(p.prChanges.length, 'PR')} would add tracking</span></div>
      ${p.prChanges.slice(0, 5).map((c) => `<a class="pv-pr" href="${esc(c.url)}" target="_blank" rel="noopener" style="border-left-color:${sevColor(c.severity)}">
        <div class="pv-pr-h">${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<b>#${c.number}</b><span>${esc(c.title)}</span></div>
        ${c.items.slice(0, 3).map((x) => `<div class="pv-pr-i">${icon(x.rule === 'new-recipient' ? 'plus' : 'alert')}<span>${esc(x.title)}</span></div>`).join('')}</a>`).join('')}</div>`;
  }

  /** Flow cards: "data → destination" drawn, code underneath, explanation folded away. */
  function flowsList(p) {
    const kinds = Object.keys(KIND).filter((k) => p.flows.some((f) => f.kind === k));
    const list = p.flows.filter((f) => P.kind === 'all' || f.kind === P.kind);
    const tabs = [['all', 'All', p.flows.length], ...kinds.map((k) => [k, KIND[k], p.flows.filter((f) => f.kind === k).length])];
    const dest = (f) => {
      const r = f.recipient && p.recipients.find((x) => x.id === f.recipient);
      if (r) return `${avatar(r, 26)}<b>${esc(r.name)}</b>`;
      const [g, l] = { logs: ['logs', 'Logs'], storage: ['storage', /browser/i.test(f.title) ? 'Browser' : 'Database'], url: ['url', 'URL'], ai: ['ai', 'AI model'] }[f.kind] || ['logs', 'Elsewhere'];
      return `<span class="pv-ic">${glyph(g, 16)}</span><b>${l}</b>`;
    };
    return `<div class="card pv-flows" id="pvFlows"><div class="card-h"><h3>Data flows in the code</h3><span class="sub">click a file to open the exact line</span></div>
      <div class="pv-tabs">${tabs.map(([k, l, n]) => `<button class="${P.kind === k ? 'on' : ''}" data-pv-kind="${k}">${esc(l)} <em>${n}</em></button>`).join('')}</div>
      ${list.length ? `<div class="pv-fgrid">${list.slice(0, 30).map((f) => `<div class="pv-fc" style="--s:${sevColor(f.severity)}">
        <div class="pv-fc-top"><span class="pv-fc-from">${(f.pii.length ? f.pii : ['name']).slice(0, 3).map((k) => `<span class="pv-ic" title="${esc(PII_LABEL[k] || k)}">${glyph(k, 16)}<em>${esc(PII_LABEL[k] || k)}</em></span>`).join('')}</span>
          <span class="pv-arrow"><i></i></span><span class="pv-fc-to">${dest(f)}</span><span class="pv-sevtag">${sevLabel(f.severity)}</span></div>
        <a class="mono pv-loc" href="${esc(ghLine(f))}" target="_blank" rel="noopener">${icon('external')} ${esc(f.file.split('/').slice(-3).join('/'))}${f.line ? `:${f.line}` : ''}</a>
        <code class="pv-code">${esc(f.snippet)}</code>
        <details class="pv-det"><summary>${icon('users')} Who can read it · how to fix</summary><p><b>Who:</b> ${esc(f.who)}</p><p><b>Fix:</b> ${esc(f.fix)}</p></details></div>`).join('')}</div>`
        : `<div class="pv-ok-big">${icon('check')}<b>Clean</b><span>No risky flows of personal data${P.kind === 'all' ? '' : ' here'}</span></div>`}
      ${list.length > 30 ? `<div class="muted" style="padding:10px 16px">+ ${list.length - 30} more</div>` : ''}</div>`;
  }

  /** Personal data inventory as a bar chart: how many files touch each kind. */
  function inventory(p) {
    if (!p.inventory.length) return '';
    const inv = [...p.inventory].sort((a, b) => b.files - a.files).slice(0, 9), max = inv[0].files;
    return `<div class="card pv-inv"><div class="card-h"><h3>Personal data in the code</h3><span class="sub">files per kind</span></div>
      <div class="pv-bars">${inv.map((i) => { const hot = ['health', 'financial', 'credential', 'sensitive'].includes(i.kind) || i.id === 'gov';
        return `<div class="pv-bar ${hot ? 'hot' : ''}"><span class="pv-ic sm">${glyph(i.id, 13)}</span><span class="l">${esc(i.label)}</span><span class="b"><i style="width:${Math.max(4, 100 * i.files / max)}%"></i></span><span class="n">${i.files}</span></div>`; }).join('')}</div></div>`;
  }

  /** Narc's own receipt: every request it made for this analysis, as bars, and whether any code left. */
  function proof() {
    const e = P.egress;
    if (!e) return `<div class="card pv-proof"><div class="card-h"><h3>What Narc sent</h3></div><div class="pv-loading" style="padding:14px 16px"><i></i>Loading…</div></div>`;
    const by = {}; for (const c of e.calls) { const x = (by[c.who] ||= { who: c.who, why: c.why, n: 0, bytes: 0, ex: c.sent }); x.n++; x.bytes += c.bytes; if (!x.ex && c.sent) x.ex = c.sent; }
    const ai = by.OpenAI, rows = Object.values(by).sort((a, b) => b.n - a.n), cloudAi = !e.local && S.data.mode === 'ai', max = rows[0]?.n || 1;
    const state = ai ? 'bad' : cloudAi ? 'warn' : 'ok';
    const head = ai ? `<b>${(ai.bytes / 1024).toFixed(0)} KB of code</b> went to OpenAI` : cloudAi ? `<b>0 bytes of code</b> this run (AI from cache)` : `<b>0 bytes of your code</b> left this laptop`;
    const sub = ai || cloudAi ? 'Turn on Local AI in Settings so code never leaves' : e.local ? `AI ran on this laptop (${esc(S.data.model)}). Only public names were searched.` : 'Only public repo data was read; only public names were searched.';
    return `<div class="card pv-proof"><div class="card-h"><h3>What Narc sent</h3><span class="sub">every request for this report</span></div>
      <div class="pv-proof-hero ${state}"><span class="pv-shield">${icon(state === 'ok' ? 'shield' : 'alert')}</span><div><div class="h">${head}</div><div class="s">${sub}</div></div></div>
      <div class="pv-bars eg">${rows.map((r) => `<div class="pv-bar ${r.who === 'OpenAI' ? 'hot' : r.who === 'Local AI' ? 'local' : ''}" title="${esc(r.why)}${r.ex ? ` — e.g. "${esc(r.ex.slice(0, 140))}"` : ''}"><span class="l"><b>${esc(r.who)}</b></span><span class="b"><i style="width:${Math.max(4, 100 * r.n / max)}%"></i></span><span class="n">${r.n}×</span></div>`).join('')}</div></div>`;
  }

  /* ---------------------------------------------------------------- page */
  function paint() {
    if (S.page !== 'privacy') return;
    const el = $('#page-privacy');
    const p = pv();
    if (!p) { el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>Privacy</h1></div></div><div class="card"><div class="empty"><b>No privacy report for this analysis</b>Analyze a repo to see who receives its users' data.</div></div></div>`; return; }
    const y = el.scrollTop;
    el.innerHTML = `<div class="wrap pv">
      <div class="page-head"><div><h1>Who's watching your users?</h1><p>Where this app sends its users' data, found in the code. Nothing about it was sent anywhere.</p></div></div>
      ${hero(p)}
      ${telescreen(p)}
      ${recipientPanel(p)}
      ${scorecards(p)}
      <div class="pv-grid">${flowsList(p)}<div>${prWatch(p)}${inventory(p)}${proof()}</div></div>
    </div>`;
    el.scrollTop = y;
  }
  /** Privacy debt: the same 0–100 debt scale as tech debt, per part of the app, with the fixes that pay most of it down. */
  function paintDebt() {
    if (S.page !== 'pdebt') return;
    const el = $('#page-pdebt'), p = pv();
    if (!p) { el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>Privacy debt</h1></div></div><div class="card"><div class="empty"><b>No privacy report for this analysis</b>Analyze a repo to see where it leaks user data.</div></div></div>`; return; }
    const layers = [...S.data.layers].filter((l) => l.privacy).sort((a, b) => b.privacy.score - a.privacy.score);
    const leaking = layers.filter((l) => l.privacy.score > 0), worst = leaking[0], total = layers.reduce((n, l) => n + l.privacy.score, 0);
    const prItems = p.prChanges.reduce((n, c) => n + c.items.length, 0);
    const recOf = (id) => p.recipients.find((r) => r.id === id);
    // Group the flows by what you'd do about them, so the list reads as a to-do, biggest payoff first
    const groups = {}; for (const f of p.flows) { const k = f.rule + '|' + (f.recipient || f.kind); (groups[k] ||= { f, n: 0, pts: 0, layers: new Set() }); groups[k].n++; groups[k].pts += [0, 2, 4, 8, 14, 20][f.severity] || 0; if (f.layer) groups[k].layers.add(f.layer); }
    const fixes = Object.values(groups).sort((a, b) => b.pts - a.pts).slice(0, 6);
    const tile = (ic, k, v, s, c) => `<div class="pd-tile"><div class="k">${icon(ic)} ${k}</div><div class="v" style="${c ? `color:${c}` : ''}">${v}</div><div class="s">${s}</div></div>`;
    el.innerHTML = `<div class="wrap pv">
      <div class="page-head"><div><h1>Privacy debt</h1><p>Like tech debt, but for your users' data: every part of the app scored 0–100 for how much personal data it leaks, and the fixes that pay it down.</p></div>
        <div class="actions"><button class="btn" data-go-arch>${icon('network')} See it on the architecture</button></div></div>
      <div class="pd-tiles">
        ${tile('radar', 'Privacy grade', `${p.grade}`, `${p.score}/100 · ${esc(p.verdict)}`, GRADE_COLOR[p.grade])}
        ${tile('layers', 'Leaking parts', `${leaking.length}<span style="font-size:16px;color:var(--muted)">/${layers.length}</span>`, 'layers send user data out')}
        ${tile('flame', 'Worst part', worst ? esc(worst.name.split(' /')[0]) : 'None', worst ? `${worst.privacy.score} privacy debt` : 'nothing leaks', worst ? bandColor(worst.privacy.score) : 'var(--good)')}
        ${tile('pr', 'Coming in PRs', prItems, prItems ? 'changes would add debt' : 'no open PR adds debt', prItems ? 'var(--crit)' : 'var(--good)')}
      </div>
      <div class="card"><div class="card-h"><h3>Privacy debt by part of the app</h3><span class="sub">0–100, higher is worse · click one to open it on the architecture</span></div>
        <div class="pd-rows">${layers.map((l) => { const x = l.privacy, recs = x.recipients.map(recOf).filter(Boolean);
          return `<button class="pd-row ${x.score ? '' : 'clean'}" data-goto-layer="${l.id}" data-ptab-next="priv"><span class="ln">${icon(LAYER_ICON[l.id])}${esc(l.name)}</span>
            <span class="pd-bar"><i style="width:${Math.max(x.score ? 3 : 0, x.score)}%;background:${bandColor(x.score)}"></i></span><span class="sc" style="color:${x.score ? bandColor(x.score) : 'var(--muted)'}">${x.score}</span>
            <span class="what">${x.pii.slice(0, 4).map((k) => `<span class="pv-ic" title="${esc(PII_LABEL[k] || k)}">${glyph(k, 14)}</span>`).join('')}${recs.length ? `<span style="display:inline-flex;margin-left:6px">${recs.slice(0, 5).map((r) => avatar(r, 24)).join('')}</span>` : ''}${!x.pii.length && !recs.length ? '<span class="muted" style="font-size:12px">No user data leaves here</span>' : ''}</span>
            <span class="br"><b>${l.dependents.length}</b>blast radius</span></button>`; }).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>Fixes that pay down the most debt</h3><span class="sub">grouped from ${plural(p.flows.length, 'data flow')}</span></div>
        ${fixes.length ? fixes.map((g, i) => { const r = g.f.recipient && recOf(g.f.recipient);
          return `<div class="pd-fix"><span class="n" style="background:color-mix(in srgb, ${sevColorRaw(g.f.severity)} 15%, transparent);color:${sevColorRaw(g.f.severity)}">${i + 1}</span>
            <div><div class="t">${esc(g.f.title)}${g.n > 1 ? ` <span class="muted" style="font-weight:400">· ${g.n} places</span>` : ''}</div><div class="d">${esc(g.f.fix)}</div></div>
            <div class="c">${[...g.layers].map((id) => esc(lname(id).split(' /')[0])).join(', ')}${r ? `<br>${esc(r.name)}` : ''}</div></div>`; }).join('')
          : `<div class="pv-ok-big">${icon('check')}<b>No privacy debt</b><span>Nothing in this app sends personal data where it shouldn't.</span></div>`}</div>
    </div>`;
    const n = $('#navPdebt'); if (n) n.textContent = leaking.length || '';
  }
  const sevColorRaw = (s) => (s >= 5 ? 'var(--crit)' : s >= 4 ? 'var(--serious)' : s >= 3 ? 'var(--warn)' : 'var(--muted)');

  function render(page) {
    if (page === 'pdebt') { paintDebt(); return; }
    if (page !== 'privacy') return;
    const p = pv();
    // Research every company up front (cached for a week) so verdicts are on the map, not behind a click.
    if (p) p.recipients.slice(0, 8).forEach((r) => research(r.name));
    loadEgress();
    paint();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-go-arch]')) { U.setPage('arch'); return; }
    const t = e.target.closest('[data-pv-rec],[data-pv-close],[data-pv-research],[data-pv-kind],[data-pv-go]');
    if (!t || S.page !== 'privacy') return;
    const d = t.dataset;
    if (d.pvRec) { P.sel = P.sel === d.pvRec ? null : d.pvRec; const r = pv().recipients.find((x) => x.id === d.pvRec); if (r && P.sel) research(r.name); paint(); if (P.sel) $('.pv-rec')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (d.pvClose !== undefined) { P.sel = null; paint(); }
    else if (d.pvResearch) research(d.pvResearch);
    else if (d.pvKind) { P.kind = d.pvKind; paint(); }
    else if (d.pvGo) $(d.pvGo === 'map' ? '#pvMap' : '#pvFlows')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // New analysis → forget the previous repo's selection (research results are kept; they're per company)
  let lastJob = null;
  setInterval(() => { if (S.data?.jobId !== lastJob) { lastJob = S.data?.jobId; P.sel = null; P.kind = 'all'; P.egress = null; P.egressFor = null; } }, 1000);

  window.NarcPrivacy = { render };
})();

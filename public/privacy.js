/* Narc — Privacy tab: who receives this app's user data, what they get, and which open PRs change that.

   Data comes from lib/privacy.js (static analysis of the downloaded source and open-PR diffs, nothing sent anywhere).
   Recipients are researched with Tavily + Exa via POST /api/privacy/research (only the company name is searched),
   and GET /api/egress lists every request Narc itself made while analysing the repo. */
(() => {
  'use strict';
  const U = window.NarcUI;
  if (!U) return;
  const { S, $, esc, icon, plural } = U;

  const P = { research: {}, pending: new Set(), egress: null, egressFor: null, sel: null, kind: 'all', state: 'now' };
  const CAT_COLOR = { ads: 'var(--crit)', replay: 'var(--crit)', enrichment: 'var(--crit)', analytics: 'var(--serious)', marketing: 'var(--warn)', ai: 'var(--accent)', errors: 'var(--up)', messaging: 'var(--up)', payments: 'var(--good)', search: 'var(--up)' };
  const KIND = { share: ['Shared with third parties', 'Personal data handed to an outside company'], ai: ['Sent to AI models', 'Personal data inside prompts'], logs: ['Written to logs', 'Readable by anyone with log access'],
    storage: ['Stored unsafely', 'In the browser or unencrypted in the database'], url: ['Leaked in URLs', 'Ends up in server logs, history and referrers'] };
  const PII_LABEL = { email: 'Email', phone: 'Phone', name: 'Name', address: 'Address', location: 'Location', ip: 'IP address', dob: 'Birth date', gov: 'Gov ID', card: 'Card', health: 'Health', password: 'Password', gender: 'Gender', typed: 'Typed text' };
  const GRADE_COLOR = { A: 'var(--good)', B: '#5aa83a', C: 'var(--warn)', D: 'var(--serious)', F: 'var(--crit)' };
  const sevColor = (s) => (s >= 5 ? 'var(--crit)' : s >= 4 ? 'var(--serious)' : s >= 3 ? 'var(--warn)' : 'var(--muted)');
  const sevLabel = (s) => (s >= 5 ? 'Critical' : s >= 4 ? 'High' : s >= 3 ? 'Medium' : 'Low');
  const ghLine = (f) => `${S.data.repo.url}/blob/${S.data.repo.defaultBranch || 'HEAD'}/${f.file}${f.line ? `#L${f.line}` : ''}`;
  const pv = () => S.data?.privacy;

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

  /* ---------------------------------------------------------------- pieces */
  function hero(p) {
    const c = GRADE_COLOR[p.grade], r = 52, C = 2 * Math.PI * r;
    const kinds = [...new Set(p.flows.flatMap((f) => f.pii))];
    const line = p.totals.recipients
      ? `This app hands user data to <b>${plural(p.totals.recipients, 'outside company', 'outside companies')}</b>${p.totals.flows ? `, with <b>${plural(p.totals.flows, 'risky data flow')}</b> in the code` : ''}${p.totals.prs ? `, and <b>${plural(p.totals.prs, 'open PR')}</b> would change who watches your users` : ''}.`
      : p.totals.flows ? `No third-party trackers found, but <b>${plural(p.totals.flows, 'risky data flow')}</b> put user data at risk.` : 'No trackers and no risky data flows found. This app keeps to itself.';
    const q = (n, t, sub, go) => `<button class="pv-q" data-pv-go="${go}"><b>${n}</b><span class="t">${t}</span><span class="s">${sub}</span></button>`;
    return `<div class="card pv-hero">
      <div class="pv-grade"><svg viewBox="0 0 120 120" width="132" height="132"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="10"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * p.score / 100} ${C}" transform="rotate(-90 60 60)"/><text x="60" y="72" text-anchor="middle" font-size="44" font-weight="800" fill="${c}">${p.grade}</text></svg>
        <div><div class="pv-k">PRIVACY SCORE · ${p.score}/100</div><div class="pv-verdict" style="color:${c}">${esc(p.verdict)}</div><p class="pv-line">${line}</p></div></div>
      <div class="pv-qs">
        ${q(kinds.length || p.inventory.length, 'What leaves', kinds.length ? kinds.slice(0, 4).map((k) => PII_LABEL[k] || k).join(', ') : `${p.inventory.length} kinds of personal data handled`, 'flows')}
        ${q(p.totals.recipients, 'Who can read it', p.recipients.slice(0, 3).map((r) => r.name).join(', ') || 'nobody outside', 'map')}
        ${q(p.totals.flows, 'Proof', 'exact files and lines, linked to GitHub', 'flows')}
      </div></div>`;
  }

  /** The Telescreen: personal data on the left, this app in the middle, everyone who receives it on the right. */
  function telescreen(p) {
    const R = p.recipients.slice(0, 10);
    if (!R.length) return `<div class="card pv-tele"><div class="card-h"><h3>Telescreen</h3><span class="sub">who receives user data</span></div><div class="empty" style="padding:28px"><b>Nobody outside is watching</b>No analytics, ads, session recording or AI SDKs found in this repo.</div></div>`;
    const D = [...new Set([...p.flows.flatMap((f) => f.pii), ...R.flatMap((r) => r.pii)])].filter((k) => PII_LABEL[k]).slice(0, 8);
    const inv = D.length ? D : p.inventory.slice(0, 6).map((i) => i.id);
    const W = 900, H = Math.max(260, 60 + Math.max(R.length, inv.length) * 40), cx = 450, cy = H / 2;
    const ry = (i, n) => 40 + (i + 0.5) * ((H - 60) / n);
    const linkWeight = (r) => r.flows ? Math.min(5, 1.5 + r.flows) : 1.2;
    let edges = '', nodes = '';
    inv.forEach((k, i) => {
      const y = ry(i, inv.length), hot = p.flows.some((f) => f.pii.includes(k) && f.severity >= 4);
      edges += `<path d="M178,${y} C300,${y} 330,${cy} ${cx - 62},${cy}" class="pv-e ${hot ? 'hot' : ''}"/>`;
      nodes += `<g class="pv-n data"><rect x="40" y="${y - 15}" width="138" height="30" rx="15"/><text x="109" y="${y + 4}" text-anchor="middle">${esc(PII_LABEL[k] || k)}</text></g>`;
    });
    R.forEach((r, i) => {
      const y = ry(i, R.length), col = CAT_COLOR[r.cat] || 'var(--muted)', res = P.research[r.name], sel = P.sel === r.id;
      edges += `<path d="M${cx + 62},${cy} C${cx + 150},${cy} 560,${y} 640,${y}" class="pv-e ${r.flows ? 'flow' : ''}" style="stroke:${r.flows ? col : ''};stroke-width:${linkWeight(r)}"/>`;
      const flag = res?.flags ? [res.flags.sells === true && 'sells data', res.flags.ads === true && 'used for ads', res.flags.training === true && 'AI training'].filter(Boolean)[0] : null;
      nodes += `<g class="pv-n rec ${sel ? 'sel' : ''}" data-pv-rec="${esc(r.id)}"><rect x="640" y="${y - 17}" width="220" height="34" rx="9"/><rect x="640" y="${y - 9}" width="3" height="18" rx="1.5" style="fill:${col}"/>
        <text x="652" y="${y - 1}" class="nm">${esc(r.name)}</text><text x="652" y="${y + 11}" class="sb">${esc(r.category)}${r.flows ? ` · ${plural(r.flows, 'flow')}` : ''}</text>
        ${P.pending.has(r.name) ? `<text x="852" y="${y + 4}" text-anchor="end" class="sb pv-pulse" style="fill:var(--accent)">researching…</text>` : flag ? `<text x="852" y="${y + 4}" text-anchor="end" class="sb" style="fill:var(--crit);font-weight:650">${esc(flag)}</text>` : res?.sources ? `<text x="852" y="${y + 4}" text-anchor="end" class="sb" style="fill:var(--accent)">${res.sources.length} sources</text>` : ''}</g>`;
    });
    const name = S.data.repo.name.length > 12 ? S.data.repo.name.slice(0, 11) + '…' : S.data.repo.name;
    nodes += `<g class="pv-n app"><circle cx="${cx}" cy="${cy}" r="62"/><text x="${cx}" y="${cy - 4}" text-anchor="middle" class="nm">${esc(name)}</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" class="sb">your app</text></g>`;
    return `<div class="card pv-tele" id="pvMap"><div class="card-h"><h3>Telescreen</h3><span class="sub">personal data your app handles → everyone who receives it. Click a company to see what it does with it.</span></div>
      <svg viewBox="0 0 ${W} ${H}" class="pv-svg"><text x="40" y="24" class="pv-lbl">USER DATA IN THE CODE</text><text x="640" y="24" class="pv-lbl">WHO RECEIVES IT</text>${edges}${nodes}</svg></div>`;
  }

  function recipientPanel(p) {
    const r = p.recipients.find((x) => x.id === P.sel);
    if (!r) return '';
    const res = P.research[r.name], flows = p.flows.filter((f) => f.recipient === r.id);
    const flag = (v, label) => `<span class="pv-flag ${v === true ? 'on' : v === false ? '' : 'unk'}">${v === true ? icon('alert') : v === false ? icon('check') : icon('help')} ${label}: <b>${v === true ? 'Yes' : v === false ? 'No' : 'Not stated'}</b></span>`;
    return `<div class="card pv-rec"><div class="card-h"><h3 style="display:flex;gap:8px;align-items:center"><span class="pv-dot" style="background:${CAT_COLOR[r.cat]}"></span>${esc(r.name)}<span class="pill">${esc(r.category)}</span></h3><button class="btn" data-pv-close>${icon('x')}</button></div>
      <div class="pv-rec-b">
        <div class="pv-rec-col"><div class="pv-h">In this repo</div>
          ${r.evidence.map((e) => `<div class="pv-ev">${icon(e.how === 'package' ? 'database' : 'file')}<span class="mono">${esc(e.where)}</span></div>`).join('')}
          <div class="pv-h" style="margin-top:12px">What it usually collects</div><div class="pv-chips">${r.typical.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
          ${flows.length ? `<div class="pv-h" style="margin-top:12px">Personal data this code sends it</div>${flows.slice(0, 4).map((f) => `<a class="pv-ev" href="${esc(ghLine(f))}" target="_blank" rel="noopener">${icon('file')}<span class="mono">${esc(f.file)}:${f.line}</span><span>${esc(f.title)}</span></a>`).join('')}` : ''}
        </div>
        <div class="pv-rec-col"><div class="pv-h">What ${esc(r.name)} does with it <span class="pv-src">TAVILY + EXA</span></div>
          ${!res ? (P.pending.has(r.name) ? `<div class="pv-loading"><i></i>Researching ${esc(r.name)}'s privacy policy… only the company name is searched</div>` : `<button class="btn primary" data-pv-research="${esc(r.name)}">${icon('search')} Research with Tavily + Exa</button>`)
            : res.error ? `<div class="muted">${esc(res.error)}</div>`
            : `<div class="pv-flags">${flag(res.flags.sells, 'Sells data')}${flag(res.flags.ads, 'Ads')}${flag(res.flags.training, 'AI training')}<span class="pv-flag">${icon('clock')} Retention: ${esc(res.flags.retention || 'not stated')}</span></div>
              ${res.answer ? `<p class="pv-answer">${esc(res.answer)}</p>` : ''}
              <div class="pv-sources">${res.sources.map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener"><span class="src ${s.engine.toLowerCase()}">${esc(s.engine)} ${i + 1}</span>${esc(s.title || s.url)}</a>`).join('')}</div>`}
        </div></div></div>`;
  }

  function prWatch(p) {
    if (!p.prChanges.length) return `<div class="card pv-prs"><div class="card-h"><h3>Coming in open PRs</h3><span class="sub">checked ${plural(S.data.prs?.length || 0, 'open PR')}</span></div><div class="pv-ok">${icon('check')} No open PR adds a tracker or a new flow of personal data.</div></div>`;
    return `<div class="card pv-prs"><div class="card-h"><h3>Coming in open PRs</h3><span class="sub">not merged yet: stop it before it reaches users</span></div>
      ${p.prChanges.slice(0, 6).map((c) => `<div class="pv-pr"><div class="pv-pr-h">${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<a href="${esc(c.url)}" target="_blank" rel="noopener"><b>#${c.number}</b> ${esc(c.title)}</a><span class="pv-sev" style="background:${sevColor(c.severity)}">${sevLabel(c.severity)}</span></div>
        ${c.items.slice(0, 4).map((x) => `<div class="pv-pr-i">${icon(x.rule === 'new-recipient' ? 'plus' : 'alert')}<span>${esc(x.title)}</span><span class="mono muted">${esc(x.file)}</span></div>`).join('')}</div>`).join('')}</div>`;
  }

  function flowsList(p) {
    const kinds = Object.keys(KIND).filter((k) => p.flows.some((f) => f.kind === k));
    const list = p.flows.filter((f) => P.kind === 'all' || f.kind === P.kind);
    const tabs = [['all', 'All', p.flows.length], ...kinds.map((k) => [k, KIND[k][0], p.flows.filter((f) => f.kind === k).length])];
    return `<div class="card pv-flows" id="pvFlows"><div class="card-h"><h3>Data flows in the code</h3><span class="sub">every one links to the exact line on GitHub</span></div>
      <div class="pv-tabs">${tabs.map(([k, l, n]) => `<button class="${P.kind === k ? 'on' : ''}" data-pv-kind="${k}">${esc(l)} <em>${n}</em></button>`).join('')}</div>
      ${list.length ? list.slice(0, 40).map((f) => `<div class="pv-flow"><span class="pv-sevbar" style="background:${sevColor(f.severity)}"></span>
        <div class="pv-flow-m"><div class="pv-flow-t"><b>${esc(f.title)}</b><span class="pv-sevtag" style="color:${sevColor(f.severity)}">${sevLabel(f.severity)}</span></div>
          <a class="mono pv-loc" href="${esc(ghLine(f))}" target="_blank" rel="noopener">${esc(f.file)}${f.line ? `:${f.line}` : ''} ${icon('external')}</a>
          <code class="pv-code">${esc(f.snippet)}</code>
          <div class="pv-who"><span>${icon('users')} <b>Who can read it:</b> ${esc(f.who)}</span><span>${icon('check')} <b>Fix:</b> ${esc(f.fix)}</span></div></div></div>`).join('')
        : `<div class="pv-ok">${icon('check')} No risky flows of personal data found${P.kind === 'all' ? '' : ' in this category'}.</div>`}
      ${list.length > 40 ? `<div class="muted" style="padding:10px 16px">+ ${list.length - 40} more</div>` : ''}</div>`;
  }

  function inventory(p) {
    if (!p.inventory.length) return '';
    return `<div class="card pv-inv"><div class="card-h"><h3>Personal data this app handles</h3><span class="sub">files that touch each kind</span></div>
      <div class="pv-chips" style="padding:12px 16px 16px">${p.inventory.sort((a, b) => b.files - a.files).map((i) => `<span class="pv-invc ${['health', 'financial', 'credential', 'sensitive'].includes(i.kind) ? 'hot' : ''}">${esc(i.label)} <b>${i.files}</b></span>`).join('')}</div></div>`;
  }

  /** Narc's own receipt: every request it made for this analysis, and whether any code left. */
  function proof() {
    const e = P.egress;
    if (!e) return `<div class="card pv-proof"><div class="card-h"><h3>What Narc sent</h3></div><div class="pv-loading" style="padding:14px 16px"><i></i>Loading…</div></div>`;
    const by = {}; for (const c of e.calls) { const x = (by[c.who] ||= { who: c.who, why: c.why, n: 0, bytes: 0, local: c.local, ex: c.sent }); x.n++; x.bytes += c.bytes; if (!x.ex && c.sent) x.ex = c.sent; }
    const ai = by.OpenAI, rows = Object.values(by).sort((a, b) => b.n - a.n), cloudAi = !e.local && S.data.mode === 'ai';
    return `<div class="card pv-proof"><div class="card-h"><h3>What Narc sent</h3><span class="sub">every request it made for this report</span></div>
      <div class="pv-proof-hero ${ai || cloudAi ? 'warn' : 'ok'}">${ai ? `${icon('alert')} <span><b>${(ai.bytes / 1024).toFixed(0)} KB of code and PR text went to OpenAI.</b> Turn on <b>Local AI</b> in Settings and re-run: the analysis then runs on this laptop and no code leaves.</span>`
        : cloudAi ? `${icon('alert')} <span><b>No code left this laptop on this run</b>, because the AI answers came from cache. A fresh run with this setup sends code and PR text to OpenAI. Turn on <b>Local AI</b> in Settings so it never does.</span>`
        : `${icon('shield')} <span><b>0 bytes of your code left this laptop.</b> ${e.local ? `The AI ran on this laptop (${esc(S.data.model)}).` : ''} Only public repo data was read, and only public names (companies, packages, frameworks) were searched.</span>`}</div>
      ${rows.map((r) => `<div class="pv-eg"><b>${esc(r.who)}</b><span class="muted">${esc(r.why)}</span><span class="mono">${r.n}×${r.bytes ? ` · ${(r.bytes / 1024).toFixed(1)} KB` : ''}</span>${r.ex ? `<span class="pv-eg-ex mono">"${esc(r.ex.slice(0, 120))}"</span>` : ''}</div>`).join('')}</div>`;
  }

  /* ---------------------------------------------------------------- page */
  function paint() {
    if (S.page !== 'privacy') return;
    const el = $('#page-privacy');
    const p = pv();
    if (!p) { el.innerHTML = `<div class="wrap"><div class="page-head"><div><h1>Privacy</h1></div></div><div class="card"><div class="empty"><b>No privacy report for this analysis</b>Analyze a repo to see who receives its users' data.</div></div></div>`; return; }
    el.innerHTML = `<div class="wrap pv">
      <div class="page-head"><div><h1>Privacy debt</h1><p>Who receives this app's user data, what they get, and which open PRs would change that. Scanned from the source; nothing about it was sent anywhere.</p></div></div>
      ${hero(p)}
      <div class="pv-grid"><div>${telescreen(p)}${recipientPanel(p)}</div><div>${prWatch(p)}${inventory(p)}</div></div>
      ${flowsList(p)}
      ${proof()}
    </div>`;
  }
  function render(page) {
    if (page !== 'privacy') return;
    const p = pv();
    // Research the riskiest recipients up front so verdicts are on the map, not behind a click.
    if (p) p.recipients.slice(0, 4).forEach((r) => research(r.name));
    loadEgress();
    paint();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pv-rec],[data-pv-close],[data-pv-research],[data-pv-kind],[data-pv-go]');
    if (!t || S.page !== 'privacy') return;
    const d = t.dataset;
    if (d.pvRec) { P.sel = P.sel === d.pvRec ? null : d.pvRec; const r = pv().recipients.find((x) => x.id === d.pvRec); if (r && P.sel) research(r.name); paint(); }
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

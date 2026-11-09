/* Narc — landing page: the live Telescreen animation and the Hall of Shame (real scans from data/hall.json). */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GRADE = { A: '#22b322', B: '#5aa83a', C: '#e0a100', D: '#ec835a', F: '#e25555' };
  const CAT = { ads: '#e25555', replay: '#e25555', enrichment: '#e25555', analytics: '#ec835a', marketing: '#e0a100', ai: '#8b7cff', errors: '#3987e5', messaging: '#3987e5', payments: '#22b322', search: '#3987e5' };

  /* ---------------------------------------------------------------- Telescreen: user data streaming to trackers */
  const DATA = [['Email', 'M3 6h18v12H3z M3 6l9 7 9-7'], ['Location', 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
    ['Card', 'M3 6h18v12H3z M3 10h18 M7 15h4'], ['Health', 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'], ['Phone', 'M7 3h10v18H7z M11 18h2']];
  const TRACK = [['Meta Pixel', 'MP'], ['Google', 'G'], ['Segment', 'S'], ['OpenAI', 'AI'], ['Mixpanel', 'MX'], ['Hotjar', 'HJ']];
  const svg = $('#crtSvg');
  if (svg) {
    const W = 420, H = 300, ax = 210, ay = 150, dy = (i, n) => 40 + i * ((H - 80) / (n - 1));
    let html = '<defs><filter id="crtGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    DATA.forEach(([l, d], i) => { const y = dy(i, DATA.length); html += `<path d="M86,${y} Q150,${y} ${ax - 34},${ay}" class="crt-wire"/><g class="crt-node" transform="translate(18 ${y - 13})"><rect width="68" height="26" rx="13"/><g transform="translate(8 5) scale(.66)"><path d="${d}" class="crt-ico"/></g><text x="28" y="17">${l}</text></g>`; });
    TRACK.forEach(([l, s], i) => { const y = dy(i, TRACK.length); html += `<path d="M${ax + 34},${ay} Q270,${y} 318,${y}" class="crt-wire"/><g class="crt-node trk" id="crtT${i}" transform="translate(318 ${y - 13})"><rect width="92" height="26" rx="6"/><circle cx="13" cy="13" r="8" class="crt-av"/><text x="13" y="16.5" text-anchor="middle" class="crt-avt">${s}</text><text x="27" y="17">${l}</text></g>`; });
    html += `<circle cx="${ax}" cy="${ay}" r="34" class="crt-app"/><text x="${ax}" y="${ay - 2}" text-anchor="middle" class="crt-appt">your app</text><text x="${ax}" y="${ay + 12}" text-anchor="middle" class="crt-apps">users: 12,408</text><g id="crtPk"></g><text id="crtMsg" x="${W / 2}" y="${H - 6}" text-anchor="middle" class="crt-msg"></text>`;
    svg.innerHTML = html;
    const pk = $('#crtPk'), quad = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
    let count = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fire = () => {
      if (document.hidden || !document.body.contains(svg) || svg.closest('[hidden]')) return;
      const di = Math.floor(Math.random() * DATA.length), ti = Math.floor(Math.random() * TRACK.length), y1 = dy(di, DATA.length), y2 = dy(ti, TRACK.length);
      const a = [[86, y1], [150, y1], [ax - 34, ay]], b = [[ax + 34, ay], [270, y2], [318, y2]];
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', 3.2); c.setAttribute('class', 'crt-pk'); c.setAttribute('filter', 'url(#crtGlow)'); pk.appendChild(c);
      const t0 = performance.now(), dur = 1500;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), p = t < 0.5 ? quad(...a, t * 2) : quad(...b, (t - 0.5) * 2);
        c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
        if (t < 1) return requestAnimationFrame(step);
        c.remove(); count += 1 + Math.floor(Math.random() * 40);
        $('#crtCount').textContent = count.toLocaleString();
        const n = $(`#crtT${ti}`); n.classList.add('hit'); setTimeout(() => n.classList.remove('hit'), 450);
        $('#crtMsg').textContent = `${DATA[di][0].toLowerCase()} → ${TRACK[ti][0]}`;
      };
      requestAnimationFrame(step);
    };
    if (!reduce) setInterval(fire, 420); else $('#crtMsg').textContent = 'email → Segment';
    const clock = () => { const d = new Date(); $('#crtClock').textContent = d.toTimeString().slice(0, 8); };
    clock(); setInterval(clock, 1000);
  }

  /* ---------------------------------------------------------------- Orwell, 1984: a few of the book's short slogans, rotating */
  const QUOTES = ['"Big Brother is watching you."', '"Who controls the past controls the future."', '"War is peace. Freedom is slavery. Ignorance is strength."'];
  let qi = 0;
  const q = $('#orwellQ');
  if (q && !matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { q.style.opacity = 0; setTimeout(() => { qi = (qi + 1) % QUOTES.length; q.textContent = QUOTES[qi]; q.style.opacity = 1; }, 400); }, 5000);

  /* ---------------------------------------------------------------- Hall of Shame */
  const go = (repo) => { const i = $('#heroInput'); i.value = repo; $('#heroForm').requestSubmit(); };
  fetch('/api/hall').then((r) => r.json()).then((hall) => {
    if (!hall.length) return;
    $('#hallGrid').innerHTML = hall.map((h) => `<button class="hall-card" data-hall="${esc(h.repo)}" style="--g:${GRADE[h.grade]}">
      <div class="hall-top"><span class="hall-grade">${esc(h.grade)}</span><div><b>${esc(h.fullName || h.repo)}</b><span>${esc(h.verdict)} · ${h.score}/100</span></div></div>
      <p>${esc((h.description || '').slice(0, 90))}${(h.description || '').length > 90 ? '…' : ''}</p>
      <div class="hall-recs">${h.recipients.slice(0, 6).map((r) => `<span title="${esc(r.name)}" style="--c:${CAT[r.cat] || '#888'}">${esc(r.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>`).join('')}${h.recipients.length > 6 ? `<em>+${h.recipients.length - 6}</em>` : ''}<i>${h.recipients.length} ${h.recipients.length === 1 ? 'company' : 'companies'}</i></div>
      ${h.top ? `<div class="hall-ev">${esc(h.top)}</div>` : `<div class="hall-ev ok">No risky data flows found</div>`}</button>`).join('');
    $('#hall').hidden = false;
    document.querySelectorAll('[data-hall]').forEach((b) => b.addEventListener('click', () => go(b.dataset.hall)));
  }).catch(() => {});
})();

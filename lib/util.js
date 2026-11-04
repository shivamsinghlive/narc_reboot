export const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
export const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Saturating curve: grows ~linearly for small raw, approaches `max` asymptotically. */
export const sat = (raw, max, k = 40) => (raw >= 0 ? max * (1 - Math.exp(-raw / k)) : -Math.min(max, -raw) * 0.6);

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e.message || String(e) }; }
    }
  });
  await Promise.all(workers);
  return out;
}

export function percentileRanker(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (v) => {
    if (!sorted.length) return 0;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return lo / sorted.length;
  };
}

export const daysBetween = (a, b = Date.now()) => Math.max(0, (new Date(b) - new Date(a)) / 86400000);
export const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');
export const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});

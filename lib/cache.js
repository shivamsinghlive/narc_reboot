import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from './llm.js';

/** Disk cache for network lookups (OSV, threat intel, commit history). */
export async function cached(ns, key, ttlMs, fn) {
  const f = join(CACHE_DIR, ns, createHash('sha256').update(key).digest('hex') + '.json');
  try { const { t, v } = JSON.parse(await readFile(f, 'utf8')); if (Date.now() - t < ttlMs) return v; } catch {}
  const v = await fn();
  try { await mkdir(join(CACHE_DIR, ns), { recursive: true }); await writeFile(f, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}

export async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

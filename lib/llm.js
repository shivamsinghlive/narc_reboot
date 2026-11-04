import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.narc-cache');

/** Thin OpenAI Chat Completions client with JSON mode, retries and usage tracking. Works with any OpenAI-compatible base URL. */
export function makeLLM({ apiKey, model, fastModel, baseUrl, onEvent } = {}) {
  if (!apiKey) return null;
  const url = `${(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`;
  const usage = { calls: 0, cached: 0, prompt: 0, completion: 0, errors: 0, agents: {} };
  const agentStat = (a, m) => (usage.agents[a] ||= { model: m, calls: 0, cached: 0, ms: 0, prompt: 0, completion: 0, errors: 0, running: 0 });
  const effortOk = new Map();
  const supportsEffort = (m) => (effortOk.has(m) ? effortOk.get(m) : /^(gpt-5|o\d)/i.test(m));
  fastModel = fastModel || model;

  async function json(system, user, opts = {}) {
    const m = opts.fast ? fastModel : model;
    const agent = opts.agent || 'Assistant'; const st = agentStat(agent, m); st.model = m;
    const key = createHash('sha256').update(JSON.stringify([m, system, user])).digest('hex');
    const file = join(CACHE_DIR, 'llm', key.slice(0, 2), key + '.json');
    if (!opts.noCache) { try { const hit = JSON.parse(await readFile(file, 'utf8')); usage.cached++; st.cached++; onEvent?.({ agent, state: 'cached', model: m, ms: 0 }); return hit; } catch {} }
    const t0 = Date.now(); st.running++; onEvent?.({ agent, state: 'start', model: m });
    const p0 = usage.prompt, c0 = usage.completion;
    try {
      const out = await call(system, user, { ...opts, m });
      st.calls++; st.ms += Date.now() - t0; st.prompt += usage.prompt - p0; st.completion += usage.completion - c0;
      onEvent?.({ agent, state: 'done', model: m, ms: Date.now() - t0 });
      try { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(out)); } catch {}
      return out;
    } catch (e) { st.errors++; onEvent?.({ agent, state: 'error', model: m, error: e.message }); throw e; }
    finally { st.running--; }
  }

  async function call(system, user, { attempt = 0, effort = 'low', m = model } = {}) {
    const body = {
      model: m,
      messages: [
        { role: 'system', content: system + '\nAlways answer with a single valid JSON object and nothing else.' },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    };
    if (supportsEffort(m)) body.reasoning_effort = effort;
    usage.calls++;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
    if (!r.ok) {
      const t = await r.text();
      if (supportsEffort(m) && r.status === 400 && /reasoning_effort/i.test(t)) { if (effort === 'minimal' && /minimal/i.test(t)) return call(system, user, { attempt, effort: 'low', m }); effortOk.set(m, false); return call(system, user, { attempt, m }); }
      if ((r.status === 429 || r.status >= 500) && attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt + Math.random() * 500));
        return call(system, user, { attempt: attempt + 1, effort, m });
      }
      usage.errors++;
      const msg = t.match(/"message":\s*"([^"]+)"/)?.[1] || t.slice(0, 200);
      throw new Error(`OpenAI ${r.status}: ${msg}`);
    }
    const data = await r.json();
    usage.prompt += data.usage?.prompt_tokens || 0;
    usage.completion += data.usage?.completion_tokens || 0;
    const content = data.choices?.[0]?.message?.content || '{}';
    try { return JSON.parse(content); }
    catch { const m = content.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('Model returned invalid JSON'); }
  }
  return { model, fastModel, usage, json };
}

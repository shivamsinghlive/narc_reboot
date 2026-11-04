import { posix } from 'node:path';

const JS_RE = /(?:\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?|\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"\n]+)['"]/g;
const PY_FROM = /^[ \t]*from\s+(\.*[\w.]*)\s+import\s+\(?([\w*,\s]+)/gm;
const PY_IMP = /^[ \t]*import\s+([\w., \t]+)/gm;
const GO_BLOCK = /\bimport\s*\(([\s\S]*?)\)/g;
const GO_SINGLE = /\bimport\s+(?:[\w.]+\s+)?"([^"]+)"/g;
const JAVA_IMP = /^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*)?\s*;?\s*$/gm;
const JAVA_PKG = /^\s*package\s+([\w.]+)/m;
const CS_USING = /^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm;
const CS_NS = /^\s*namespace\s+([\w.]+)/m;
const PHP_USE = /^\s*use\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/gm;
const PHP_NS = /^\s*namespace\s+([\w\\]+)\s*;/m;
const RB_REQ = /^\s*require(_relative)?\s+['"]([^'"]+)['"]/gm;
const C_INC = /^\s*#\s*include\s+"([^"]+)"/gm;
const RS_USE = /^\s*(?:pub\s+)?use\s+crate::([\w:]+)/gm;
const RS_MOD = /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm;

const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];
const JS_LANG = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte']);

/** Raw import specifiers in a source text. */
export function extractImports(path, text, ext = path.split('.').pop()) {
  const out = [];
  const push = (spec, kind, extra) => spec && out.push({ spec, kind, ...extra });
  let m;
  if (JS_LANG.has(ext)) {
    JS_RE.lastIndex = 0;
    while ((m = JS_RE.exec(text))) push(m[1], 'js');
  } else if (ext === 'py' || ext === 'ipynb') {
    PY_FROM.lastIndex = 0; PY_IMP.lastIndex = 0;
    while ((m = PY_FROM.exec(text))) push(m[1], 'py-from', { names: m[2].split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean) });
    while ((m = PY_IMP.exec(text))) m[1].split(',').forEach((s) => push(s.trim().split(/\s+/)[0], 'py'));
  } else if (ext === 'go') {
    GO_BLOCK.lastIndex = 0; GO_SINGLE.lastIndex = 0;
    while ((m = GO_BLOCK.exec(text))) for (const q of m[1].matchAll(/"([^"]+)"/g)) push(q[1], 'go');
    while ((m = GO_SINGLE.exec(text))) push(m[1], 'go');
  } else if (ext === 'java' || ext === 'kt' || ext === 'kts' || ext === 'scala') {
    JAVA_IMP.lastIndex = 0;
    while ((m = JAVA_IMP.exec(text))) push(m[1], 'java', { wildcard: !!m[2] });
  } else if (ext === 'cs') {
    CS_USING.lastIndex = 0;
    while ((m = CS_USING.exec(text))) push(m[1], 'cs');
  } else if (ext === 'php') {
    PHP_USE.lastIndex = 0;
    while ((m = PHP_USE.exec(text))) push(m[1], 'php');
  } else if (ext === 'rb') {
    RB_REQ.lastIndex = 0;
    while ((m = RB_REQ.exec(text))) push(m[2], m[1] ? 'rb-rel' : 'rb');
  } else if (['c', 'cc', 'cpp', 'h', 'hpp', 'm', 'mm'].includes(ext)) {
    C_INC.lastIndex = 0;
    while ((m = C_INC.exec(text))) push(m[1], 'c');
  } else if (ext === 'rs') {
    RS_USE.lastIndex = 0; RS_MOD.lastIndex = 0;
    while ((m = RS_USE.exec(text))) push(m[1], 'rs-use');
    while ((m = RS_MOD.exec(text))) push(m[1], 'rs-mod');
  }
  return out;
}

const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

/** Build an index over all repo files and return a resolver: (fromPath, importRecord) => {to:[paths]} | {external:name}. */
export function buildResolver(files, manifests) {
  const paths = new Set(files.map((f) => f.path));
  const byDir = new Map();
  for (const p of paths) { const d = posix.dirname(p); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(p); }

  // JS workspace packages + alias roots
  const workspaces = new Map();
  for (const m of manifests) {
    if (!m.path.endsWith('package.json')) continue;
    try { const j = JSON.parse(m.text); if (j.name) workspaces.set(j.name, posix.dirname(m.path) === '.' ? '' : posix.dirname(m.path)); } catch {}
  }
  const aliasRoots = ['src', 'app', '', 'client/src', 'frontend/src', 'web/src'];

  // Python module index
  const pyIndex = new Map();
  for (const p of paths) {
    if (!p.endsWith('.py')) continue;
    const parts = p.slice(0, -3).split('/');
    if (parts.at(-1) === '__init__') parts.pop();
    for (let i = 0; i < parts.length; i++) { const k = parts.slice(i).join('.'); if (k && !pyIndex.has(k)) pyIndex.set(k, p); }
  }

  // Go modules
  const goMods = [];
  for (const m of manifests) {
    if (!m.path.endsWith('go.mod')) continue;
    const mm = m.text.match(/^module\s+(\S+)/m);
    if (mm) goMods.push({ mod: mm[1], dir: posix.dirname(m.path) === '.' ? '' : posix.dirname(m.path) });
  }

  // Java / C# / PHP: fully-qualified names from package/namespace declarations
  const fqIndex = new Map();
  const nsIndex = new Map();
  for (const f of files) {
    const base = posix.basename(f.path).replace(/\.\w+$/, '');
    let ns = null;
    if (['java', 'kt', 'kts', 'scala'].includes(f.ext)) ns = f.text.match(JAVA_PKG)?.[1];
    else if (f.ext === 'cs') ns = f.text.match(CS_NS)?.[1];
    else if (f.ext === 'php') ns = f.text.match(PHP_NS)?.[1]?.replace(/\\/g, '.');
    if (!ns) continue;
    fqIndex.set(`${ns}.${base}`, f.path);
    if (!nsIndex.has(ns)) nsIndex.set(ns, []);
    nsIndex.get(ns).push(f.path);
  }

  const byBase = new Map();
  for (const p of paths) { const b = posix.basename(p); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(p); }

  const tryJs = (base) => {
    base = posix.normalize(base).replace(/^\.\//, '');
    if (base.startsWith('../')) return null;
    if (paths.has(base)) return base;
    for (const e of JS_EXT) if (paths.has(base + e)) return base + e;
    for (const e of JS_EXT) if (paths.has(`${base}/index${e}`)) return `${base}/index${e}`;
    // TS ESM style "./x.js" that is really x.ts
    const noExt = base.replace(/\.(m|c)?js$/, '');
    if (noExt !== base) for (const e of JS_EXT) if (paths.has(noExt + e)) return noExt + e;
    return null;
  };

  return function resolve(from, imp) {
    const dir = posix.dirname(from) === '.' ? '' : posix.dirname(from);
    const { spec, kind } = imp;
    switch (kind) {
      case 'js': {
        if (spec.startsWith('.')) { const r = tryJs(posix.join(dir, spec)); return r ? { to: [r] } : {}; }
        if (/^[@~#]\//.test(spec)) { for (const root of aliasRoots) { const r = tryJs(posix.join(root, spec.slice(2))); if (r) return { to: [r] }; } return {}; }
        const pkg = pkgName(spec);
        if (workspaces.has(pkg)) {
          const wdir = workspaces.get(pkg); const rest = spec.slice(pkg.length).replace(/^\//, '');
          const r = rest ? tryJs(posix.join(wdir, 'src', rest)) || tryJs(posix.join(wdir, rest)) : tryJs(posix.join(wdir, 'src', 'index')) || tryJs(posix.join(wdir, 'index')) || tryJs(posix.join(wdir, 'src', 'main'));
          return r ? { to: [r] } : { external: pkg };
        }
        for (const root of ['src', '']) { const r = tryJs(posix.join(root, spec)); if (r && root !== '' ) return { to: [r] }; }
        if (spec.startsWith('node:')) return { external: spec };
        return { external: pkg };
      }
      case 'py':
      case 'py-from': {
        if (spec.startsWith('.')) {
          const dots = spec.match(/^\.+/)[0].length;
          let base = dir.split('/').filter(Boolean);
          base = base.slice(0, Math.max(0, base.length - (dots - 1)));
          const rest = spec.slice(dots).split('.').filter(Boolean);
          const target = [...base, ...rest].join('/');
          const cands = [];
          for (const n of imp.names || []) cands.push(`${target}/${n}.py`, `${target}/${n}/__init__.py`);
          cands.push(`${target}.py`, `${target}/__init__.py`);
          const hits = cands.filter((c) => paths.has(c));
          return hits.length ? { to: [hits[0]] } : {};
        }
        const tries = [];
        if (kind === 'py-from') for (const n of imp.names || []) tries.push(`${spec}.${n}`);
        const parts = spec.split('.');
        for (let i = parts.length; i > 0; i--) tries.push(parts.slice(0, i).join('.'));
        for (const t of tries) if (pyIndex.has(t)) return { to: [pyIndex.get(t)] };
        return { external: parts[0] };
      }
      case 'go': {
        for (const g of goMods) {
          if (spec === g.mod || spec.startsWith(g.mod + '/')) {
            const d = posix.join(g.dir, spec.slice(g.mod.length).replace(/^\//, ''));
            const fs = (byDir.get(d) || []).filter((p) => p.endsWith('.go') && !p.endsWith('_test.go')).slice(0, 4);
            return fs.length ? { to: fs } : {};
          }
        }
        return { external: spec.split('/').slice(0, 3).join('/') };
      }
      case 'java':
      case 'cs':
      case 'php': {
        const s = spec.replace(/\\/g, '.');
        if (fqIndex.has(s)) return { to: [fqIndex.get(s)] };
        if (nsIndex.has(s)) return { to: nsIndex.get(s).slice(0, 4) };
        const parent = s.split('.').slice(0, -1).join('.');
        if (imp.wildcard && nsIndex.has(s)) return { to: nsIndex.get(s).slice(0, 4) };
        if (fqIndex.has(parent)) return { to: [fqIndex.get(parent)] };
        return { external: s.split('.').slice(0, 2).join('.') };
      }
      case 'rb-rel': {
        const t = posix.join(dir, spec.endsWith('.rb') ? spec : spec + '.rb');
        return paths.has(t) ? { to: [t] } : {};
      }
      case 'rb': {
        for (const root of ['lib', 'app', '']) { const t = posix.join(root, spec + '.rb'); if (paths.has(t)) return { to: [t] }; }
        return { external: spec.split('/')[0] };
      }
      case 'c': {
        const t = posix.join(dir, spec);
        if (paths.has(t)) return { to: [t] };
        const c = byBase.get(posix.basename(spec));
        return c?.length ? { to: [c[0]] } : {};
      }
      case 'rs-use':
      case 'rs-mod': {
        const idx = from.lastIndexOf('src/');
        const root = idx >= 0 ? from.slice(0, idx + 4) : '';
        const segs = kind === 'rs-mod' ? [...posix.relative(root, dir).split('/').filter(Boolean), spec] : spec.split('::');
        for (let i = segs.length; i > 0; i--) {
          const b = posix.join(root, ...segs.slice(0, i));
          for (const c of [`${b}.rs`, `${b}/mod.rs`]) if (paths.has(c)) return { to: [c] };
        }
        return {};
      }
      default: return {};
    }
  };
}

const AI_LIBS = /^(openai|anthropic|@anthropic-ai|langchain|@langchain|langgraph|llama_index|llamaindex|llama-index|transformers|torch|torchvision|tensorflow|keras|sklearn|scikit-learn|huggingface_hub|@huggingface|sentence_transformers|pinecone|@pinecone-database|chromadb|weaviate|qdrant_client|@qdrant|faiss|ollama|cohere|cohere-ai|vertexai|google\.generativeai|@google\/generative-ai|@google\/genai|google-genai|ai|@ai-sdk|mistralai|@mistralai|litellm|xgboost|lightgbm|onnx|onnxruntime|jax|flax|spacy|nltk|gensim|dspy|guidance|instructor|groq|replicate|tiktoken|vllm|mlflow|wandb|crewai|autogen|semantic_kernel|haystack|pgvector|github\.com\/sashabaranov\/go-openai|github\.com\/openai\/openai-go|github\.com\/tmc\/langchaingo|com\.openai|dev\.langchain4j)$/i;
export const isAiLib = (name) => AI_LIBS.test(name);

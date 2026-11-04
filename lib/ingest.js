import { gunzipSync } from 'node:zlib';

/** Minimal tar reader (ustar + pax + GNU long names). */
function* untar(buf) {
  let off = 0, paxPath = null, longName = null;
  const str = (b, s, l) => { const sub = b.subarray(s, s + l); const z = sub.indexOf(0); return sub.subarray(0, z === -1 ? sub.length : z).toString('utf8'); };
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h[0] === 0 && h[1] === 0) break;
    const name = str(h, 0, 100);
    const size = parseInt(str(h, 124, 12).trim() || '0', 8) || 0;
    const type = h[156] === 0 ? '0' : String.fromCharCode(h[156]);
    const magic = str(h, 257, 6);
    const prefix = magic.startsWith('ustar') ? str(h, 345, 155) : '';
    off += 512;
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const txt = data.toString('utf8');
      const m = txt.match(/\d+ path=([^\n]*)\n/);
      paxPath = m ? m[1] : null;
      continue;
    }
    if (type === 'g') continue;
    if (type === 'L') { longName = str(data, 0, data.length); continue; }
    const path = paxPath || longName || (prefix ? `${prefix}/${name}` : name);
    paxPath = longName = null;
    if (type === '0' || type === '7') yield { path, data };
  }
}

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|target|\.next|\.nuxt|\.svelte-kit|coverage|__pycache__|\.venv|venv|\.git|bower_components|third_party|\.idea|\.vscode|\.turbo|\.cache|site-packages|Pods|DerivedData|\.gradle|\.pytest_cache|\.mypy_cache|storybook-static|generated|__generated__|examples?|samples?|benchmarks?|bench)\//i;
const SKIP_FILE = /(\.min\.(js|css)|\.map|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock|\.snap|\.pb\.go|_pb2\.py|\.d\.ts)$/i;
const CODE_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte', 'py', 'go', 'java', 'kt', 'kts', 'rb', 'php', 'cs', 'rs', 'swift', 'scala', 'c', 'cc', 'cpp', 'h', 'hpp', 'm', 'mm', 'dart', 'ex', 'exs', 'lua', 'r', 'jl', 'sh', 'bash', 'ipynb']);
const AUX_EXT = new Set(['sql', 'css', 'scss', 'sass', 'less', 'html', 'tf', 'hcl', 'yaml', 'yml', 'toml', 'gradle', 'proto', 'graphql', 'gql', 'prisma', 'ini', 'cfg']);
const MANIFESTS = /(^|\/)(package\.json|requirements[\w.-]*\.txt|pyproject\.toml|setup\.py|setup\.cfg|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|tsconfig[\w.-]*\.json)$/;
const NOEXT_KEEP = /(^|\/)(Dockerfile[\w.-]*|Makefile|Procfile|Jenkinsfile|Vagrantfile|Rakefile|Gemfile|\.env\.example)$/;
const DESIGN_DOC = /((^|\/)(docs?|adrs?|rfcs?|design|architecture|decisions|proposals?)\/.*\.(md|mdx|rst|txt)$)|((^|\/)[^/]*(design|architecture|adr|rfc|roadmap|todo|plan|spec)[^/]*\.(md|mdx|rst)$)/i;

const SENSITIVE = /(^|\/)(\.env(\.[\w-]+)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)|credentials\.json|service[-_]account[\w-]*\.json|secrets?\.(ya?ml|json|toml)|\.npmrc|\.pypirc|\.netrc|\.htpasswd)$/i;
const MAX_FILES = 9000;
const MAX_FILE_BYTES = 400 * 1024;

export function ingestTarball(gz) {
  const buf = gunzipSync(gz, { maxOutputLength: 900 * 1024 * 1024 });
  const files = [], docs = [], manifests = [], sensitive = [];
  let total = 0, skipped = 0;
  for (const { path: full, data } of untar(buf)) {
    const path = full.split('/').slice(1).join('/');
    if (!path) continue;
    total++;
    if (SENSITIVE.test(path) && !/\.(example|sample|template|dist|tpl)$|example|sample|test|fixture|mock/i.test(path)) sensitive.push(path);
    if (SKIP_DIR.test(path) || SKIP_FILE.test(path) || data.length > MAX_FILE_BYTES) { skipped++; continue; }
    const base = path.split('/').pop();
    const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
    const isManifest = MANIFESTS.test(path);
    const isDoc = DESIGN_DOC.test(path) || /^readme\.(md|rst)$/i.test(base) && !path.includes('/');
    if (!CODE_EXT.has(ext) && !AUX_EXT.has(ext) && !isManifest && !NOEXT_KEEP.test(path) && !isDoc) { skipped++; continue; }
    if (data.subarray(0, 4000).includes(0)) { skipped++; continue; }
    let text = data.toString('utf8');
    if (ext === 'ipynb') {
      try { text = JSON.parse(text).cells.filter((c) => c.cell_type === 'code').map((c) => [].concat(c.source).join('')).join('\n\n'); } catch { text = ''; }
    }
    if (isManifest) manifests.push({ path, text });
    if (isDoc && ['md', 'mdx', 'rst', 'txt'].includes(ext)) { docs.push({ path, text }); continue; }
    if (ext === 'json' && !/package\.json$|tsconfig/.test(base)) { skipped++; continue; }
    if (files.length >= MAX_FILES) { skipped++; continue; }
    files.push({ path, ext, text, isCode: CODE_EXT.has(ext), size: data.length });
  }
  return { files, docs, manifests, sensitive, total, skipped };
}

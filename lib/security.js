import { createHash } from 'node:crypto';
import { technique } from './mitre.js';
import { LAYER_BY_ID, DIRECTED } from './layers.js';
import { cached, fetchJson } from './cache.js';
import { pool, clamp, sat, round, truncate } from './util.js';

/* =========================================================================
   Static security rules — each finding is mapped to CWE + MITRE ATT&CK/ATLAS
   ========================================================================= */
const USER_INPUT = /\b(req|request)\.(query|body|params|args|form|json|GET|POST|values|files|cookies|headers)\b|\$_(GET|POST|REQUEST)\b|\bctx\.(query|request\.body|params)\b|searchParams\.get\(|\bparams\[/;
const CODE = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|py|go|java|kt|rb|php|cs|rs|scala|ipynb)$/;
const PY = /\.(py|ipynb)$/, JS = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/;
const DOCKER = /(^|\/)Dockerfile[\w.-]*$|\.dockerfile$/i;
const WORKFLOW = /(^|\/)\.github\/workflows\/.+\.ya?ml$/;
const SHELLISH = /(Dockerfile[\w.-]*|\.sh|\.bash|\.ya?ml|Makefile)$/i;

const R = (id, o) => ({ id, ...o });
export const RULES = [
  R('secret-token', { title: 'Hard-coded credential', category: 'Secrets', severity: 5, cwe: 'CWE-798', attack: ['T1552.001'], kw: /AKIA|gh[pousr]_|github_pat_|sk-|xox[bapr]-|AIza|BEGIN [A-Z ]*PRIVATE KEY|sk_live_/, re: /(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-(proj-|ant-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9a-zA-Z]{20,}|-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)/, not: /(x{6,}|example|placeholder|your[-_])/i, secret: true, tests: true, fix: 'Revoke and rotate the credential, load it from a secret manager, and purge it from git history.' }),
  R('secret-assign', { title: 'Secret assigned in source', category: 'Secrets', severity: 4, cwe: 'CWE-798', attack: ['T1552.001'], kw: /secret|passw|token|api_?key|apikey|private_?key/i, re: /(api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|passw(or)?d|auth[_-]?token|access[_-]?token|private[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{10,}["']/i, not: /(example|sample|dummy|placeholder|changeme|change[_-]me|your[_-]|xxx|<[^>]+>|\$\{|process\.env|os\.environ|getenv|import\.meta\.env|test|fake|mock|redacted|\*{4})/i, secret: true, fix: 'Read it from the environment or a secret manager; rotate it if it was ever real.' }),
  R('sql-injection', { title: 'SQL built from strings', category: 'Injection', severity: 4, cwe: 'CWE-89', attack: ['T1190', 'T1565.001'], kw: /select|insert|update|delete|where|queryRawUnsafe|executeRawUnsafe/i, re: /((execute|executemany|raw|text|query|Query|Exec|QueryRow)\s*\(\s*(f["']|["'`][^"'`]*\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b[^"'`]*["'`]\s*(%|\+|\.format)|`[^`]*\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b[^`]*\$\{|fmt\.Sprintf\()|\$(queryRaw|executeRaw)Unsafe\s*\()/i, fix: 'Use parameterised queries / the ORM query builder; never interpolate input into SQL.' }),
  R('nosql-injection', { title: 'NoSQL query from raw input', category: 'Injection', severity: 3, cwe: 'CWE-943', attack: ['T1190'], kw: /\$where|find/, re: /\$where|\.(find|findOne|update\w*|delete\w*)\(\s*(req|request)\.(body|query|params)/, fix: 'Validate and whitelist query fields (e.g. zod/pydantic) before passing them to the database.' }),
  R('command-injection', { title: 'Shell command from dynamic input', category: 'Injection', severity: 4, cwe: 'CWE-78', attack: ['T1059'], kw: /os\.system|shell\s*=\s*True|popen|exec\(|execSync|spawn|exec\.Command/, re: /(os\.system\(|os\.popen\(|subprocess\.\w+\([^)]*shell\s*=\s*True|\bexec(Sync)?\(\s*(`[^`]*\$\{|["'][^"']*["']\s*\+|\w+\s*\+)|spawn\([^)]*shell\s*:\s*true|exec\.Command\(\s*"(sh|bash)"\s*,\s*"-c")/, fix: 'Pass arguments as an array without a shell, and validate input against an allow-list.' }),
  R('code-eval', { title: 'Dynamic code execution', category: 'Injection', severity: 4, cwe: 'CWE-95', attack: ['T1059'], kw: /eval\(|new Function|exec\(/, re: /(^|[^.\w])eval\s*\(|new Function\s*\(|^\s*exec\s*\(|[=:(,]\s*exec\s*\(/, ext: /\.(js|jsx|ts|tsx|mjs|cjs|py|php|rb)$/, pyOnlyExec: true, not: /^\s*(\/\/|#|\*)|\.exec\(|re\.exec|regex|RegExp|db\.exec|cursor|\bexec\(\s*['"`]?\s*(SELECT|INSERT|CREATE|UPDATE|DELETE)/i, fix: 'Remove eval/exec; parse data with a safe parser instead of executing it.' }),
  R('deserialization', { title: 'Unsafe deserialization', category: 'Injection', severity: 4, cwe: 'CWE-502', attack: ['T1203', 'T1059'], kw: /pickle|yaml\.load|marshal|unserialize|ObjectInputStream|jsonpickle/, re: /(pickle\.loads?\(|cPickle\.loads?\(|yaml\.load\((?![^)]*Safe)|marshal\.loads\(|jsonpickle\.decode\(|\bunserialize\(|new ObjectInputStream\()/, fix: 'Use safe formats (JSON) or yaml.safe_load; never deserialize untrusted bytes.' }),
  R('xss', { title: 'Raw HTML rendering', category: 'XSS', severity: 3, cwe: 'CWE-79', attack: ['T1189'], kw: /innerHTML|dangerouslySetInnerHTML|document\.write|v-html|safe|bypassSecurityTrust|outerHTML/, re: /(dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\(|v-html=|\|\s*safe\b|mark_safe\(|bypassSecurityTrust\w+\(|Markup\()/, fix: 'Render text, or sanitise with DOMPurify/bleach before injecting HTML.' }),
  R('ssrf', { title: 'Outbound request to user-controlled URL', category: 'Injection', severity: 4, cwe: 'CWE-918', attack: ['T1190', 'T1210'], kw: /fetch|axios|requests\.|httpx|urlopen|http\.Get|got\(/, re: /(\bfetch|axios(\.\w+)?|\bgot|requests\.(get|post|put|request)|httpx\.(get|post|request)|urlopen|http\.Get)\s*\(/, and: USER_INPUT, fix: 'Allow-list destination hosts, block private IP ranges, and never fetch raw user URLs.' }),
  R('path-traversal', { title: 'File path from user input', category: 'Access control', severity: 4, cwe: 'CWE-22', attack: ['T1083', 'T1005'], kw: /open|readFile|createReadStream|sendFile|send_file|send_from_directory|FileResponse|path\.join/, re: /(\bopen|readFile(Sync)?|createReadStream|sendFile|send_file|send_from_directory|FileResponse|path\.join|os\.path\.join)\s*\(/, and: USER_INPUT, fix: 'Resolve the path, check it stays inside an allowed base directory, and reject "..".' }),
  R('open-redirect', { title: 'Redirect to user-controlled URL', category: 'Access control', severity: 2, cwe: 'CWE-601', attack: ['T1204.001'], kw: /redirect/i, re: /(redirect|RedirectResponse|HttpResponseRedirect)\s*\(/, and: USER_INPUT, fix: 'Only redirect to relative paths or an allow-list of hosts.' }),
  R('tls-disabled', { title: 'TLS verification disabled', category: 'Crypto', severity: 3, cwe: 'CWE-295', attack: ['T1557'], kw: /verify|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|InsecureSkipVerify|CERT_NONE|check_hostname/, re: /(verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"]?0|InsecureSkipVerify\s*:\s*true|CERT_NONE|check_hostname\s*=\s*False)/, fix: 'Keep certificate verification on; pin a custom CA bundle if needed.' }),
  R('jwt-weak', { title: 'JWT verification weakened', category: 'Access control', severity: 4, cwe: 'CWE-347', attack: ['T1550.001'], kw: /jwt|JWT/, re: /(verify_signature["']?\s*:\s*False|algorithms\s*=\s*\[?\s*["']none|ignoreExpiration\s*:\s*true|alg["']?\s*:\s*["']none|jwt\.decode\([^)]*verify\s*=\s*False)/i, fix: 'Always verify signature and expiry with an explicit algorithm allow-list.' }),
  R('weak-hash', { title: 'Weak hash for secrets', category: 'Crypto', severity: 3, cwe: 'CWE-327', attack: ['T1110.002'], kw: /md5|sha1|MD5|SHA-?1/, re: /(hashlib\.(md5|sha1)\(|createHash\(\s*['"](md5|sha1)['"]|MessageDigest\.getInstance\(\s*"(MD5|SHA-?1)"|\bmd5\(|\bsha1\()/i, and: /pass|pwd|secret|token|sign|auth/i, fix: 'Use bcrypt/argon2 for passwords and SHA-256+ (HMAC) for integrity.' }),
  R('weak-random', { title: 'Predictable randomness for secrets', category: 'Crypto', severity: 3, cwe: 'CWE-338', attack: ['T1110.002'], kw: /Math\.random|random\./, re: /(Math\.random\(\)|random\.(random|randint|choice|choices)\()/, and: /token|secret|password|nonce|otp|session|salt|api[_-]?key|reset/i, fix: 'Use crypto.randomBytes / secrets.token_urlsafe for anything security-sensitive.' }),
  R('cors-wildcard', { title: 'CORS allows any origin', category: 'Config', severity: 2, cwe: 'CWE-942', attack: ['T1189'], kw: /Origin|origin|CORS|cors/, re: /(Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*|origin\s*:\s*(['"]\*['"]|true)\b|allow_origins\s*=\s*\[\s*["']\*|AllowAllOrigins\s*:\s*true|\bcors\(\s*\)|CORS\(\s*\w+\s*\)\s*$)/, fix: 'Restrict allowed origins to known front-end hosts, especially with credentials.' }),
  R('debug-on', { title: 'Debug mode enabled', category: 'Config', severity: 3, cwe: 'CWE-489', attack: ['T1082'], kw: /DEBUG|debug/, re: /(^\s*DEBUG\s*=\s*True\b|app\.run\([^)]*debug\s*=\s*True|FLASK_DEBUG\s*[=:]\s*['"]?1|devtool\s*:\s*['"]eval)/, fix: 'Drive debug flags from the environment and default them to off.' }),
  R('log-secret', { title: 'Secret written to logs', category: 'Data exposure', severity: 2, cwe: 'CWE-532', attack: ['T1552.001'], kw: /password|passwd|secret|token|api_?key|authorization/i, re: /(console\.(log|info|debug|warn)|logger\.\w+|logging\.\w+|\bprint|fmt\.Print\w*|log\.Print\w*)\s*\(.*\b(password|passwd|secret|token|api[_-]?key|authorization)\b/i, not: /redact|mask|\*\*\*|length|len\(|missing|invalid|expired|not set|required/i, fix: 'Redact credentials before logging; log identifiers, not secrets.' }),
  R('world-writable', { title: 'World-writable permissions', category: 'Config', severity: 2, cwe: 'CWE-732', attack: ['T1222'], kw: /777/, re: /(chmod\([^)]*0?o?777|chmod\s+(-R\s+)?777|0o777)/, fix: 'Grant the minimum permissions needed (e.g. 0640/0750).' }),
  R('docker-unpinned', { title: 'Container base image not pinned', category: 'Supply chain', severity: 2, cwe: 'CWE-1357', attack: ['T1195.002'], ext: DOCKER, kw: /FROM/i, re: /^\s*FROM\s+(?!scratch\b)([^\s:@]+)(:latest)?(\s+AS\s+\w+)?\s*$/i, fix: 'Pin base images to a version tag and ideally a digest (@sha256:…).' }),
  R('curl-pipe-sh', { title: 'Remote script piped to shell', category: 'Supply chain', severity: 3, cwe: 'CWE-494', attack: ['T1195.002', 'T1059'], ext: SHELLISH, kw: /curl|wget/, re: /(curl|wget)[^|#]*\|\s*(sudo\s+)?(ba)?sh\b/, fix: 'Download, verify a checksum or signature, then execute.' }),
  R('gha-pr-target', { title: 'Workflow runs on pull_request_target', category: 'Supply chain', severity: 3, cwe: 'CWE-829', attack: ['T1195.002'], ext: WORKFLOW, kw: /pull_request_target/, re: /pull_request_target/, fix: 'Avoid checking out PR code with write tokens; use pull_request or split privileged steps.' }),
  R('gha-injection', { title: 'Untrusted input in workflow script', category: 'Supply chain', severity: 4, cwe: 'CWE-94', attack: ['T1059', 'T1195.002'], ext: WORKFLOW, kw: /github\.event/, re: /\$\{\{\s*github\.event\.(issue|pull_request|comment|review|head_commit|discussion)\.[\w.]*(title|body|message|name|ref|label|head_ref)/, fix: 'Pass event data through env vars and quote them; never inline ${{ }} into run:.' }),
  R('gha-unpinned', { title: 'Third-party action not pinned to a SHA', category: 'Supply chain', severity: 1, cwe: 'CWE-829', attack: ['T1195.002'], ext: WORKFLOW, kw: /uses:/, re: /uses:\s*(?!actions\/|github\/|\.\/)[\w.-]+\/[\w./-]+@(main|master|v?\d+(\.\d+)*)\s*$/, perFile: 1, fix: 'Pin actions to a full commit SHA and let Dependabot update them.' }),
  // AI / LLM specific (MITRE ATLAS)
  R('llm-prompt-injection', { title: 'User input concatenated into a prompt', category: 'AI / LLM', severity: 3, cwe: 'CWE-1427', attack: ['AML.T0051'], ai: true, kw: /prompt|system|messages|content|instruction|You are/i, re: /((prompt|system|instruction|template|content)\w*\s*[:=+]|f["'][^"']*(prompt|you are)|`[^`]*(you are|instructions?:))/i, and: /(\$\{|\{)[^}]*(user|input|query|question|message|text|req\.|request\.|body)|\+\s*(user|input|query|question|message)\w*/i, fix: 'Separate system and user content, delimit untrusted text, and validate model output before acting on it.' }),
  R('llm-output-exec', { title: 'Model output executed or run as code', category: 'AI / LLM', severity: 5, cwe: 'CWE-94', attack: ['AML.T0053', 'T1059'], ai: true, kw: /eval|exec|subprocess|system|Function|child_process/, re: /(eval|exec|subprocess\.\w+|os\.system|execSync|child_process\.\w+|new Function)\s*\(.*(completion|response|output|choices|content|tool_call|arguments|generated|llm|model)/i, fix: 'Never execute model output; parse it into a strict schema and dispatch to allow-listed functions.' }),
  R('llm-tools', { title: 'LLM can call tools / functions', category: 'AI / LLM', severity: 2, cwe: 'CWE-862', attack: ['AML.T0053'], ai: true, kw: /tools|@tool|function_call|tool_choice|bind_tools|StructuredTool|createReactAgent|AgentExecutor|tool\(/, re: /(\btools\s*[:=]\s*\[|@tool\b|function_call|tool_choice|bind_tools\(|StructuredTool|createReactAgent|AgentExecutor|\btool\(\s*\{)/, perFile: 1, fix: 'Authorise every tool call server-side, cap side effects, and log tool invocations with the model trace.' }),
];

const fp = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
const redact = (s) => s.replace(/(["'`])([^"'`]{4})[^"'`]{4,}([^"'`]{2})\1/g, '$1$2••••••$3$1').replace(/(AKIA|gh[pousr]_|sk-|xox[bp]-|AIza|sk_live_)[A-Za-z0-9_-]{6,}/g, '$1••••••');

/** Scan one text (a file, or the added lines of a PR diff). */
export function scanText(path, text, { layer, isAi = false, isTest = false, lineOffset = 0 } = {}) {
  const out = [];
  if (!text) return out;
  const lines = text.split('\n');
  for (const r of RULES) {
    if (r.ext ? !r.ext.test(path) : !CODE.test(path) && !(r.secret && /\.(ya?ml|json|toml|env|ini|cfg|tf|sh)$|Dockerfile/i.test(path))) continue;
    if (r.ai && !isAi) continue;
    if (r.pyOnlyExec && !PY.test(path) && !/eval\s*\(|new Function/.test(text)) continue;
    if (isTest && !r.tests) continue;
    if (r.kw && !r.kw.test(text)) continue;
    let hits = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.length > 600 || !r.re.test(l)) continue;
      if (r.and && !r.and.test(l)) continue;
      if (r.not && r.not.test(l)) continue;
      if (r.pyOnlyExec && !PY.test(path) && !/(^|[^.\w])eval\s*\(|new Function/.test(l)) continue;
      hits++;
      if (hits > (r.perFile || 3)) continue;
      const snippet = truncate((r.secret ? redact(l) : l).trim(), 180);
      out.push({ rule: r.id, title: r.title, category: r.category, severity: isTest ? Math.max(1, r.severity - 2) : r.severity, cwe: r.cwe, attack: r.attack, file: path, line: i + 1 + lineOffset, snippet, layer, fix: r.fix, fp: fp(r.id, path, l.trim().slice(0, 120)) });
    }
    if (hits > (r.perFile || 3)) out.at(-1).more = hits - (r.perFile || 3);
  }
  return out;
}

export function scanRepo(files, sensitive) {
  const findings = [];
  for (const f of files) {
    if (f.size > 250 * 1024) continue;
    const isAi = f.layer === 'ai' || /openai|anthropic|langchain|llama|genai|ai-sdk|\bai\b/i.test(f.externals.join(' '));
    findings.push(...scanText(f.path, f.text, { layer: f.layer, isAi, isTest: f.layer === 'tests' }));
  }
  for (const p of sensitive) {
    const key = /\.(pem|key|p12|pfx)$|id_(rsa|ed25519|ecdsa)$/.test(p);
    findings.push({ rule: 'sensitive-file', title: key ? 'Private key file committed' : 'Secrets file committed', category: 'Secrets', severity: 5, cwe: 'CWE-538', attack: [key ? 'T1552.004' : 'T1552.001'], file: p, line: null, snippet: 'File is tracked in the repository', layer: 'config', fix: 'Remove it from the repo and history (git filter-repo), rotate everything inside, add it to .gitignore.', fp: fp('sensitive', p) });
  }
  return findings.sort((a, b) => b.severity - a.severity);
}

/* =========================================================================
   Attack surface — where an attacker can probe
   ========================================================================= */
const ROUTE_RES = [
  { re: /\b(app|router|server|api|fastify|r|route|routes|v1|hono)\.(get|post|put|patch|delete|all|use)\(\s*['"`](\/[^'"`]*)['"`]/g, m: 2, p: 3 },
  { re: /@(app|router|bp|blueprint|api|api_router|\w+_router)\.(get|post|put|patch|delete|route|websocket)\(\s*['"]([^'"]*)['"]/g, m: 2, p: 3 },
  { re: /\b(path|re_path|url)\(\s*r?['"]\^?([^'"]*)['"]\s*,/g, m: null, p: 2, only: /urls\.py$/ },
  { re: /\.(HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE|Any)\(\s*"(\/[^"]*)"/g, m: 1, p: 2, only: /\.go$/ },
  { re: /@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(value\s*=\s*)?"([^"]*)"/g, m: 1, p: 3 },
  { re: /\b(get|post|put|patch|delete)\s+['"](\/[^'"]*)['"]/g, m: 1, p: 2, only: /routes\.rb$/ },
];
const AUTH_HINT = /(isLoggedIn|loggedIn|ensureAuth\w*|requireLogin|checkAuth|isAdmin|requireRole|auth|authenticate|authorize|login_required|requireAuth|requireUser|isAuthenticated|ensureLoggedIn|passport\.|jwt|verifyToken|bearer|Depends\(\s*(get_current|current_user|verify|auth)|@UseGuards|@PreAuthorize|@Secured|getServerSession|currentUser|clerk|withAuth|protect|session\[|permission_classes|IsAuthenticated|api_key|apiKey)/i;
const SENSITIVE_PATH = /(admin|delete|remove|upload|exec|run|eval|shell|webhook|token|password|reset|payment|charge|refund|transfer|export|import|debug|internal|config|secret|key|user)/i;

export function attackSurface(files) {
  const endpoints = [];
  for (const f of files) {
    if (!f.isCode || f.layer === 'tests') continue;
    const t = f.text;
    // Next.js / file-system routes
    const nx = f.path.match(/(?:^|\/)(?:src\/)?(?:app|pages)\/(api\/.*?|.*?)\/?(?:route|index)?\.(ts|js|tsx|jsx)$/);
    if (nx && (/\/route\.(ts|js)$/.test(f.path) || /\/pages\/api\//.test(f.path))) {
      const methods = [...t.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      const p = '/' + nx[1].replace(/\/(route|index)$/, '').replace(/\[(\.\.\.)?(\w+)\]/g, ':$2');
      for (const m of methods.length ? methods : ['ANY']) endpoints.push(mkEp(f, m, p, 1, t));
    }
    if (!/(get|post|put|patch|delete|route|Mapping|HandleFunc|path\()/i.test(t)) continue;
    const lines = t.split('\n');
    for (const R of ROUTE_RES) {
      if (R.only && !R.only.test(f.path)) continue;
      R.re.lastIndex = 0; let m;
      while ((m = R.re.exec(t)) && endpoints.length < 600) {
        const line = t.slice(0, m.index).split('\n').length;
        const method = (R.m ? m[R.m] : 'ANY').toUpperCase().replace('ROUTE', 'ANY').replace('USE', 'MIDDLEWARE').replace('HANDLEFUNC', 'ANY').replace('HANDLE', 'ANY').replace('REQUEST', 'ANY');
        if (method === 'MIDDLEWARE') continue;
        const ctx = lines.slice(Math.max(0, line - 4), line + 3).join('\n');
        endpoints.push(mkEp(f, method, m[R.p] || '/', line, ctx));
      }
    }
  }
  // File-wide auth hint (e.g. router.use(auth)) upgrades "none" to "file-level"
  const fileAuth = new Map(files.map((f) => [f.path, /\.use\(\s*\w*(auth|jwt|passport|protect|session)/i.test(f.text) || /dependencies\s*=\s*\[\s*Depends\(/.test(f.text)]));
  for (const e of endpoints) if (e.auth === 'none' && fileAuth.get(e.file)) e.auth = 'file-level';
  const seen = new Set();
  return endpoints.filter((e) => { const k = `${e.method} ${e.path} ${e.file}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 400);
}
function mkEp(f, method, path, line, ctx) {
  const sensitive = SENSITIVE_PATH.test(path) || /DELETE|PUT|PATCH/.test(method);
  return { method, path, file: f.path, line, layer: f.layer, auth: AUTH_HINT.test(ctx) ? 'likely' : 'none', sensitive, webhook: /webhook|callback|hook/i.test(path) };
}

/* =========================================================================
   Dependencies → known vulnerabilities (OSV.dev, free, no key)
   ========================================================================= */
const ver = (s) => String(s || '').match(/\d+(\.\d+){1,3}(-[\w.]+)?/)?.[0] || null;
export function parseDependencies(manifests) {
  const deps = [];
  const add = (name, spec, ecosystem, manifest, dev = false) => {
    if (!name || /^(file|link|workspace|git|github|http)[:+]/.test(String(spec))) return;
    const v = ver(spec);
    deps.push({ name, spec: String(spec || '*'), version: v, ecosystem, manifest, dev, unpinned: !v || /^\s*(\*|latest|>=?[^,<]*$|)$/.test(String(spec || '')) && !/==/.test(String(spec)) });
  };
  for (const m of manifests) {
    const p = m.path, t = m.text;
    try {
      if (p.endsWith('package.json')) {
        const j = JSON.parse(t);
        for (const [n, s] of Object.entries(j.dependencies || {})) add(n, s, 'npm', p);
        for (const [n, s] of Object.entries(j.devDependencies || {})) add(n, s, 'npm', p, true);
      } else if (/requirements[\w.-]*\.txt$/.test(p)) {
        for (const l of t.split('\n')) { const mm = l.replace(/#.*/, '').trim().match(/^([A-Za-z0-9_.-]+)(\[[^\]]*\])?\s*([=<>!~].*)?$/); if (mm && !l.trim().startsWith('-')) add(mm[1], mm[3] || '', 'PyPI', p, /dev|test/.test(p)); }
      } else if (p.endsWith('pyproject.toml')) {
        for (const mm of t.matchAll(/^\s*["']([A-Za-z0-9_.-]+)(\[[^\]]*\])?\s*([=<>!~][^"';]*)?["']\s*,?\s*$/gm)) add(mm[1], mm[3] || '', 'PyPI', p);
        const poetry = t.split(/\n\[/).find((s) => /^tool\.poetry\.(dev-)?dependencies\]/.test(s) || /^\[?tool\.poetry\.dependencies/.test(s));
        if (poetry) for (const mm of poetry.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|\{[^}]*version\s*=\s*"([^"]*)")/gm)) if (mm[1] !== 'python') add(mm[1], mm[2] || mm[3], 'PyPI', p);
      } else if (p.endsWith('go.mod')) {
        for (const mm of t.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w.]+\/[\w./-]+)\s+(v[\w.+-]+)/gm)) add(mm[1], mm[2].replace(/^v/, ''), 'Go', p);
      } else if (p.endsWith('Cargo.toml')) {
        const sec = t.split(/\n\[/).filter((s) => /^(dev-)?dependencies\]/.test(s.replace(/^\[/, '')));
        for (const s of sec) for (const mm of s.matchAll(/^\s*([\w-]+)\s*=\s*(?:"([^"]*)"|\{[^}]*version\s*=\s*"([^"]*)")/gm)) add(mm[1], mm[2] || mm[3], 'crates.io', p);
      } else if (p.endsWith('composer.json')) {
        const j = JSON.parse(t); for (const [n, s] of Object.entries(j.require || {})) if (n.includes('/')) add(n, s, 'Packagist', p);
      } else if (/(^|\/)Gemfile$/.test(p)) {
        for (const mm of t.matchAll(/^\s*gem\s+['"]([\w.-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/gm)) add(mm[1], mm[2] || '', 'RubyGems', p);
      }
    } catch {}
  }
  const seen = new Set();
  return deps.filter((d) => { const k = `${d.ecosystem}:${d.name}:${d.version}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const SEV = { CRITICAL: 5, HIGH: 4, MODERATE: 3, MEDIUM: 3, LOW: 2 };
export async function queryOsv(deps) {
  const q = deps.filter((d) => d.version).sort((a, b) => a.dev - b.dev).slice(0, 400);
  if (!q.length) return [];
  const batch = await cached('osv', 'q:' + q.map((d) => `${d.ecosystem}:${d.name}@${d.version}`).join(','), 6 * 3600e3, () =>
    fetchJson('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: q.map((d) => ({ package: { name: d.name, ecosystem: d.ecosystem }, version: d.version })) }) }, 20000));
  const hits = [];
  (batch.results || []).forEach((r, i) => (r.vulns || []).forEach((v) => hits.push({ dep: q[i], id: v.id })));
  const ids = [...new Set(hits.map((h) => h.id))].slice(0, 60);
  const details = await pool(ids, 8, (id) => cached('osv', 'v:' + id, 24 * 3600e3, () => fetchJson(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`)));
  const byId = new Map(ids.map((id, i) => [id, details[i]]));
  const out = [];
  for (const h of hits) {
    const v = byId.get(h.id); if (!v || v.error) continue;
    const aff = (v.affected || []).find((a) => a.package?.name?.toLowerCase() === h.dep.name.toLowerCase()) || v.affected?.[0];
    const fixed = aff?.ranges?.flatMap((r) => r.events || []).map((e) => e.fixed).filter(Boolean)[0] || null;
    const sevWord = String(v.database_specific?.severity || aff?.ecosystem_specific?.severity || '').toUpperCase();
    out.push({
      id: v.id, aliases: (v.aliases || []).filter((a) => /^CVE-|^GHSA-/.test(a)).slice(0, 3), summary: truncate(v.summary || v.details || '', 220),
      severity: SEV[sevWord] || (/(rce|remote code|injection|prototype pollution|arbitrary)/i.test(v.summary || '') ? 4 : 3), severityLabel: sevWord || 'UNRATED',
      package: h.dep.name, ecosystem: h.dep.ecosystem, version: h.dep.version, spec: h.dep.spec, manifest: h.dep.manifest, dev: h.dep.dev, fixed,
      published: v.published, url: `https://osv.dev/vulnerability/${v.id}`, attack: ['T1195.001', ...(/(rce|remote code|command|deserializ)/i.test(v.summary || '') ? ['T1059'] : []), ...(/(ssrf|injection|traversal|xss|request smuggling)/i.test(v.summary || '') ? ['T1190'] : [])],
    });
  }
  const seen = new Set();
  return out.filter((x) => { const k = x.id + x.package; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.severity - a.severity);
}

/* =========================================================================
   Scoring, MITRE roll-up, heuristic threat scenarios
   ========================================================================= */
const norm = (s) => s.toLowerCase().replace(/^@[^/]+\//, '').replace(/[-_.]/g, '');
export function usageOf(pkg, files) {
  const n = norm(pkg);
  const users = files.filter((f) => f.externals.some((x) => norm(x) === n || norm(x.split('/')[0]) === n));
  return { files: users.length, layers: [...new Set(users.map((f) => f.layer))] };
}

export function scoreSecurity({ layers, findings, vulns, endpoints, files }) {
  const by = Object.fromEntries(layers.map((l) => [l.id, { raw: 0, counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, findings: 0, vulns: 0, endpoints: 0, openEndpoints: 0 }]));
  for (const f of findings) { const b = by[f.layer] || by.config || Object.values(by)[0]; if (!b) continue; b.raw += f.severity ** 1.7; b.counts[f.severity]++; b.findings++; }
  for (const v of vulns) {
    v.usedBy = usageOf(v.package, files);
    const targets = v.usedBy.layers.length ? v.usedBy.layers : ['config'];
    for (const l of targets) { const b = by[l]; if (!b) continue; b.raw += (v.severity ** 1.6) * (v.dev ? 0.3 : 0.8) / Math.max(1, targets.length * 0.6); b.vulns++; }
  }
  for (const e of endpoints) { const b = by[e.layer]; if (!b) continue; b.endpoints++; if (e.auth === 'none') { b.openEndpoints++; if (e.sensitive) b.raw += 3; } }
  const out = {};
  for (const [id, b] of Object.entries(by)) out[id] = { score: round(clamp(sat(b.raw, 100, 45)), 0), counts: b.counts, findings: b.findings, vulns: b.vulns, endpoints: b.endpoints, openEndpoints: b.openEndpoints };
  const vals = Object.entries(out).filter(([id]) => id !== 'tests').map(([, v]) => v.score);
  const repo = vals.length ? round(0.6 * Math.max(...vals) + 0.4 * vals.reduce((a, b) => a + b, 0) / vals.length, 0) : 0;
  return { layers: out, score: repo };
}

export function mitreRollup(findings, vulns, scenarios = []) {
  const m = new Map();
  const add = (id, kind, ref, sev) => { const t = m.get(id) || { ...technique(id), findings: 0, vulns: 0, scenarios: 0, maxSeverity: 0, refs: [] }; t[kind]++; t.maxSeverity = Math.max(t.maxSeverity, sev || 0); if (t.refs.length < 12) t.refs.push(ref); m.set(id, t); };
  findings.forEach((f) => f.attack.forEach((a) => add(a, 'findings', { type: 'finding', fp: f.fp }, f.severity)));
  vulns.forEach((v) => v.attack.forEach((a) => add(a, 'vulns', { type: 'vuln', id: v.id }, v.severity)));
  scenarios.forEach((s) => (s.techniques || []).forEach((t) => add(t.id, 'scenarios', { type: 'scenario', id: s.id }, s.impact === 'critical' ? 5 : s.impact === 'high' ? 4 : 3)));
  return [...m.values()].sort((a, b) => b.maxSeverity - a.maxSeverity || (b.findings + b.vulns + b.scenarios) - (a.findings + a.vulns + a.scenarios));
}

export function shortestPath(edges, from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]); const q = [from];
  while (q.length) {
    const v = q.shift();
    for (const e of edges) if (e.source === v && !prev.has(e.target) && e.source !== 'tests') { prev.set(e.target, v); if (e.target === to) { const p = [to]; let c = v; while (c) { p.unshift(c); c = prev.get(c); } return p; } q.push(e.target); }
  }
  return null;
}

export function heuristicThreats({ layers, edges, findings, vulns, endpoints }) {
  const present = new Set(layers.map((l) => l.id));
  const entryLayers = [...new Set(endpoints.map((e) => e.layer))].filter((l) => present.has(l));
  if (!entryLayers.length) ['api', 'ui', 'integrations'].forEach((l) => present.has(l) && entryLayers.push(l));
  const groups = new Map();
  for (const f of findings.filter((x) => x.severity >= 3)) { const k = f.rule; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const scenarios = [];
  let n = 0;
  for (const [rule, fs] of [...groups.entries()].sort((a, b) => b[1][0].severity - a[1][0].severity).slice(0, 6)) {
    const f = fs[0];
    const entry = entryLayers.map((e) => ({ e, p: shortestPath(edges, e, f.layer) })).filter((x) => x.p).sort((a, b) => a.p.length - b.p.length)[0];
    const path = entry?.p || [f.layer];
    const reachesData = present.has('data') && (f.layer === 'data' || shortestPath(edges, f.layer, 'data'));
    const target = reachesData ? 'data' : f.layer;
    const ep = endpoints.find((e) => e.layer === path[0] && e.auth === 'none') || endpoints.find((e) => e.layer === path[0]);
    const techniques = [...new Set([...(entry && ['api', 'ui', 'integrations'].includes(path[0]) && f.category !== 'Supply chain' ? ['T1190'] : []), ...f.attack])].map(technique);
    scenarios.push({
      id: `TS-${++n}`, title: `${f.title}${path.length > 1 ? ` reachable from ${LAYER_BY_ID[path[0]]?.name || path[0]}` : ` in ${LAYER_BY_ID[f.layer]?.name || f.layer}`}`,
      likelihood: f.severity >= 4 && ep?.auth === 'none' ? 'high' : f.severity >= 4 ? 'medium' : 'low', impact: f.severity >= 5 || target === 'data' ? 'high' : 'medium',
      entryPoint: { layer: path[0], endpoint: ep ? `${ep.method} ${ep.path}` : null, file: ep?.file || f.file }, path: target !== path.at(-1) ? [...path, ...(shortestPath(edges, f.layer, target) || []).slice(1)] : path, target,
      techniques, evidence: fs.slice(0, 4).map((x) => ({ fp: x.fp, file: x.file, line: x.line })),
      narrative: `${fs.length} occurrence${fs.length > 1 ? 's' : ''} of "${f.title.toLowerCase()}" (${f.cwe}). ${path.length > 1 ? `An attacker entering through ${LAYER_BY_ID[path[0]]?.name} can reach it via ${path.slice(1).map((p) => LAYER_BY_ID[p]?.name).join(' → ')}.` : ''}`,
      detection: ep ? `Watch ${ep.method} ${ep.path} for unusual payloads; log and alert on errors from ${f.file.split('/').pop()}.` : `Add logging around ${f.file.split('/').pop()}:${f.line ?? ''}.`,
      mitigations: [f.fix], source: 'heuristic',
    });
  }
  const crit = vulns.filter((v) => v.severity >= 4 && !v.dev).slice(0, 2);
  for (const v of crit) {
    const l = v.usedBy?.layers?.[0] || 'config';
    scenarios.push({ id: `TS-${++n}`, title: `Known vulnerability in ${v.package} ${v.version}`, likelihood: 'medium', impact: v.severity >= 5 ? 'critical' : 'high', entryPoint: { layer: l, endpoint: null, file: v.manifest }, path: [l], target: l, techniques: v.attack.map(technique), evidence: [{ vuln: v.id }], narrative: `${v.aliases[0] || v.id}: ${v.summary}`, detection: `Track ${v.package} in your SCA tooling; alert on exploit attempts matching ${v.aliases[0] || v.id}.`, mitigations: [v.fixed ? `Upgrade ${v.package} to ${v.fixed} or later.` : `No fixed version listed; isolate or replace ${v.package}.`], source: 'heuristic' });
  }
  return scenarios;
}

export function posture({ score, findings, vulns, endpoints, scenarios }) {
  const crit = findings.filter((f) => f.severity >= 5).length + vulns.filter((v) => v.severity >= 5).length;
  const high = findings.filter((f) => f.severity === 4).length + vulns.filter((v) => v.severity === 4).length;
  const open = endpoints.filter((e) => e.auth === 'none' && e.sensitive).length;
  const verdict = crit || (high >= 3 && open) ? 'likely' : high || open > 2 ? 'possible' : 'unlikely';
  return {
    score, verdict, critical: crit, high, openSensitiveEndpoints: open,
    summary: `${crit} critical and ${high} high-severity issues${open ? `, ${open} sensitive endpoint${open > 1 ? 's' : ''} with no visible auth` : ''}. ${verdict === 'likely' ? 'An attacker has realistic footholds today.' : verdict === 'possible' ? 'Exploitation is possible if an attacker targets the weak spots below.' : 'No obvious footholds from static signals; keep dependency hygiene up.'}`,
    why: scenarios.slice(0, 3).map((s) => s.title),
  };
}

/* =========================================================================
   Threat Modeler agent
   ========================================================================= */
export async function aiThreatModel(llm, { repo, layers, edges, findings, vulns, endpoints, sensitive, intel, heuristic }) {
  const res = await llm.json(
    `You are a senior application-security engineer and red-teamer. Build a threat model for this codebase from the evidence provided. Think like an attacker: where would you probe first, what chain of steps gets you to data, credentials or code execution? Map every step to MITRE ATT&CK (Txxxx[.xxx]) or MITRE ATLAS (AML.Txxxx) technique ids. Only use evidence that is present; cite files, endpoints, packages and CVE ids. Be specific and terse.`,
    JSON.stringify({
      repo: { name: repo.full_name, description: repo.description, language: repo.language },
      layers: layers.map((l) => ({ id: l.id, name: l.name, dependsOn: l.dependsOn?.map((d) => d.layer) })),
      dependencyEdges: edges.filter((e) => e.source !== 'tests').map((e) => `${e.source}->${e.target}`),
      entryPoints: endpoints.slice(0, 40).map((e) => `${e.method} ${e.path} [${e.layer}] auth:${e.auth}${e.sensitive ? ' sensitive' : ''} (${e.file})`),
      findings: findings.slice(0, 45).map((f) => ({ fp: f.fp, title: f.title, severity: f.severity, cwe: f.cwe, layer: f.layer, at: `${f.file}:${f.line ?? ''}`, snippet: truncate(f.snippet, 120) })),
      vulnerableDependencies: vulns.slice(0, 20).map((v) => ({ id: v.aliases[0] || v.id, package: `${v.package}@${v.version}`, severity: v.severityLabel, summary: truncate(v.summary, 120), usedBy: v.usedBy?.layers })),
      sensitiveFiles: sensitive.slice(0, 10), threatIntel: (intel || []).slice(0, 8).map((i) => ({ title: i.title, snippet: truncate(i.snippet, 200) })),
      heuristicScenarios: heuristic.slice(0, 6).map((s) => s.title),
      outputSchema: {
        verdict: { exploitable: 'unlikely|possible|likely', why: 'max 40 words', firstProbe: 'where an attacker would probe first, max 25 words' },
        scenarios: [{ title: 'max 12 words', likelihood: 'low|medium|high', impact: 'low|medium|high|critical', entryPoint: { layer: 'layer id', endpoint: 'METHOD /path or null', file: 'path' }, path: ['layer ids from entry to target, following dependency edges'], target: 'layer id or asset', steps: [{ technique: 'Txxxx or AML.Txxxx', action: 'max 18 words', where: 'file / endpoint' }], evidence: ['finding fp or CVE id'], detection: 'where to watch / log, max 25 words', mitigations: ['max 3, each max 16 words'] }],
      },
    }),
    { effort: 'low', agent: 'Threat Modeler' }
  );
  const ok = new Set(layers.map((l) => l.id));
  const scenarios = (res.scenarios || []).slice(0, 8).map((s, i) => {
    const steps = (s.steps || []).filter((x) => /^(T\d{4}(\.\d{3})?|AML\.T\d{4}(\.\d{3})?)$/.test(String(x.technique || '').trim())).slice(0, 6);
    return {
      id: `TM-${i + 1}`, title: s.title || 'Attack scenario', likelihood: ['low', 'medium', 'high'].includes(s.likelihood) ? s.likelihood : 'medium', impact: ['low', 'medium', 'high', 'critical'].includes(s.impact) ? s.impact : 'medium',
      entryPoint: { layer: ok.has(s.entryPoint?.layer) ? s.entryPoint.layer : (s.path || []).find((p) => ok.has(p)) || 'api', endpoint: s.entryPoint?.endpoint || null, file: s.entryPoint?.file || null },
      path: (s.path || []).filter((p) => ok.has(p)), target: s.target || '', steps: steps.map((x) => ({ ...x, technique: String(x.technique).trim() })),
      techniques: [...new Set(steps.map((x) => String(x.technique).trim()))].map(technique), evidence: (s.evidence || []).slice(0, 6), detection: s.detection || '', mitigations: (s.mitigations || []).slice(0, 4), source: 'ai',
    };
  });
  return { scenarios, verdict: res.verdict || null };
}

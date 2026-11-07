import { createHash } from 'node:crypto';
import { truncate, clamp } from './util.js';
import { cached, fetchJson } from './cache.js';

/* =========================================================================
   Privacy debt: where a codebase puts its users' data at risk.

   Three questions, the same ones Privacy-First reviewers ask:
     1. Who receives user data?  Third-party SDKs and endpoints found in code and manifests.
     2. What do they receive?    Lines where personal data (email, phone, location, health…)
                                 flows into a tracker, an AI API, logs, browser storage or a URL.
     3. What's about to change?  Open PRs that add a new recipient or a new flow, before it ships.
   Everything here is static analysis on the downloaded source; nothing is sent anywhere.
   ========================================================================= */

// Third parties that receive user data. `pkg` matches dependency names, `code` matches source (hosts, globals, calls).
const RECIPIENTS = [
  { id: 'ga', domain: 'policies.google.com', name: 'Google Analytics', cat: 'analytics', pkg: /^(react-ga4?|ga-4-react|vue-gtag|@next\/third-parties|universal-analytics|nextjs-google-analytics)$/, code: /googletagmanager\.com|google-analytics\.com|\bgtag\(|\bga\(\s*['"]send|dataLayer\.push/, typical: ['IP address', 'device', 'pages viewed', 'location'] },
  { id: 'fbpixel', domain: 'facebook.com', name: 'Meta Pixel', cat: 'ads', pkg: /^(react-facebook-pixel|facebook-nodejs-business-sdk)$/, code: /connect\.facebook\.net|\bfbq\(|graph\.facebook\.com\/.*\/events/, typical: ['IP address', 'pages viewed', 'purchases', 'hashed email'] },
  { id: 'tiktok', domain: 'tiktok.com', name: 'TikTok Pixel', cat: 'ads', pkg: /^tiktok-pixel$/, code: /analytics\.tiktok\.com|\bttq\.(track|page|identify)/, typical: ['IP address', 'pages viewed', 'purchases'] },
  { id: 'linkedin', domain: 'linkedin.com', name: 'LinkedIn Insight', cat: 'ads', pkg: /^$/, code: /snap\.licdn\.com|_linkedin_partner_id/, typical: ['IP address', 'pages viewed'] },
  { id: 'segment', domain: 'segment.com', name: 'Segment', cat: 'analytics', pkg: /^(@segment\/|analytics-node|analytics-react-native)/, code: /cdn\.segment\.com|api\.segment\.io|\banalytics\.(identify|track|page)\(/, typical: ['user ID', 'email', 'events'] },
  { id: 'mixpanel', domain: 'mixpanel.com', name: 'Mixpanel', cat: 'analytics', pkg: /^(mixpanel|mixpanel-browser|mixpanel-react-native)$/, code: /api\.mixpanel\.com|\bmixpanel\.(track|identify|people)/, typical: ['user ID', 'events', 'device', 'location'] },
  { id: 'amplitude', domain: 'amplitude.com', name: 'Amplitude', cat: 'analytics', pkg: /^(@amplitude\/|amplitude-js)/, code: /api2?\.amplitude\.com|\bamplitude\.(track|logEvent|setUserId|identify)/, typical: ['user ID', 'events', 'device'] },
  { id: 'posthog', domain: 'posthog.com', name: 'PostHog', cat: 'analytics', pkg: /^(posthog-js|posthog-node|posthog)$/, code: /\.posthog\.com|\bposthog\.(capture|identify)/, typical: ['user ID', 'events', 'session recordings'] },
  { id: 'heap', domain: 'heap.io', name: 'Heap', cat: 'analytics', pkg: /^(reactjs-heap|heap-api)$/, code: /cdn\.heapanalytics\.com|\bheap\.(track|identify)/, typical: ['every click', 'user ID'] },
  { id: 'hotjar', domain: 'hotjar.com', name: 'Hotjar', cat: 'replay', pkg: /^(@hotjar\/|react-hotjar)/, code: /static\.hotjar\.com|\bhj\(\s*['"]/, typical: ['session recordings', 'clicks', 'typed text'] },
  { id: 'fullstory', domain: 'fullstory.com', name: 'FullStory', cat: 'replay', pkg: /^@fullstory\//, code: /fullstory\.com|\bFS\.(identify|setUserVars)/, typical: ['session recordings', 'typed text', 'email'] },
  { id: 'logrocket', domain: 'logrocket.com', name: 'LogRocket', cat: 'replay', pkg: /^logrocket/, code: /cdn\.logrocket|\bLogRocket\.(init|identify)/, typical: ['session recordings', 'network requests', 'typed text'] },
  { id: 'clarity', domain: 'clarity.microsoft.com', name: 'Microsoft Clarity', cat: 'replay', pkg: /^(@microsoft\/clarity|react-microsoft-clarity)$/, code: /clarity\.ms/, typical: ['session recordings', 'clicks'] },
  { id: 'sentry', domain: 'sentry.io', name: 'Sentry', cat: 'errors', pkg: /^@sentry\//, code: /\.ingest\.sentry\.io|Sentry\.(init|setUser|captureException)/, typical: ['IP address', 'stack traces', 'request data'] },
  { id: 'datadog', domain: 'datadoghq.com', name: 'Datadog', cat: 'errors', pkg: /^(@datadog\/|dd-trace|datadog)/, code: /datadoghq\.(com|eu)|DD_RUM|datadogRum\./, typical: ['logs', 'sessions', 'IP address'] },
  { id: 'bugsnag', domain: 'bugsnag.com', name: 'Bugsnag', cat: 'errors', pkg: /^@bugsnag\//, code: /notify\.bugsnag\.com|Bugsnag\.(start|notify)/, typical: ['stack traces', 'user ID'] },
  { id: 'intercom', domain: 'intercom.com', name: 'Intercom', cat: 'marketing', pkg: /^(react-use-intercom|@intercom\/)/, code: /widget\.intercom\.io|\bIntercom\(\s*['"](boot|update)/, typical: ['name', 'email', 'chat messages'] },
  { id: 'hubspot', domain: 'hubspot.com', name: 'HubSpot', cat: 'marketing', pkg: /^@hubspot\//, code: /js\.hs-scripts\.com|api\.hubapi\.com|_hsq\.push/, typical: ['email', 'name', 'company', 'pages viewed'] },
  { id: 'mailchimp', domain: 'mailchimp.com', name: 'Mailchimp', cat: 'marketing', pkg: /^(@mailchimp\/|mailchimp-api-v3)/, code: /api\.mailchimp\.com|list-manage\.com/, typical: ['email', 'name'] },
  { id: 'sendgrid', domain: 'twilio.com', name: 'SendGrid', cat: 'messaging', pkg: /^@sendgrid\//, code: /api\.sendgrid\.com/, typical: ['email', 'message content'] },
  { id: 'twilio', domain: 'twilio.com', name: 'Twilio', cat: 'messaging', pkg: /^twilio$/, code: /api\.twilio\.com/, typical: ['phone number', 'message content'] },
  { id: 'openai', domain: 'openai.com', name: 'OpenAI', cat: 'ai', pkg: /^(openai|@ai-sdk\/openai|langchain-openai|@langchain\/openai)$/, code: /api\.openai\.com|new OpenAI\(|OpenAI\(\)|openai\.(chat|ChatCompletion|responses)/, typical: ['prompts', 'whatever user text you send'] },
  { id: 'anthropic', domain: 'anthropic.com', name: 'Anthropic', cat: 'ai', pkg: /^(anthropic|@anthropic-ai\/sdk|@ai-sdk\/anthropic|langchain-anthropic)$/, code: /api\.anthropic\.com|new Anthropic\(|anthropic\.messages/, typical: ['prompts', 'whatever user text you send'] },
  { id: 'gemini', domain: 'ai.google.dev', name: 'Google Gemini', cat: 'ai', pkg: /^(@google\/generative-ai|@google\/genai|google-generativeai|google-genai)$/, code: /generativelanguage\.googleapis\.com|GoogleGenerativeAI\(|genai\.Client/, typical: ['prompts', 'whatever user text you send'] },
  { id: 'cohere', domain: 'cohere.com', name: 'Cohere', cat: 'ai', pkg: /^(cohere|cohere-ai)$/, code: /api\.cohere\.(ai|com)/, typical: ['prompts'] },
  { id: 'firebase', domain: 'firebase.google.com', name: 'Firebase Analytics', cat: 'analytics', pkg: /^@react-native-firebase\/analytics$/, code: /firebase\/analytics|firebase\.analytics\(|@react-native-firebase\/analytics/, typical: ['device ID', 'events', 'location'] },
  { id: 'vercel', domain: 'vercel.com', name: 'Vercel Analytics', cat: 'analytics', pkg: /^@vercel\/(analytics|speed-insights)$/, code: /@vercel\/analytics/, typical: ['pages viewed', 'device', 'country'] },
  { id: 'tinybird', domain: 'tinybird.co', name: 'Tinybird', cat: 'analytics', pkg: /^(@chronark\/zod-bird|@tinybirdco\/)/, code: /api\.([\w-]+\.)?tinybird\.co|TINYBIRD_API/, typical: ['events', 'IP address', 'location', 'device'] },
  { id: 'resend', domain: 'resend.com', name: 'Resend', cat: 'messaging', pkg: /^resend$/, code: /api\.resend\.com|new Resend\(/, typical: ['email', 'message content'] },
  { id: 'postmark', domain: 'postmarkapp.com', name: 'Postmark', cat: 'messaging', pkg: /^postmark$/, code: /api\.postmarkapp\.com/, typical: ['email', 'message content'] },
  { id: 'plain', domain: 'plain.com', name: 'Plain', cat: 'marketing', pkg: /^@team-plain\//, code: /@team-plain\/|core-api\.uk\.plain\.com/, typical: ['name', 'email', 'support messages'] },
  { id: 'customerio', domain: 'customer.io', name: 'Customer.io', cat: 'marketing', pkg: /^customerio-node$|^@customerio\//, code: /track\.customer\.io/, typical: ['email', 'events'] },
  { id: 'clearbit', domain: 'clearbit.com', name: 'Clearbit', cat: 'enrichment', pkg: /^clearbit$/, code: /clearbit\.com/, typical: ['email', 'company', 'IP address'] },
  { id: 'stripe', domain: 'stripe.com', name: 'Stripe', cat: 'payments', pkg: /^(stripe|@stripe\/stripe-js)$/, code: /api\.stripe\.com|js\.stripe\.com/, typical: ['card details', 'email', 'billing address'] },
  { id: 'algolia', domain: 'algolia.com', name: 'Algolia', cat: 'search', pkg: /^(algoliasearch|react-instantsearch)/, code: /algolia\.net|algolianet\.com/, typical: ['search queries', 'IP address'] },
];
const CAT = {
  ads: { label: 'Advertising', weight: 3 }, replay: { label: 'Session recording', weight: 3 }, enrichment: { label: 'Data enrichment', weight: 3 },
  analytics: { label: 'Analytics', weight: 2 }, ai: { label: 'AI model', weight: 2 }, marketing: { label: 'Marketing', weight: 2 },
  errors: { label: 'Error tracking', weight: 1 }, messaging: { label: 'Messaging', weight: 1 }, payments: { label: 'Payments', weight: 1 }, search: { label: 'Search', weight: 1 },
};

// Personal data, by kind. Word-boundary-ish matches on identifiers so "emailer" or "phoneme" don't count.
const PII = [
  { id: 'email', label: 'Email', kind: 'contact', re: /\b(e_?mail(_?address)?|userEmail|user_email)\b/i },
  { id: 'phone', label: 'Phone number', kind: 'contact', re: /\b(phone(_?number)?|mobile(_?number)?|tel(ephone)?)\b/i },
  { id: 'name', label: 'Full name', kind: 'identity', re: /\b(first_?name|last_?name|full_?name|firstName|lastName|fullName|display_?name)\b/i },
  { id: 'address', label: 'Home address', kind: 'location', re: /\b(street(_?address)?|address_?line\d?|postal_?code|zip_?code|home_?address|billing_?address|shipping_?address)\b/i },
  { id: 'location', label: 'Location', kind: 'location', re: /\b(latitude|longitude|geolocation|geo_?location|coords|getCurrentPosition|lat_?lng)\b/i },
  { id: 'ip', label: 'IP address', kind: 'device', re: /\b(ip_?address|remote_?addr|x-forwarded-for|req\.ip|request\.remote_addr|client_?ip)\b/i },
  { id: 'dob', label: 'Date of birth', kind: 'identity', re: /\b(dob|date_?of_?birth|birth_?date|birthday)\b/i },
  { id: 'gov', label: 'Government ID', kind: 'identity', re: /\b(ssn|social_?security|passport(_?number)?|national_?id|tax_?id|driver_?licen[cs]e)\b/i },
  { id: 'card', label: 'Card number', kind: 'financial', re: /\b(card_?number|credit_?card|cc_?number|cvv|cvc|iban|account_?number|routing_?number)\b/i },
  { id: 'health', label: 'Health data', kind: 'health', re: /\b(diagnos[ie]s|medical(_?record)?|health_?data|prescription|medication|symptoms?|blood_?type|patient|allerg(y|ies)|condition_?code)\b/i },
  { id: 'password', label: 'Password', kind: 'credential', re: /\b(password|passwd|pwd|passcode)\b/i },
  { id: 'gender', label: 'Gender / ethnicity', kind: 'sensitive', re: /\b(gender|ethnicity|race|religion|sexual_?orientation)\b/i },
];
const KIND_WEIGHT = { health: 3, financial: 3, credential: 3, identity: 2, sensitive: 3, location: 2, contact: 1, device: 1 };

const CODE = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|py|go|java|kt|rb|php|cs|rs|swift|dart|html)$/;
const TRACK_CALL = /\b(analytics|mixpanel|amplitude|posthog|heap|segment|rudderanalytics|FS|LogRocket|Intercom|_hsq|fbq|gtag|ttq|clarity|dataLayer|Sentry|datadogRum|Bugsnag|window\.analytics)\s*[.(]\s*(track|identify|capture|people\.set|setUserId|setUser|setUserVars|logEvent|push|alias|register|boot|update|init|event|send)?/;
const IDENTIFY = /\b(identify|setUser|setUserId|setUserVars|people\.set|alias|boot)\s*\(/;
const LOG_CALL = /\b(console\.(log|info|debug|warn|error)|logger\.\w+|logging\.\w+|log\.(info|debug|warn|error|Print\w*)|print|println!|fmt\.Print\w*|System\.out\.print\w*)\s*\(/;
const LLM_CALL = /\b(chat\.completions\.create|responses\.create|messages\.create|generateContent|ChatCompletion\.create|completions\.create|invoke|generateText|streamText)\s*\(|\b(messages|prompt|contents)\s*[:=]/;
const STORAGE = /\b(localStorage|sessionStorage)\.setItem\(|document\.cookie\s*=|AsyncStorage\.setItem\(|setCookie\(|res\.cookie\(/;
const URL_PII = /[?&](email|e-mail|phone|ssn|dob|first_?name|last_?name|full_?name|address|password)=/i;
// A call that ships data to a vendor client or endpoint (used when the file already talks to a known recipient)
const SEND_CALL = /\b(fetch|axios(\.\w+)?|\w+(\.\w+)?\.(post|create|upsert|send|ingest|publish|capture|track|identify|sync|update)\w*)\s*\(/;
/** The code on a line with string literals blanked out, but template ${…} expressions kept, so log text that merely mentions "email" doesn't count. */
const codeOnly = (l) => l.replace(/`(?:[^`\\]|\\.)*`/g, (t) => ' ' + [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ') + ' ').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
const REPLAY_UNMASKED = /(maskAllInputs|maskAllText|maskTextSelector|blockAllMedia|dom\.inputSanitizer|maskInputOptions)\s*:\s*false|sendDefaultPii\s*:\s*true|send_default_pii\s*=\s*True|recordCrossOriginIframes\s*:\s*true/;
const ENCRYPT_HINT = /encrypt|cipher|kms|vault|hash|bcrypt|argon|scrypt|fernet|aes|pgcrypto|EncryptedField|encrypted/i;
const MODEL_FILE = /(models?|schema|entities|migrations?|prisma)\b.*\.(py|ts|js|rb|prisma|sql|go|java)$|\.prisma$|schema\.(sql|ts|js)$/i;

const fp = (...p) => createHash('sha1').update(p.join('|')).digest('hex').slice(0, 12);
const piiIn = (s) => PII.filter((p) => p.re.test(s));
const near = (lines, i, r = 3) => lines.slice(Math.max(0, i - r), i + r + 1).join('\n');
/** The call's own arguments: this line and the next few until the call closes (object literals span lines). */
const args = (lines, i, max = 16) => { let out = lines[i], depth = (lines[i].match(/[({[]/g) || []).length - (lines[i].match(/[)}\]]/g) || []).length;
  for (let k = i + 1; k < lines.length && k <= i + max && depth > 0; k++) { out += '\n' + lines[k]; depth += (lines[k].match(/[({[]/g) || []).length - (lines[k].match(/[)}\]]/g) || []).length; }
  return out; };

function recipientsIn(text) {
  return RECIPIENTS.filter((r) => r.code.test(text));
}

/** Map a tracking/LLM call on line i to the recipient most likely receiving it. */
function recipientFor(line, ctx, fileRecipients) {
  const direct = RECIPIENTS.find((r) => r.code.test(line));
  if (direct) return direct;
  const m = line.match(TRACK_CALL);
  if (m) {
    const g = m[1].toLowerCase();
    const byGlobal = { analytics: 'segment', mixpanel: 'mixpanel', amplitude: 'amplitude', posthog: 'posthog', heap: 'heap', segment: 'segment', fs: 'fullstory', logrocket: 'logrocket', intercom: 'intercom', _hsq: 'hubspot', fbq: 'fbpixel', gtag: 'ga', ttq: 'tiktok', clarity: 'clarity', datalayer: 'ga', sentry: 'sentry', datadogrum: 'datadog', bugsnag: 'bugsnag', 'window.analytics': 'segment' }[g];
    if (byGlobal) return RECIPIENTS.find((r) => r.id === byGlobal);
  }
  return fileRecipients[0] || RECIPIENTS.find((r) => r.code.test(ctx)) || null;
}

/** Scan one text (a file, or the added lines of a PR) for privacy flows. */
export function scanPrivacy(path, text, { layer, isTest = false, fileRecipients, known = [] } = {}) {
  const out = [];
  if (!text || !CODE.test(path) || isTest) return out;
  const lines = text.split('\n');
  const recs = fileRecipients || recipientsIn(text);
  // Recipients found elsewhere in the repo: a file often calls a shared client (`plain.upsertCustomer`) imported from ./client
  const anyRecs = [...recs, ...known.filter((k) => !recs.includes(k))];
  const add = (o, i) => out.push({ ...o, file: path, line: i + 1, layer, snippet: truncate(lines[i].trim(), 180), fp: fp(o.rule, path, lines[i].trim().slice(0, 120)) });
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length > 500 || /^\s*(\/\/|#|\*|<!--)/.test(l)) continue;
    const ctx = near(lines, i, 2);
    // 1. Personal data sent to a third party (tracker, replay, ads, CRM)
    if (TRACK_CALL.test(l) || IDENTIFY.test(l)) {
      const pii = piiIn(codeOnly(args(lines, i))).filter((p) => p.id !== 'password' || /password/i.test(l));
      const to = recipientFor(l, ctx, recs);
      if (pii.length && to && to.cat !== 'ai') {
        const w = Math.max(...pii.map((p) => KIND_WEIGHT[p.kind])) + CAT[to.cat].weight;
        add({ rule: 'pii-to-third-party', kind: 'share', title: `Sends ${pii.map((p) => p.label.toLowerCase()).join(', ')} to ${to.name}`, severity: clamp(w, 2, 5), recipient: to.id, pii: pii.map((p) => p.id),
          who: `${to.name} (${CAT[to.cat].label.toLowerCase()}) and anyone it shares data with`, fix: `Send an internal user ID instead of ${pii[0].label.toLowerCase()}, or hash it before it leaves; check ${to.name} is in your privacy policy and needs consent.` }, i);
        continue;
      }
    }
    // 1b. Personal data passed to a vendor client in a file that talks to that vendor (CRMs, email, analytics APIs)
    if (SEND_CALL.test(l) && !LLM_CALL.test(l) && anyRecs.some((r) => r.cat !== 'ai')) {
      const pii = piiIn(codeOnly(args(lines, i))).filter((p) => p.id !== 'password');
      const recv = (l.match(/\b(\w+)\.[\w.]+\s*\(/) || [])[1]?.toLowerCase();
      const to = anyRecs.find((r) => r.cat !== 'ai' && (r.code.test(l) || (recv && recv.length > 2 && (recv === r.id || r.name.toLowerCase().replace(/\W/g, '').startsWith(recv)))));
      if (pii.length && to) {
        const w = Math.max(...pii.map((p) => KIND_WEIGHT[p.kind])) + CAT[to.cat].weight - (to.cat === 'payments' || to.cat === 'messaging' ? 1 : 0);
        add({ rule: 'pii-to-third-party', kind: 'share', title: `Sends ${pii.map((p) => p.label.toLowerCase()).join(', ')} to ${to.name}`, severity: clamp(w, 1, 5), recipient: to.id, pii: pii.map((p) => p.id),
          who: `${to.name} (${CAT[to.cat].label.toLowerCase()}) and its sub-processors`, fix: to.cat === 'payments' || to.cat === 'messaging' ? `Expected for ${to.name}; send only the fields it needs and list it in your privacy policy.` : `Send only what ${to.name} needs (an ID instead of ${pii[0].label.toLowerCase()} where possible), and list it in your privacy policy.` }, i);
        continue;
      }
    }
    // 2. Personal data inside an AI prompt
    if (LLM_CALL.test(l) && recs.some((r) => r.cat === 'ai')) {
      const pii = piiIn(codeOnly(args(lines, i, 10))).filter((p) => p.id !== 'password');
      if (pii.length) {
        const to = recs.find((r) => r.cat === 'ai');
        add({ rule: 'pii-to-ai', kind: 'ai', title: `Puts ${pii.map((p) => p.label.toLowerCase()).join(', ')} into prompts sent to ${to.name}`, severity: clamp(Math.max(...pii.map((p) => KIND_WEIGHT[p.kind])) + 2, 3, 5), recipient: to.id, pii: pii.map((p) => p.id),
          who: `${to.name}; prompts may be retained and reviewed for abuse`, fix: 'Strip or pseudonymise personal fields before building the prompt; use a zero-retention API tier for user data.' }, i);
        continue;
      }
    }
    // 3. Personal data written to logs
    if (LOG_CALL.test(l)) {
      const pii = piiIn(codeOnly(l)).filter((p) => !/redact|mask|\*\*\*|length|len\(/i.test(l));
      if (pii.length) {
        add({ rule: 'pii-in-logs', kind: 'logs', title: `Writes ${pii.map((p) => p.label.toLowerCase()).join(', ')} to logs`, severity: clamp(Math.max(...pii.map((p) => KIND_WEIGHT[p.kind])) + 1, 2, 5), pii: pii.map((p) => p.id),
          who: 'Everyone with log access, plus your log provider; logs are rarely deleted', fix: 'Log a user ID, never the personal value; add a redaction filter to the logger.' }, i);
        continue;
      }
    }
    // 4. Personal data in browser storage / cookies (readable by any script on the page)
    if (STORAGE.test(l)) {
      const pii = piiIn(codeOnly(l).replace(/\b(localStorage|sessionStorage|AsyncStorage)\.setItem/, '') + ' ' + (l.match(/setItem\(\s*['"`]([^'"`]+)/)?.[1] || ''));
      if (pii.length) {
        add({ rule: 'pii-in-browser', kind: 'storage', title: `Stores ${pii.map((p) => p.label.toLowerCase()).join(', ')} in the browser`, severity: clamp(Math.max(...pii.map((p) => KIND_WEIGHT[p.kind])) + 1, 2, 5), pii: pii.map((p) => p.id),
          who: 'Any script on the page, including every third-party tag above', fix: 'Keep personal data server-side; store an opaque session ID in an HttpOnly cookie instead.' }, i);
        continue;
      }
    }
    // 5. Personal data in URLs (ends up in server, proxy and analytics logs, and referrers)
    if (URL_PII.test(l) && /(fetch|axios|http|href|url|redirect|location)/i.test(l) && !/localhost|example\.com/.test(l)) {
      const pii = piiIn(l.match(URL_PII)[0]);
      add({ rule: 'pii-in-url', kind: 'url', title: `Puts ${(pii[0]?.label || 'personal data').toLowerCase()} in a URL`, severity: 3, pii: pii.map((p) => p.id),
        who: 'Server and proxy logs, browser history, analytics tools and Referer headers', fix: 'Send it in the request body (POST) instead of the query string.' }, i);
      continue;
    }
    // 6. Session replay / error tracking configured to capture everything
    if (REPLAY_UNMASKED.test(l)) {
      const to = recipientFor(l, ctx, recs);
      add({ rule: 'replay-unmasked', kind: 'share', title: `${to?.name || 'Session recording'} set to capture typed text and personal data`, severity: 4, recipient: to?.id, pii: ['typed'],
        who: `${to?.name || 'The vendor'} staff and anyone with dashboard access can watch what users type`, fix: 'Turn input/text masking back on and keep sendDefaultPii off.' }, i);
      continue;
    }
  }
  // 7. Sensitive fields stored without any sign of encryption (data models only)
  if (MODEL_FILE.test(path) && !ENCRYPT_HINT.test(text)) {
    for (let i = 0; i < lines.length; i++) {
      const pii = piiIn(lines[i]).filter((p) => ['health', 'financial', 'identity'].includes(p.kind) && p.id !== 'name');
      if (pii.length && /[:=(]|Column|Field|String|TEXT|VARCHAR|varchar|text\b/.test(lines[i])) {
        add({ rule: 'sensitive-unencrypted', kind: 'storage', title: `Stores ${pii[0].label.toLowerCase()} without encryption`, severity: 4, pii: pii.map((p) => p.id),
          who: 'Anyone with database access, and anyone who gets a backup', fix: 'Encrypt the column (application-level or pgcrypto/KMS) and limit who can read it.' }, i);
      }
    }
  }
  return out;
}

/** Whole-repo privacy analysis. `deps` from parseDependencies; `prs` = [{pr, diff}] for open PRs. */
export function analyzePrivacy({ files, deps, prs }) {
  // Recipients: manifests + code
  const rec = new Map();
  const seen = (r, how, where) => {
    const x = rec.get(r.id) || { ...r, pkg: undefined, code: undefined, category: CAT[r.cat].label, weight: CAT[r.cat].weight, evidence: [], files: new Set(), flows: 0, pii: new Set() };
    if (x.evidence.length < 4 && !x.evidence.some((e) => e.where === where)) x.evidence.push({ how, where });
    if (how === 'code') x.files.add(where.split(':')[0]);
    rec.set(r.id, x);
  };
  for (const d of deps) for (const r of RECIPIENTS) if (r.pkg.test(d.name)) seen(r, 'package', `${d.manifest} → ${d.name}`);
  const scan = files.filter((f) => CODE.test(f.path) && f.size <= 250 * 1024);
  const perFile = scan.map((f) => recipientsIn(f.text));
  scan.forEach((f, k) => { const lines = f.text.split('\n'); for (const r of perFile[k]) { const i = lines.findIndex((l) => r.code.test(l)); seen(r, 'code', `${f.path}:${i + 1}`); } });
  const known = RECIPIENTS.filter((r) => rec.has(r.id));
  const findings = [];
  scan.forEach((f, k) => findings.push(...scanPrivacy(f.path, f.text, { layer: f.layer, isTest: f.layer === 'tests', fileRecipients: perFile[k], known })));
  const dedup = new Map(findings.map((x) => [x.fp, x]));
  const flows = [...dedup.values()].sort((a, b) => b.severity - a.severity).slice(0, 300);
  for (const fl of flows) { const r = fl.recipient && rec.get(fl.recipient); if (r) { r.flows++; fl.pii.forEach((p) => r.pii.add(p)); } }

  // Personal data the app handles at all (inventory), by kind
  const inventory = PII.map((p) => ({ id: p.id, label: p.label, kind: p.kind, files: files.filter((f) => CODE.test(f.path) && f.layer !== 'tests' && p.re.test(f.text)).length })).filter((x) => x.files);

  // Open PRs: new recipients (manifest lines) and new flows (added code)
  const prChanges = [];
  for (const { pr, diff } of prs) {
    if (!diff) continue;
    const items = [];
    for (const f of diff) {
      if (!f.added.length) continue;
      const added = f.added.join('\n');
      if (/package\.json$|requirements[\w.-]*\.txt$|pyproject\.toml$|Gemfile$|go\.mod$/.test(f.path)) {
        for (const r of RECIPIENTS) for (const l of f.added) {
          const name = (l.match(/^\s*"([^"]+)"\s*:/) || l.match(/^\s*([A-Za-z0-9_.@\/-]+)\s*(==|>=|~=|=|\s|$)/) || [])[1];
          if (name && r.pkg.test(name) && !items.some((x) => x.recipient === r.id && x.rule === 'new-recipient')) items.push({ rule: 'new-recipient', kind: 'share', title: `Adds ${r.name} (${CAT[r.cat].label.toLowerCase()})`, severity: CAT[r.cat].weight + 1, recipient: r.id, file: f.path, snippet: truncate(l.trim(), 160), pii: [] });
        }
      }
      for (const r of recipientsIn(added)) if (!rec.has(r.id) && !items.some((x) => x.recipient === r.id)) items.push({ rule: 'new-recipient', kind: 'share', title: `Starts sending data to ${r.name}`, severity: CAT[r.cat].weight + 1, recipient: r.id, file: f.path, snippet: truncate((f.added.find((l) => r.code.test(l)) || '').trim(), 160), pii: [] });
      for (const fl of scanPrivacy(f.path, added, {})) items.push({ ...fl, line: null });
    }
    if (items.length) prChanges.push({ number: pr.number, title: pr.title, url: pr.html_url, author: pr.user?.login, avatar: pr.user?.avatar_url, draft: pr.draft, createdAt: pr.created_at, items: items.sort((a, b) => b.severity - a.severity).slice(0, 12), severity: Math.max(...items.map((x) => x.severity)) });
  }
  prChanges.sort((a, b) => b.severity - a.severity);

  const recipients = [...rec.values()].map((r) => ({ id: r.id, name: r.name, domain: r.domain, cat: r.cat, category: r.category, typical: r.typical, evidence: r.evidence, files: r.files.size, flows: r.flows, pii: [...r.pii], weight: r.weight }))
    .sort((a, b) => b.weight - a.weight || b.flows - a.flows);

  // Score: 100 minus weighted debt, graded A to F.
  const flowPts = flows.reduce((s, f) => s + [0, 1, 2, 4, 7, 10][f.severity], 0);
  const recPts = recipients.reduce((s, r) => s + r.weight * 2, 0);
  const prPts = prChanges.reduce((s, p) => s + p.severity * 2, 0);
  const score = Math.round(clamp(100 - Math.min(55, flowPts) - Math.min(30, recPts) - Math.min(15, prPts), 0, 100));
  const grade = score >= 90 ? ['A', 'Excellent'] : score >= 75 ? ['B', 'Good'] : score >= 60 ? ['C', 'Fair'] : score >= 40 ? ['D', 'Poor'] : ['F', 'Failing'];
  const kinds = {}; flows.forEach((f) => (kinds[f.kind] = (kinds[f.kind] || 0) + 1));
  return {
    score, grade: grade[0], verdict: grade[1], recipients, flows, prChanges, inventory, kinds,
    totals: { recipients: recipients.length, flows: flows.length, critical: flows.filter((f) => f.severity >= 4).length, prs: prChanges.length, sensitiveKinds: [...new Set(flows.flatMap((f) => f.pii))].length },
  };
}

/* ---------------------------------------------------------------- recipient research (Tavily + Exa) */

/**
 * What a data recipient does with what it receives, with sources. Only the company name is searched.
 * Tavily's answer is the summary; every result is kept as a citation.
 */
export async function researchRecipient({ name, domain, tavilyKey, exaKey, log }) {
  if (!tavilyKey && !exaKey) throw new Error('Add a Tavily or Exa key to research recipients.');
  const who = domain ? `${name} (${domain})` : name;
  const q = `${who} privacy policy: what customer and end-user data it collects, how long it keeps it, whether it sells or shares it, and whether it uses it for advertising or AI training`;
  const tavilyQ = (inc) => fetchJson('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey}` }, body: JSON.stringify({ query: q, max_results: 5, search_depth: 'advanced', include_answer: 'advanced', ...(inc ? { include_domains: [inc] } : {}) }) });
  const exaQ = (inc) => fetchJson('https://api.exa.ai/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': exaKey }, body: JSON.stringify({ query: `${who} privacy policy data retention`, numResults: 5, type: 'auto', contents: { highlights: { numSentences: 2 } }, ...(inc ? { includeDomains: [inc] } : {}) }) });
  // The company's own site first (its policy is the best citation); the open web only if that comes back empty.
  const run = (fn, tag) => cached('privacy2', tag + ':' + q, 7 * 864e5, async () => { const a = domain ? await fn(domain).catch(() => null) : null; return a?.results?.length ? a : fn(null); });
  const [tav, exa] = await Promise.all([
    tavilyKey ? run(tavilyQ, 't').catch((e) => ({ error: e.message })) : null,
    exaKey ? run(exaQ, 'e').catch((e) => ({ error: e.message })) : null,
  ]);
  const sources = [];
  for (const r of tav?.results || []) sources.push({ engine: 'Tavily', title: r.title, url: r.url, snippet: truncate(r.content || '', 260) });
  for (const r of exa?.results || []) if (!sources.some((s) => s.url === r.url)) sources.push({ engine: 'Exa', title: r.title, url: r.url, snippet: truncate((r.highlights || []).join(' ') || r.text || '', 260) });
  if (!sources.length) throw new Error(tav?.error || exa?.error || 'No sources found');
  return { name, domain, answer: tav?.answer || null, sources: sources.slice(0, 8), ts: Date.now(), flags: policyFlags(tav?.answer || sources.map((s) => s.snippet).join(' ')) };
}

/**
 * Yes / no / unknown for the questions people care about, read sentence by sentence so
 * "the notice doesn't say whether data is used for advertising" stays unknown instead of yes.
 */
export function policyFlags(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/);
  const NEG = /\b(not|no|never|doesn't|does not|don't|do not|won't|without)\b/i, UNSURE = /\b(whether|unclear|unspecified|doesn't (say|specify|list|state)|does not (say|specify|list|state|mention)|not (stated|specified|mentioned|listed))\b/i;
  const ask = (re) => {
    let v = null;
    for (const s of sentences) { if (!re.test(s)) continue; if (UNSURE.test(s)) continue; v = NEG.test(s) ? (v === true ? true : false) : true; if (v) break; }
    return v; // true = yes, false = explicitly no, null = not stated
  };
  return {
    sells: ask(/\b(sell|sells|sold|sale of)\b[^.]{0,40}\b(data|information)\b|\b(data|information)\b[^.]{0,40}\b(sold|sell)\b/i),
    ads: ask(/\b(advertis\w*|ad targeting|targeted ads|marketing purposes)\b/i),
    training: ask(/\b(train|training|improve)\b[^.]{0,40}\b(models?|ai|machine learning)\b/i),
    retention: (sentences.find((s) => /retain|retention|kept|keep|stor(e|ed) for|delet/i.test(s) && /\b\d+\s*(days?|months?|years?)\b/i.test(s))?.match(/\b\d+\s*(days?|months?|years?)\b/i) || [])[0] || null,
  };
}

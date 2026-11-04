import { isAiLib } from './deps.js';

export const LAYERS = [
  { id: 'ui', name: 'Frontend / UI', tier: 0, description: 'Components, pages, client state and styling' },
  { id: 'api', name: 'API / Interface', tier: 1, description: 'Routes, controllers, handlers, GraphQL/gRPC/CLI surface' },
  { id: 'ai', name: 'AI / ML', tier: 2, description: 'LLM calls, prompts, agents, embeddings, models and ML pipelines' },
  { id: 'service', name: 'Services / Domain', tier: 2, description: 'Business logic, workflows, jobs and core domain' },
  { id: 'integrations', name: 'Integrations', tier: 3, description: 'Third-party clients, adapters, SDK wrappers' },
  { id: 'data', name: 'Data / Persistence', tier: 3, description: 'Models, schemas, migrations, repositories, queries' },
  { id: 'shared', name: 'Shared / Utils', tier: 4, description: 'Helpers, common types, cross-cutting libraries' },
  { id: 'infra', name: 'Infra / DevOps', tier: 5, description: 'CI/CD, containers, IaC, deployment scripts' },
  { id: 'config', name: 'Config / Build', tier: 5, description: 'Build tooling, settings, environment configuration' },
  { id: 'tests', name: 'Tests', tier: 5, description: 'Unit, integration and end-to-end tests' },
];
export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
/** Layers that participate in the architectural direction rule (higher tier must not import lower tier). */
export const DIRECTED = new Set(['ui', 'api', 'ai', 'service', 'integrations', 'data', 'shared']);

const S = (...a) => new Set(a);
const TEST_RE = /(^|\/)(tests?|__tests__|__mocks__|specs?|e2e|cypress|playwright|testdata|fixtures|testing)\/|(\.|_)(test|spec|e2e)\.\w+$|(^|\/)test_[^/]+\.py$|_test\.go$|Tests?\.(java|kt|cs|swift)$|(^|\/)conftest\.py$/i;
const INFRA_RE = /(^|\/)(\.github|\.gitlab|\.circleci|\.buildkite|deploy|deployment|deployments|infra|infrastructure|terraform|k8s|kubernetes|helm|charts|ansible|ops|devops|docker|scripts\/deploy|\.devcontainer)\/|(^|\/)(Dockerfile[\w.-]*|docker-compose[\w.-]*\.ya?ml|compose\.ya?ml|Jenkinsfile|Procfile|\.gitlab-ci\.yml|serverless\.ya?ml|fly\.toml|vercel\.json|netlify\.toml|render\.yaml|app\.yaml|skaffold\.yaml)$|\.(tf|hcl)$/i;
const CONFIG_RE = /(^|\/)(config|configs|configuration|settings|conf)\/|(^|\/)[^/]*\.config\.(js|ts|mjs|cjs)$|(^|\/)(package\.json|tsconfig[\w.-]*\.json|pyproject\.toml|setup\.(py|cfg)|requirements[\w.-]*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|Gemfile|composer\.json|Makefile|\.env\.example|babel\.config\.\w+|\.eslintrc[\w.]*|\.prettierrc[\w.]*|settings\.py|manage\.py|wsgi\.py|asgi\.py)$/i;
const AI_DIRS = S('ai', 'ml', 'llm', 'llms', 'agents', 'agent', 'prompts', 'prompt', 'embeddings', 'embedding', 'rag', 'inference', 'training', 'train', 'nlp', 'genai', 'chains', 'vectorstore', 'vectorstores', 'retrieval', 'retriever', 'models_ml', 'notebooks', 'evals', 'eval', 'copilot', 'assistant', 'assistants', 'mcp');
const AI_FILE = /(^|[_.-])(llm|prompt|prompts|embedding|embeddings|agent|rag|openai|gpt|completion|chat_model|retriever|vector)([_.-]|$)/i;
const INTEG_DIRS = S('integrations', 'integration', 'clients', 'client_sdk', 'adapters', 'adapter', 'providers', 'connectors', 'gateways', 'gateway', 'external', 'thirdparty', 'third-party', 'sdk', 'webhooks');
const DATA_DIRS = S('data', 'models', 'model', 'entities', 'entity', 'schema', 'schemas', 'db', 'database', 'databases', 'migrations', 'migrate', 'repositories', 'repository', 'repos', 'dao', 'prisma', 'orm', 'persistence', 'store', 'stores', 'storage', 'seeds', 'seeders', 'sql', 'queries', 'dal', 'datastore', 'cache');
const API_DIRS = S('routes', 'router', 'routers', 'controllers', 'controller', 'api', 'apis', 'handlers', 'handler', 'endpoints', 'endpoint', 'graphql', 'resolvers', 'rest', 'grpc', 'rpc', 'middleware', 'middlewares', 'server', 'http', 'cmd', 'cli', 'commands', 'views', 'serializers', 'dto', 'dtos', 'trpc');
const UI_DIRS = S('components', 'component', 'pages', 'ui', 'frontend', 'client', 'web', 'screens', 'layouts', 'layout', 'styles', 'public', 'static', 'assets', 'hooks', 'widgets', 'templates', 'app', 'containers', 'stories', 'theme', 'icons');
const SERVICE_DIRS = S('services', 'service', 'domain', 'core', 'usecases', 'use_cases', 'business', 'logic', 'workers', 'worker', 'jobs', 'tasks', 'workflows', 'engine', 'features', 'modules', 'application', 'interactors', 'managers');
const SHARED_DIRS = S('utils', 'util', 'helpers', 'helper', 'common', 'shared', 'lib', 'libs', 'pkg', 'types', 'typings', 'constants', 'internal', 'support', 'tools', 'toolkit');
const UI_LIBS = /^(streamlit|gradio|dash|panel|nicegui|flet|reflex|tkinter|PyQt5|PyQt6|PySide6|kivy|textual|rich|shiny|solara|chainlit)$/;
const UI_LANG = S('js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less', 'dart', 'swift');
const UI_EXT = S('tsx', 'jsx', 'vue', 'svelte', 'css', 'scss', 'sass', 'less', 'html', 'swift', 'dart');

export function classifyFile(path, externals = []) {
  const p = path.toLowerCase();
  const segs = p.split('/');
  const dirs = segs.slice(0, -1);
  const base = segs.at(-1);
  const ext = base.includes('.') ? base.split('.').pop() : '';
  const has = (set) => dirs.some((d) => set.has(d));
  if (TEST_RE.test(path)) return 'tests';
  if (INFRA_RE.test(path)) return 'infra';
  if (CONFIG_RE.test(path)) return 'config';
  if (ext === 'ipynb' || externals.some(isAiLib) || has(AI_DIRS) || AI_FILE.test(base.replace(/\.\w+$/, ''))) return 'ai';
  if (['sql', 'prisma'].includes(ext) || /^(models?|schemas?|entities|db|database|migrations?)\.\w+$/.test(base)) return 'data';
  if (UI_EXT.has(ext) || externals.some((x) => UI_LIBS.test(x))) return 'ui';
  if (has(INTEG_DIRS)) return 'integrations';
  if (has(DATA_DIRS)) return 'data';
  if (has(API_DIRS) || /^(routes?|urls|views|controllers?|handlers?|api|server|main|app|index)\.(py|go|rb|php|java|kt|cs)$/.test(base)) return 'api';
  if (UI_LANG.has(ext) && has(UI_DIRS)) return 'ui';
  if (has(SERVICE_DIRS)) return 'service';
  if (has(SHARED_DIRS)) return 'shared';
  if (['yaml', 'yml', 'toml', 'ini', 'cfg', 'json', 'gradle'].includes(ext)) return 'config';
  if (['sh', 'bash'].includes(ext)) return 'infra';
  return 'service';
}

/** Ask the LLM to correct heuristic directory→layer assignments. Returns {dir: layerId}. */
export async function refineLayersWithLLM(llm, files, repoMeta) {
  const dirs = new Map();
  for (const f of files) {
    const parts = f.path.split('/');
    for (let d = 1; d <= Math.min(3, parts.length - 1); d++) {
      const key = parts.slice(0, d).join('/');
      const e = dirs.get(key) || { dir: key, files: 0, layers: {}, samples: [] };
      e.files++; e.layers[f.layer] = (e.layers[f.layer] || 0) + 1;
      if (e.samples.length < 4) e.samples.push(parts.at(-1));
      dirs.set(key, e);
    }
  }
  const list = [...dirs.values()].sort((a, b) => b.files - a.files).slice(0, 140).map((e) => ({
    dir: e.dir, files: e.files, currentLayer: Object.entries(e.layers).sort((a, b) => b[1] - a[1])[0][0], samples: e.samples,
  }));
  const res = await llm.json(
    'You are a software architect. You classify repository directories into architecture layers. Only output corrections where the current heuristic layer is clearly wrong. An override applies to that directory\'s own files and to sub-directories that are not listed separately, so never override a wrapper/root directory just because of one entry-point file. Respond with JSON only.',
    JSON.stringify({
      repo: { name: repoMeta.full_name, description: repoMeta.description, language: repoMeta.language },
      layers: LAYERS.map(({ id, description }) => ({ id, description })),
      directories: list,
      outputSchema: { overrides: { '<dir>': '<layer id>' }, architectureNotes: 'one sentence describing the architecture style you see' },
    }),
    { effort: 'minimal', fast: true, agent: 'Layer Architect' }
  );
  const valid = new Set(LAYERS.map((l) => l.id));
  const overrides = {};
  for (const [d, l] of Object.entries(res?.overrides || {})) if (valid.has(l) && dirs.has(d)) overrides[d] = l;
  return { overrides, listed: list.map((d) => d.dir), notes: res?.architectureNotes || '' };
}

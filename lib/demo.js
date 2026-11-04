// Synthetic but realistic analysis of a fictional e-commerce monorepo with an AI layer.
// Runs through the same assemble()/forecast() code as a real analysis, so the numbers behave identically.
import { assemble } from './pipeline.js';
import { LAYER_BY_ID } from './layers.js';
import { scoreSecurity, mitreRollup, posture } from './security.js';
import { technique } from './mitre.js';

const L = (id, o) => ({ ...LAYER_BY_ID[id], suppressions: 0, filesInCycles: 0, violations: 0, externals: [], todoSamples: [], ...o });
const hs = (path, layer, score, loc, complexity, todos, fanIn, reasons, tested = false) => ({ path, layer, score, loc, complexity, todos, fanIn, fanOut: Math.round(fanIn / 2) + 3, tested, reasons });
const mod = (layer, path, files, loc, score, hot = 0) => ({ id: `${layer}::${path}`, path, layer, files, loc, score, hot, todos: Math.round(score / 12), complexity: Math.round(loc / 9), untested: Math.round(files * score / 120), code: files });
const d = (label, detail, points) => ({ label, detail, points });

const HOT = {
  ui: [hs('apps/web/src/features/checkout/CheckoutPage.tsx', 'ui', 91, 1340, 212, 6, 4, ['1340 LOC (top 1%)', '212 branch points', '6 TODO/FIXME', 'no linked tests']), hs('apps/web/src/store/cartSlice.ts', 'ui', 78, 620, 96, 2, 31, ['imported by 31 files', '9 `any` casts', 'no linked tests']), hs('apps/web/src/components/ProductGrid.tsx', 'ui', 64, 480, 71, 1, 12, ['nesting depth 7'], true), hs('apps/web/src/features/assistant/ChatWidget.tsx', 'ui', 61, 410, 58, 3, 2, ['3 TODO/FIXME', 'no linked tests'])],
  api: [hs('services/api/src/routes/orders.ts', 'api', 84, 910, 154, 4, 6, ['910 LOC (top 2%)', '154 branch points', '4 TODO/FIXME'], true), hs('services/api/src/middleware/auth.ts', 'api', 72, 340, 63, 2, 38, ['imported by 38 files', '2 lint/type suppressions'], true), hs('services/api/src/routes/assistant.ts', 'api', 69, 380, 52, 3, 2, ['in a circular import', 'no linked tests'])],
  ai: [hs('services/recs/recs/pipeline.py', 'ai', 93, 1120, 188, 9, 7, ['1120 LOC (top 1%)', '188 branch points', '9 TODO/FIXME', 'in a circular import', 'no linked tests']), hs('services/api/src/ai/prompts.ts', 'ai', 81, 560, 44, 5, 9, ['5 TODO/FIXME', 'inline prompt strings (17)', 'no linked tests']), hs('services/recs/recs/embeddings.py', 'ai', 74, 430, 61, 3, 11, ['imported by 11 files', '3 # type: ignore', 'no linked tests']), hs('services/api/src/ai/agent.ts', 'ai', 70, 390, 66, 2, 4, ['nesting depth 8', 'hard-coded model ids'])],
  service: [hs('services/api/src/services/pricing.ts', 'service', 88, 1010, 201, 5, 14, ['1010 LOC (top 1%)', '201 branch points', 'imported by 14 files'], true), hs('services/api/src/services/orderService.ts', 'service', 76, 720, 118, 3, 9, ['in a circular import', '3 TODO/FIXME'], true), hs('services/api/src/jobs/syncInventory.ts', 'service', 63, 410, 77, 4, 1, ['4 TODO/FIXME', 'no linked tests'])],
  integrations: [hs('services/api/src/integrations/stripe/client.ts', 'integrations', 71, 520, 82, 3, 7, ['3 TODO/FIXME', 'legacy charges API']), hs('services/api/src/integrations/shippo.ts', 'integrations', 55, 300, 40, 2, 3, ['no linked tests'])],
  data: [hs('services/api/src/db/models/order.ts', 'data', 73, 610, 54, 2, 27, ['imported by 27 files', 'imports from Services (upward)']), hs('services/api/prisma/schema.prisma', 'data', 58, 820, 0, 1, 0, ['820 LOC']), hs('services/api/src/db/repositories/productRepo.ts', 'data', 52, 290, 47, 1, 12, ['raw SQL string building'])],
  shared: [hs('packages/shared/src/utils/money.ts', 'shared', 66, 280, 61, 1, 44, ['imported by 44 files', 'float arithmetic on currency']), hs('packages/shared/src/types/index.ts', 'shared', 48, 510, 0, 0, 71, ['imported by 71 files'])],
  infra: [hs('infra/terraform/main.tf', 'infra', 45, 640, 0, 2, 0, ['640 LOC', '2 TODO'])],
};

const layers = [
  L('ui', { files: 214, loc: 28400, todos: 61, complexity: 3900, coverage: 0.38, filesInCycles: 6, staticScore: 52, staticDrivers: [d('Test gap', '38% of files have linked tests', 12), d('Branching complexity', '137 branch points per kLOC', 10), d('Oversized files', '9 files over 500 LOC', 9), d('TODO / FIXME density', '61 markers · 2.1 per kLOC', 7), d('Suppressions & any-casts', '74 suppressions', 6), d('Circular imports', '6 files in import cycles', 5)], externals: [{ name: 'react', count: 190 }, { name: 'next', count: 64 }, { name: '@reduxjs/toolkit', count: 22 }, { name: 'ai', count: 3 }], todoSamples: [{ file: 'apps/web/src/features/checkout/CheckoutPage.tsx', line: 412, text: '// TODO: remove legacy coupon flow after Q3 — still used by 4% of carts' }, { file: 'apps/web/src/features/assistant/ChatWidget.tsx', line: 88, text: '// HACK: stream parsing duplicated from api/assistant until shared SDK exists' }] }),
  L('api', { files: 96, loc: 14100, todos: 22, complexity: 2300, coverage: 0.61, filesInCycles: 4, violations: 0, staticScore: 38, staticDrivers: [d('Branching complexity', '163 branch points per kLOC', 11), d('Test gap', '61% of files have linked tests', 8), d('Circular imports', '4 files in import cycles', 7), d('TODO / FIXME density', '22 markers · 1.6 per kLOC', 4), d('Oversized files', '3 files over 500 LOC', 4), d('Coupling', 'depends on 5 other layers', 3)], externals: [{ name: 'fastify', count: 40 }, { name: 'zod', count: 36 }, { name: 'jsonwebtoken', count: 4 }] }),
  L('ai', { files: 58, loc: 9800, todos: 47, complexity: 1650, coverage: 0.12, filesInCycles: 9, violations: 1, suppressions: 31, staticScore: 66, staticDrivers: [d('Test gap', '12% of files have linked tests', 18), d('TODO / FIXME density', '47 markers · 4.8 per kLOC', 9), d('Circular imports', '9 files in import cycles', 10), d('Branching complexity', '168 branch points per kLOC', 11), d('Layering violations', '→ API / Interface (6)', 7), d('Suppressions & any-casts', '31 suppressions', 6), d('Oversized files', '4 files over 500 LOC', 5)], externals: [{ name: 'openai', count: 14 }, { name: 'langchain', count: 9 }, { name: 'numpy', count: 8 }, { name: 'faiss', count: 3 }, { name: 'pgvector', count: 2 }], todoSamples: [{ file: 'services/recs/recs/pipeline.py', line: 233, text: '# TODO: evals — we have no offline metric for re-ranking quality' }, { file: 'services/api/src/ai/prompts.ts', line: 41, text: '// FIXME: system prompt duplicated in agent.ts and assistant route' }, { file: 'services/recs/recs/embeddings.py', line: 17, text: '# HACK: re-embed whole catalog nightly; incremental not implemented' }] }),
  L('service', { files: 121, loc: 19600, todos: 38, complexity: 3400, coverage: 0.54, filesInCycles: 7, violations: 0, staticScore: 49, staticDrivers: [d('Branching complexity', '173 branch points per kLOC', 13), d('Test gap', '54% of files have linked tests', 9), d('Circular imports', '7 files in import cycles', 8), d('Oversized files', '5 files over 500 LOC', 7), d('TODO / FIXME density', '38 markers · 1.9 per kLOC', 6), d('Coupling', 'depends on 4 other layers', 2)], externals: [{ name: 'bullmq', count: 12 }, { name: 'decimal.js', count: 3 }] }),
  L('integrations', { files: 34, loc: 4300, todos: 19, complexity: 610, coverage: 0.29, staticScore: 44, staticDrivers: [d('Test gap', '29% of files have linked tests', 14), d('TODO / FIXME density', '19 markers · 4.4 per kLOC', 9), d('Branching complexity', '142 branch points per kLOC', 8), d('Suppressions & any-casts', '12 suppressions', 5)], externals: [{ name: 'stripe', count: 9 }, { name: '@slack/web-api', count: 3 }, { name: 'shippo', count: 2 }] }),
  L('data', { files: 72, loc: 8700, todos: 11, complexity: 790, coverage: 0.47, filesInCycles: 3, violations: 1, staticScore: 41, staticDrivers: [d('Layering violations', '→ Services / Domain (9)', 10), d('Test gap', '47% of files have linked tests', 10), d('Circular imports', '3 files in import cycles', 6), d('Oversized files', '2 files over 500 LOC', 4)], externals: [{ name: '@prisma/client', count: 31 }, { name: 'pg', count: 4 }, { name: 'ioredis', count: 5 }] }),
  L('shared', { files: 48, loc: 5200, todos: 6, complexity: 520, coverage: 0.71, staticScore: 24, staticDrivers: [d('Test gap', '71% of files have linked tests', 6), d('Branching complexity', '100 branch points per kLOC', 5), d('Coupling', 'imported by every layer', 4)], externals: [{ name: 'zod', count: 14 }, { name: 'date-fns', count: 6 }] }),
  L('infra', { files: 39, loc: 3100, todos: 9, complexity: 0, coverage: null, staticScore: 22, staticDrivers: [d('TODO / FIXME density', '9 markers · 2.9 per kLOC', 7), d('Oversized files', '1 file over 500 LOC', 4)], externals: [] }),
  L('config', { files: 41, loc: 2100, todos: 2, complexity: 0, coverage: null, staticScore: 9, staticDrivers: [d('Coupling', 'build config fan-out', 3)], externals: [] }),
  L('tests', { files: 233, loc: 21900, todos: 14, complexity: 1800, coverage: null, staticScore: 18, staticDrivers: [d('TODO / FIXME density', '14 skipped/flaky markers', 6), d('Branching complexity', 'fixtures with logic', 4)], externals: [{ name: 'vitest', count: 180 }, { name: 'pytest', count: 31 }, { name: '@playwright/test', count: 22 }] }),
];
const MODS = {
  ui: [mod('ui', 'apps/web/src/features/checkout', 28, 6200, 78, 2), mod('ui', 'apps/web/src/features/catalog', 41, 7100, 44, 1), mod('ui', 'apps/web/src/features/assistant', 12, 1900, 69, 1), mod('ui', 'apps/web/src/components', 74, 8300, 36), mod('ui', 'apps/web/src/store', 18, 2600, 61, 1), mod('ui', 'apps/web/src/hooks', 23, 1400, 28), mod('ui', 'apps/web/src/pages', 18, 900, 22)],
  api: [mod('api', 'services/api/src/routes', 34, 6100, 58, 2), mod('api', 'services/api/src/middleware', 14, 1900, 41, 1), mod('api', 'services/api/src/graphql', 26, 3800, 33), mod('api', 'services/api/src/dto', 22, 2300, 18)],
  ai: [mod('ai', 'services/recs/recs', 21, 4700, 84, 2), mod('ai', 'services/api/src/ai', 17, 2900, 72, 2), mod('ai', 'services/recs/notebooks', 9, 1400, 63), mod('ai', 'services/recs/evals', 3, 200, 40), mod('ai', 'services/api/src/ai/tools', 8, 600, 55)],
  service: [mod('service', 'services/api/src/services', 52, 10400, 62, 2), mod('service', 'services/api/src/jobs', 27, 4300, 51, 1), mod('service', 'services/api/src/domain', 42, 4900, 34)],
  integrations: [mod('integrations', 'services/api/src/integrations/stripe', 12, 1900, 61, 1), mod('integrations', 'services/api/src/integrations', 22, 2400, 39)],
  data: [mod('data', 'services/api/src/db/models', 31, 3900, 52, 1), mod('data', 'services/api/src/db/repositories', 24, 2700, 41), mod('data', 'services/api/prisma', 17, 2100, 30)],
  shared: [mod('shared', 'packages/shared/src/utils', 21, 2300, 31, 1), mod('shared', 'packages/shared/src/types', 27, 2900, 14)],
  infra: [mod('infra', 'infra/terraform', 14, 1800, 30), mod('infra', '.github/workflows', 11, 700, 18), mod('infra', 'infra/k8s', 14, 600, 15)],
  config: [mod('config', '(root)', 41, 2100, 9)],
  tests: [mod('tests', 'apps/web/tests', 98, 9100, 15), mod('tests', 'services/api/tests', 104, 10600, 20), mod('tests', 'services/recs/tests', 31, 2200, 26)],
};
for (const l of layers) { l.hotspots = HOT[l.id] || []; l.modules = MODS[l.id] || []; }

const E = (source, target, weight, violation = false) => ({ source, target, weight, violation, samples: [] });
const edges = [
  E('ui', 'api', 46), E('ui', 'shared', 88), E('ui', 'ai', 4), E('api', 'service', 71), E('api', 'ai', 22), E('api', 'data', 18), E('api', 'shared', 40),
  E('ai', 'data', 19), E('ai', 'integrations', 7), E('ai', 'shared', 15), E('ai', 'api', 6, true), E('service', 'data', 64), E('service', 'integrations', 31),
  E('service', 'ai', 14), E('service', 'shared', 52), E('integrations', 'shared', 11), E('data', 'shared', 23), E('data', 'service', 9, true),
  E('tests', 'ui', 98), E('tests', 'api', 80), E('tests', 'service', 76), E('tests', 'ai', 9), E('infra', 'config', 6),
].map((e, _, all) => ({ ...e, bidirectional: all.some((o) => o.source === e.target && o.target === e.source) }));

const moduleEdges = [
  ['ui::apps/web/src/features/checkout', 'ui::apps/web/src/store', 24], ['ui::apps/web/src/features/checkout', 'ui::apps/web/src/components', 31], ['ui::apps/web/src/features/catalog', 'ui::apps/web/src/components', 44], ['ui::apps/web/src/features/catalog', 'ui::apps/web/src/store', 12], ['ui::apps/web/src/features/assistant', 'ui::apps/web/src/components', 8], ['ui::apps/web/src/store', 'ui::apps/web/src/features/checkout', 5], ['ui::apps/web/src/pages', 'ui::apps/web/src/features/catalog', 9], ['ui::apps/web/src/pages', 'ui::apps/web/src/features/checkout', 6], ['ui::apps/web/src/components', 'ui::apps/web/src/hooks', 19],
  ['api::services/api/src/routes', 'api::services/api/src/middleware', 30], ['api::services/api/src/routes', 'api::services/api/src/dto', 26], ['api::services/api/src/graphql', 'api::services/api/src/dto', 18], ['api::services/api/src/graphql', 'api::services/api/src/middleware', 7],
  ['ai::services/api/src/ai', 'ai::services/api/src/ai/tools', 11], ['ai::services/api/src/ai/tools', 'ai::services/api/src/ai', 4], ['ai::services/recs/notebooks', 'ai::services/recs/recs', 14], ['ai::services/recs/evals', 'ai::services/recs/recs', 3],
  ['service::services/api/src/jobs', 'service::services/api/src/services', 22], ['service::services/api/src/services', 'service::services/api/src/domain', 40], ['service::services/api/src/domain', 'service::services/api/src/services', 6],
  ['integrations::services/api/src/integrations', 'integrations::services/api/src/integrations/stripe', 5],
  ['data::services/api/src/db/repositories', 'data::services/api/src/db/models', 21], ['data::services/api/src/db/models', 'data::services/api/prisma', 15],
  ['shared::packages/shared/src/utils', 'shared::packages/shared/src/types', 17],
  ['infra::infra/k8s', 'infra::infra/terraform', 3], ['infra::.github/workflows', 'infra::infra/k8s', 4],
  // cross-layer module edges (shown as stubs in drill-down)
  ['ui::apps/web/src/features/checkout', 'api::services/api/src/routes', 9], ['ui::apps/web/src/features/assistant', 'ai::services/api/src/ai', 4], ['api::services/api/src/routes', 'service::services/api/src/services', 38], ['api::services/api/src/routes', 'ai::services/api/src/ai', 14], ['ai::services/api/src/ai', 'api::services/api/src/routes', 6], ['ai::services/recs/recs', 'data::services/api/src/db/models', 12], ['service::services/api/src/services', 'data::services/api/src/db/repositories', 33], ['service::services/api/src/services', 'integrations::services/api/src/integrations/stripe', 14], ['data::services/api/src/db/models', 'service::services/api/src/services', 9], ['service::services/api/src/services', 'ai::services/recs/recs', 8],
].map(([source, target, weight]) => ({ source, target, weight }));

const cycles = [
  { size: 7, layers: ['ai', 'api'], files: ['services/api/src/routes/assistant.ts', 'services/api/src/ai/agent.ts', 'services/api/src/ai/tools/orderLookup.ts', 'services/api/src/routes/orders.ts'] },
  { size: 5, layers: ['service', 'data'], files: ['services/api/src/services/orderService.ts', 'services/api/src/db/models/order.ts', 'services/api/src/services/pricing.ts'] },
  { size: 3, layers: ['ui'], files: ['apps/web/src/store/cartSlice.ts', 'apps/web/src/features/checkout/useCheckout.ts', 'apps/web/src/features/checkout/CheckoutPage.tsx'] },
];

const I = (layer, category, severity, title, detail, file, fix, compounding, source = 'ai') => ({ layer, category, severity, title, detail, file, fix, compounding, source });
const prs = [
  {
    number: 482, title: 'feat(assistant): agentic order support with tool calling', author: 'mira-dev', draft: false, ageDays: 9, additions: 1460, deletions: 120, fileCount: 23, layers: ['ai', 'api', 'ui', 'service'], primaryLayer: 'ai', labels: ['feature', 'ai'],
    files: [{ path: 'services/api/src/ai/agent.ts', layer: 'ai', status: 'modified', additions: 410, deletions: 60 }, { path: 'services/api/src/ai/tools/refund.ts', layer: 'ai', status: 'added', additions: 220, deletions: 0 }, { path: 'services/api/src/routes/assistant.ts', layer: 'api', status: 'modified', additions: 190, deletions: 30 }, { path: 'apps/web/src/features/assistant/ChatWidget.tsx', layer: 'ui', status: 'modified', additions: 260, deletions: 20 }, { path: 'services/api/src/services/orderService.ts', layer: 'service', status: 'modified', additions: 85, deletions: 10 }],
    items: [
      I('ai', 'AI/Prompt', 5, 'Refund tool callable without human confirmation', 'tools/refund.ts executes stripe.refunds.create directly from model output; only guard is a prompt instruction "never refund > $200".', 'services/api/src/ai/tools/refund.ts', 'Enforce limits in code, require a confirmation step, log every tool call with the model trace.', 'Every new tool will copy this pattern; one prompt-injection = real money moved.'),
      I('ai', 'Testing', 4, 'No evals for tool selection', 'Agent behaviour changed (5 new tools) but services/recs/evals has nothing for the assistant; zero tests added for agent.ts.', 'services/api/src/ai/agent.ts', 'Add golden-transcript evals and a tool-routing test suite to CI.', 'Each prompt tweak becomes a blind production experiment.'),
      I('ai', 'AI/Prompt', 3, 'System prompt now forked in 3 places', 'agent.ts adds a third copy of the support persona alongside prompts.ts and routes/assistant.ts.', 'services/api/src/ai/agent.ts', 'Single versioned prompt registry.', 'Copies drift; fixes land in one and not the others.'),
      I('api', 'Architecture', 3, 'Deepens api ↔ ai import cycle', 'routes/assistant.ts imports agent.ts which now imports routes/orders.ts helpers for tool execution.', 'services/api/src/routes/assistant.ts', 'Move order lookup into the service layer and inject it as a tool dependency.', 'Cycle blocks extracting the AI layer into its own service.'),
      I('ui', 'Code quality', 2, 'Streaming parser duplicated client-side', 'ChatWidget.tsx re-implements SSE chunk parsing (≈80 lines) that already exists server-side.', 'apps/web/src/features/assistant/ChatWidget.tsx', 'Use the ai SDK useChat hook or a shared parser.', ''),
      I('ai', 'Process', 3, 'Oversized change (1,580 lines)', 'Reviews of very large diffs miss design problems; defects ship as debt.', null, 'Split into stacked PRs by layer.', '', 'heuristic'),
      I('ai', 'AI/Prompt', 2, "Hard-coded model id 'gpt-4.1-mini'", 'Model upgrades/deprecations require code changes everywhere it is pinned.', 'services/api/src/ai/agent.ts', 'Read model ids from config with a fallback chain.', '', 'heuristic'),
    ],
    paydown: [], conflicts: [{ number: 497, files: ['services/api/src/services/orderService.ts'] }], risk: 86, pMerge: 0.72,
    summary: 'Turns the support chatbot into a tool-calling agent that can look up orders and issue refunds. Ships significant AI-layer debt: unguarded side-effecting tools, no evals and a third copy of the system prompt.',
    forecast: 'If merged as-is the AI layer becomes the riskiest in the repo within a quarter: each new tool inherits the unguarded pattern, and the api↔ai cycle makes the planned recs-service extraction (SHOP-311) materially harder.',
    mergeAdvice: 'rework', analyzedBy: 'ai',
  },
  {
    number: 497, title: 'Pricing: regional tax + promo stacking', author: 'deepak-r', draft: false, ageDays: 21, additions: 840, deletions: 210, fileCount: 14, layers: ['service', 'data', 'ui'], primaryLayer: 'service', labels: ['payments'],
    files: [{ path: 'services/api/src/services/pricing.ts', layer: 'service', status: 'modified', additions: 380, deletions: 140 }, { path: 'services/api/src/db/models/order.ts', layer: 'data', status: 'modified', additions: 60, deletions: 10 }, { path: 'services/api/prisma/migrations/20261020_tax/migration.sql', layer: 'data', status: 'added', additions: 44, deletions: 0 }, { path: 'apps/web/src/features/checkout/CheckoutPage.tsx', layer: 'ui', status: 'modified', additions: 120, deletions: 30 }],
    items: [
      I('service', 'Code quality', 4, 'pricing.ts grows to 1,250 LOC', 'Tax and promo rules added as nested if/else in calculateTotal() (cyclomatic ≈ 60).', 'services/api/src/services/pricing.ts', 'Extract a rule pipeline (TaxRule, PromoRule) with unit tests per rule.', 'Every new market multiplies branches; the hottest file in the repo keeps heating.'),
      I('data', 'Architecture', 3, 'Domain logic leaks into Order model', 'order.ts now imports pricing helpers to compute totals in a Prisma middleware — upward dependency data → service.', 'services/api/src/db/models/order.ts', 'Compute totals in the service; persist results only.', ''),
      I('ui', 'Code quality', 2, 'Tax display logic duplicated in checkout', 'CheckoutPage.tsx re-derives VAT for display instead of using the API breakdown.', 'apps/web/src/features/checkout/CheckoutPage.tsx', 'Render the server-computed breakdown.', 'Client and server totals will disagree for some regions.'),
      I('service', 'Testing', 3, 'Float math for currency', 'Uses Number multiplication for tax rates; money.ts helpers bypassed.', 'services/api/src/services/pricing.ts', 'Use decimal.js via packages/shared money utils.', '', 'heuristic'),
      I('service', 'Process', 2, 'Overlaps 1 other open PR', '#482: services/api/src/services/orderService.ts', null, 'Sequence these merges.', '', 'heuristic'),
    ],
    paydown: [{ layer: 'data', title: 'Adds missing index on orders(region, created_at)', detail: 'migration.sql' }], conflicts: [{ number: 482, files: ['services/api/src/services/orderService.ts'] }], risk: 71, pMerge: 0.8,
    summary: 'Adds regional tax and stackable promotions to the pricing engine. Functionally sound, but concentrates more branching in the repo\'s top hotspot and introduces a data→service dependency.',
    forecast: 'Pricing becomes the bottleneck for every checkout change; expect review time on pricing.ts to double and regressions in promo combinations within 2 releases.', mergeAdvice: 'merge-with-fixes', analyzedBy: 'ai',
  },
  {
    number: 503, title: 'recs: switch embeddings to text-embedding-3-large + pgvector', author: 'li-wen', draft: true, ageDays: 34, additions: 620, deletions: 380, fileCount: 11, layers: ['ai', 'data', 'infra'], primaryLayer: 'ai', labels: ['ai', 'migration'],
    files: [{ path: 'services/recs/recs/embeddings.py', layer: 'ai', status: 'modified', additions: 210, deletions: 160 }, { path: 'services/recs/recs/pipeline.py', layer: 'ai', status: 'modified', additions: 140, deletions: 90 }, { path: 'services/api/prisma/migrations/20261001_vectors/migration.sql', layer: 'data', status: 'added', additions: 38, deletions: 0 }, { path: 'infra/terraform/rds.tf', layer: 'infra', status: 'modified', additions: 22, deletions: 4 }],
    items: [
      I('ai', 'Architecture', 4, 'Dual vector stores during migration', 'FAISS path kept behind USE_PGVECTOR flag with no removal date; pipeline.py now branches on store type in 6 places.', 'services/recs/recs/pipeline.py', 'Add a VectorStore interface and a dated cleanup ticket.', 'Flags without expiry become permanent forks.'),
      I('ai', 'Performance', 3, 'Full catalog re-embed on deploy', 'Migration re-embeds 1.2M products synchronously; no batching/backoff on rate limits.', 'services/recs/recs/embeddings.py', 'Batch with checkpoints and idempotent upserts.', ''),
      I('data', 'Dependency', 2, 'pgvector extension pinned in migration only', 'Terraform does not declare the extension; fresh environments fail.', 'infra/terraform/rds.tf', 'Manage extension in IaC.', ''),
      I('ai', 'Process', 2, 'Stale for 34 days (draft)', 'Long-lived branches accumulate rebase debt.', null, 'Merge, split, or close.', '', 'heuristic'),
    ],
    paydown: [{ layer: 'ai', title: 'Removes hand-rolled cosine similarity', detail: 'Deletes 120 lines of numpy similarity code in favour of DB operator.' }], conflicts: [], risk: 58, pMerge: 0.31,
    summary: 'Migrates recommendation embeddings to a larger model stored in Postgres. Pays down some custom code but introduces an open-ended dual-store period.',
    forecast: 'Low merge probability while draft; if it stalls, every recs change must be made twice (FAISS + pgvector).', mergeAdvice: 'merge-with-fixes', analyzedBy: 'ai',
  },
  {
    number: 508, title: 'chore: upgrade stripe-node to v17 and remove legacy charges API', author: 'sam-k', draft: false, ageDays: 4, additions: 260, deletions: 690, fileCount: 9, layers: ['integrations', 'service', 'tests'], primaryLayer: 'integrations', labels: ['tech-debt'],
    files: [{ path: 'services/api/src/integrations/stripe/client.ts', layer: 'integrations', status: 'modified', additions: 120, deletions: 410 }, { path: 'services/api/tests/stripe.test.ts', layer: 'tests', status: 'modified', additions: 90, deletions: 40 }],
    items: [I('integrations', 'Testing', 2, 'Webhook signature path untested', 'New constructEvent usage has no negative test.', 'services/api/src/integrations/stripe/client.ts', 'Add a tampered-payload test.', '')],
    paydown: [{ layer: 'integrations', title: 'Removes deprecated Charges API', detail: '−410 lines of legacy code' }, { layer: 'service', title: 'Drops dual payment path in orderService', detail: '' }, { layer: 'integrations', title: 'Upgrades SDK 3 majors', detail: '' }], conflicts: [], risk: 14, pMerge: 0.9,
    summary: 'Upgrades Stripe SDK and deletes the legacy charges path. Net paydown — one of the healthiest PRs open.', forecast: 'Reduces integrations debt index by ~8 points once merged.', mergeAdvice: 'merge', analyzedBy: 'ai',
  },
  {
    number: 471, title: 'WIP: new design system tokens + Button rewrite', author: 'ana-ux', draft: true, ageDays: 97, additions: 2300, deletions: 900, fileCount: 88, layers: ['ui', 'config'], primaryLayer: 'ui', labels: ['design-system'],
    files: [{ path: 'apps/web/src/components/Button.tsx', layer: 'ui', status: 'modified', additions: 210, deletions: 140 }, { path: 'apps/web/src/theme/tokens.ts', layer: 'ui', status: 'added', additions: 480, deletions: 0 }],
    items: [
      I('ui', 'Process', 4, 'Stale for 97 days', '88 files touched; main has moved 400+ commits. Rebase will be painful.', null, 'Land tokens first, migrate components incrementally.', 'Every week adds more conflict surface with checkout work.', 'heuristic'),
      I('ui', 'Architecture', 3, 'Two theming systems coexist', 'tokens.ts introduced while legacy styled-components theme stays; components pick either.', 'apps/web/src/theme/tokens.ts', 'Codemod + lint rule banning legacy theme imports.', ''),
      I('ui', 'Code quality', 2, 'Adds 14 eslint-disable comments', 'Mostly react-hooks/exhaustive-deps.', 'apps/web/src/components/Button.tsx', 'Fix effect dependencies.', '', 'heuristic'),
    ],
    paydown: [{ layer: 'ui', title: 'Consolidates 4 button variants', detail: '' }], conflicts: [{ number: 497, files: ['apps/web/src/features/checkout/CheckoutPage.tsx'] }], risk: 62, pMerge: 0.15,
    summary: 'Large, long-lived design-system rewrite. Valuable direction but the branch itself is now debt.', forecast: 'At current drift the PR will be cheaper to redo than to rebase within ~30 days.', mergeAdvice: 'rework', analyzedBy: 'ai',
  },
  {
    number: 511, title: 'fix: N+1 query on order history', author: 'deepak-r', draft: false, ageDays: 2, additions: 70, deletions: 45, fileCount: 3, layers: ['data', 'api'], primaryLayer: 'data', labels: ['bug', 'performance'],
    files: [{ path: 'services/api/src/db/repositories/orderRepo.ts', layer: 'data', status: 'modified', additions: 50, deletions: 40 }],
    items: [I('data', 'Code quality', 1, 'Raw SQL fragment for include', 'Uses $queryRawUnsafe for the join.', 'services/api/src/db/repositories/orderRepo.ts', 'Use Prisma include or a typed query builder.', '')],
    paydown: [{ layer: 'data', title: 'Removes N+1 query', detail: '' }], conflicts: [], risk: 12, pMerge: 0.92,
    summary: 'Fixes an N+1 on order history. Small, tested, slight raw-SQL smell.', forecast: 'Net neutral to slightly positive.', mergeAdvice: 'merge', analyzedBy: 'ai',
  },
].map((p) => ({ ...p, url: `https://github.com/acme/shopflow/pull/${p.number}`, createdAt: new Date(Date.now() - p.ageDays * 864e5).toISOString() }));

const T = (key, title, layers, delta, risk, category, rationale, mitigation, status = 'To Do', type = 'Story') => ({ key, title, layers, delta, risk, category, rationale, mitigation, status, type, source: 'jira', url: `https://acme.atlassian.net/browse/${key}`, labels: [] });
const tasks = [
  T('SHOP-311', 'Extract recommendations into standalone recs-service with its own API', ['ai', 'api', 'infra'], -14, 40, 'Paydown', 'Breaks the api↔ai cycle and isolates the riskiest layer — but only if #482 does not deepen the cycle first.', 'Sequence after fixing #482 tool wiring.'),
  T('SHOP-318', 'AI shopping assistant: add "compare products" and "apply coupon" tools (deadline: Black Friday)', ['ai', 'service', 'ui'], 22, 82, 'High accrual', 'Deadline-driven expansion of the unguarded tool pattern from #482; touches pricing hotspot via coupons.', 'Require tool-guard framework + evals as acceptance criteria.', 'In Progress'),
  T('SHOP-322', 'Quick fix: hard-code EU VAT rates until tax provider integrated', ['service'], 18, 74, 'High accrual', 'Explicitly temporary, lands in pricing.ts (top hotspot).', 'Put rates in config with an expiry ticket.'),
  T('SHOP-301', 'Prompt registry + offline eval harness', ['ai', 'tests'], -18, 25, 'Paydown', 'Directly addresses the 3 forked system prompts and 12% AI test coverage.', 'Pull forward — it de-risks SHOP-318.'),
  T('SHOP-327', 'Personalised homepage using recs embeddings (POC)', ['ai', 'ui', 'data'], 14, 66, 'High accrual', 'POC on a layer that is mid-migration (#503) — will bind UI to the FAISS path.', 'Wait for pgvector or code against the VectorStore interface.'),
  T('SHOP-330', 'Migrate checkout to new design tokens', ['ui'], -6, 45, 'Paydown', 'Paydown of theme duplication, but blocked by stale #471.', 'Split #471 first.'),
  T('SHOP-334', 'Add Klarna as payment method', ['integrations', 'service', 'ui'], 12, 58, 'Accrual', 'Second payment provider without a provider abstraction — orderService already branches on provider.', 'Introduce PaymentProvider port before adding Klarna.'),
  T('SHOP-336', 'Inventory sync: move cron job to event-driven queue', ['service', 'infra'], -8, 35, 'Paydown', 'Replaces polling job with 4 TODOs; reduces drift.', ''),
  T('SHOP-340', 'Increase API rate limits for partners (manual allow-list)', ['api', 'config'], 7, 48, 'Accrual', 'Manual allow-list in config tends to rot.', 'Store in DB with admin UI.'),
  T('SHOP-342', 'GDPR: delete user data across all services', ['data', 'ai', 'service'], 9, 61, 'Accrual', 'Embeddings and chat transcripts are not keyed by user — deletion will be bolted on.', 'Add user_id lineage to vector rows first.'),
  T('DOC-1', 'Design doc: Multi-agent support (router agent → specialist agents)', ['ai', 'api'], 16, 77, 'High accrual', 'Design doc proposes 4 agents sharing one prompt file and no eval plan.', 'Add an evaluation & rollback section to the doc.', 'Planned', 'Doc item'),
];
const backlog = {
  tasks, sources: ['Jira (10)', 'Design doc: assistant-v2.md (1)'], designDocs: [{ path: 'docs/design/assistant-v2.md', size: 9200 }],
  overview: {
    summary: 'The next quarter is dominated by AI-assistant expansion (SHOP-318, DOC-1, SHOP-327) that builds on the unguarded tool pattern in #482. Two strong paydown items exist (SHOP-301 prompt registry, SHOP-311 recs extraction) but are scheduled after the work they would de-risk. Pricing receives a temporary hard-code (SHOP-322) on top of #497.',
    themes: [
      { name: 'Agentic AI expansion', layers: ['ai', 'api', 'ui'], impact: 'accrual', detail: '3 items add tools/agents with no guard or eval framework in place.' },
      { name: 'Pricing under deadline', layers: ['service'], impact: 'accrual', detail: 'Hard-coded VAT + promo stacking land in the #1 hotspot.' },
      { name: 'AI platform hardening', layers: ['ai', 'tests'], impact: 'paydown', detail: 'Prompt registry and recs extraction would cut AI debt ~30%.' },
      { name: 'Second payment provider', layers: ['integrations', 'service'], impact: 'accrual', detail: 'No provider abstraction yet.' },
    ],
    forecast: 'Without re-sequencing, the AI layer crosses the critical threshold (~80) around day 45. Pulling SHOP-301 ahead of SHOP-318 keeps it under 70.',
    missingWork: ['No ticket to break the service ↔ data cycle (orderService ↔ order model).', 'No paydown planned for checkout hotspot CheckoutPage.tsx (1,340 LOC).', 'No owner for flaky/skipped tests in services/recs.'],
  },
};

const NARR = {
  ui: 'Checkout is the weak point: CheckoutPage.tsx (1,340 LOC) and a 3-file store cycle. Inherits pressure from the API and a little from AI via the chat widget. The stale design-system PR (#471) is itself debt — split it or close it.',
  api: 'Moderately healthy, but routes/assistant.ts sits in a 7-file cycle with the AI layer. Every AI change ripples into the API surface; break the cycle by moving order lookups into services.',
  ai: 'Highest debt and fastest-growing layer: 12% tests, 3 forked prompts, no evals, and #482 adds side-effecting tools without code-level guards. It also has the widest blast radius growth as UI and services start calling it directly.',
  service: 'pricing.ts is the repo\'s #1 hotspot and #497 + SHOP-322 both pile onto it. A rule-pipeline refactor would remove most of the projected growth.',
  integrations: 'Improving: #508 removes the legacy Stripe path. Klarna (SHOP-334) will undo that unless a PaymentProvider port lands first.',
  data: 'Stable core, but the Order model imports pricing (data → service violation) and #497 adds more of it. GDPR deletion work will expose missing user lineage.',
  shared: 'Healthy and well tested; money.ts is bypassed by new pricing code, which is the main risk.',
  infra: 'Low debt; pgvector extension is not managed in Terraform (#503).',
  config: 'Low debt.', tests: 'Large and healthy for web/api; recs tests are thin and two are skipped.',
};


/* ---------------- Security, people & history demo data ---------------- */
const F = (rule, title, category, severity, cwe, attack, layer, file, line, snippet, fix) => ({ rule, title, category, severity, cwe, attack, layer, file, line, snippet, fix, fp: `${rule}-${file}-${line}` });
const FINDINGS = [
  F('llm-output-exec', 'Model output executed or run as code', 'AI / LLM', 5, 'CWE-94', ['AML.T0053', 'T1059'], 'ai', 'services/api/src/ai/tools/refund.ts', 41, 'await stripe.refunds.create(JSON.parse(toolCall.arguments))', 'Never act on raw model output; validate arguments against a schema and enforce limits in code.'),
  F('secret-token', 'Hard-coded credential', 'Secrets', 5, 'CWE-798', ['T1552.001'], 'integrations', 'services/api/src/integrations/shippo.ts', 12, "const SHIPPO_KEY = 'shippo_live_••••••a9'", 'Revoke and rotate, then load from the secret manager.'),
  F('sql-injection', 'SQL built from strings', 'Injection', 4, 'CWE-89', ['T1190', 'T1565.001'], 'data', 'services/api/src/db/repositories/orderRepo.ts', 88, 'prisma.$queryRawUnsafe(`SELECT * FROM orders WHERE region = ${region}`)', 'Use $queryRaw with tagged parameters or the query builder.'),
  F('llm-prompt-injection', 'User input concatenated into a prompt', 'AI / LLM', 3, 'CWE-1427', ['AML.T0051'], 'ai', 'services/api/src/ai/prompts.ts', 57, 'content: `You are ShopBot. Customer says: ${message}`', 'Separate system and user roles, delimit untrusted text, and filter tool calls.'),
  F('llm-tools', 'LLM can call tools / functions', 'AI / LLM', 2, 'CWE-862', ['AML.T0053'], 'ai', 'services/api/src/ai/agent.ts', 23, 'tools: [lookupOrder, issueRefund, applyCoupon]', 'Authorise every tool call server-side and log it with the trace.'),
  F('ssrf', 'Outbound request to user-controlled URL', 'Injection', 4, 'CWE-918', ['T1190', 'T1210'], 'api', 'services/api/src/routes/media.ts', 19, 'const img = await fetch(req.query.src)', 'Allow-list image hosts and block private IP ranges.'),
  F('xss', 'Raw HTML rendering', 'XSS', 3, 'CWE-79', ['T1189'], 'ui', 'apps/web/src/features/assistant/ChatWidget.tsx', 132, '<div dangerouslySetInnerHTML={{ __html: marked(msg.content) }} />', 'Sanitise model markdown with DOMPurify before rendering.'),
  F('jwt-weak', 'JWT verification weakened', 'Access control', 4, 'CWE-347', ['T1550.001'], 'api', 'services/api/src/middleware/auth.ts', 34, 'jwt.verify(token, key, { ignoreExpiration: true })', 'Enforce expiry and an explicit algorithm allow-list.'),
  F('weak-random', 'Predictable randomness for secrets', 'Crypto', 3, 'CWE-338', ['T1110.002'], 'service', 'services/api/src/services/coupons.ts', 15, 'const code = Math.random().toString(36).slice(2, 10) // coupon token', 'Use crypto.randomBytes for coupon and reset tokens.'),
  F('cors-wildcard', 'CORS allows any origin', 'Config', 2, 'CWE-942', ['T1189'], 'api', 'services/api/src/server.ts', 27, "app.register(cors, { origin: true, credentials: true })", 'Restrict origins to the storefront hosts.'),
  F('log-secret', 'Secret written to logs', 'Data exposure', 2, 'CWE-532', ['T1552.001'], 'integrations', 'services/api/src/integrations/stripe/client.ts', 77, "logger.info('stripe call', { headers, apiKey })", 'Redact credentials in the logger serializer.'),
  F('deserialization', 'Unsafe deserialization', 'Injection', 4, 'CWE-502', ['T1203', 'T1059'], 'ai', 'services/recs/recs/pipeline.py', 211, 'model = pickle.loads(redis.get(cache_key))', 'Store embeddings as JSON/npz; never unpickle shared-cache data.'),
  F('docker-unpinned', 'Container base image not pinned', 'Supply chain', 2, 'CWE-1357', ['T1195.002'], 'infra', 'services/recs/Dockerfile', 1, 'FROM python:latest', 'Pin to python:3.12.7-slim@sha256:…'),
  F('gha-injection', 'Untrusted input in workflow script', 'Supply chain', 4, 'CWE-94', ['T1059', 'T1195.002'], 'infra', '.github/workflows/preview.yml', 31, 'run: echo "Deploying ${{ github.event.pull_request.title }}"', 'Pass PR data through env vars and quote it.'),
  F('debug-on', 'Debug mode enabled', 'Config', 3, 'CWE-489', ['T1082'], 'ai', 'services/recs/recs/server.py', 88, 'app.run(host="0.0.0.0", debug=True)', 'Drive debug from env and default it to off.'),
];
const VULNS = [
  { id: 'GHSA-demo-0001', aliases: ['CVE-2025-29927'], summary: 'Authorization bypass in Next.js middleware via x-middleware-subrequest header', severity: 5, severityLabel: 'CRITICAL', package: 'next', ecosystem: 'npm', version: '14.1.0', spec: '14.1.0', manifest: 'apps/web/package.json', dev: false, fixed: '14.2.25', url: 'https://osv.dev/', attack: ['T1195.001', 'T1190'], usedBy: { files: 64, layers: ['ui'] } },
  { id: 'GHSA-demo-0002', aliases: ['CVE-2024-45590'], summary: 'body-parser vulnerable to denial of service when url encoding is enabled', severity: 4, severityLabel: 'HIGH', package: 'body-parser', ecosystem: 'npm', version: '1.20.1', spec: '^1.20.1', manifest: 'services/api/package.json', dev: false, fixed: '1.20.3', url: 'https://osv.dev/', attack: ['T1195.001'], usedBy: { files: 3, layers: ['api'] } },
  { id: 'PYSEC-demo-0003', aliases: ['CVE-2024-34062'], summary: 'Prompt template injection allows arbitrary code execution in LLM chain loader', severity: 4, severityLabel: 'HIGH', package: 'langchain', ecosystem: 'PyPI', version: '0.1.4', spec: '==0.1.4', manifest: 'services/recs/requirements.txt', dev: false, fixed: '0.1.17', url: 'https://osv.dev/', attack: ['T1195.001', 'T1059'], usedBy: { files: 9, layers: ['ai'] } },
  { id: 'GHSA-demo-0004', aliases: ['CVE-2024-4068'], summary: 'Uncontrolled resource consumption in braces', severity: 3, severityLabel: 'MODERATE', package: 'braces', ecosystem: 'npm', version: '3.0.2', spec: '3.0.2', manifest: 'apps/web/package.json', dev: true, fixed: '3.0.3', url: 'https://osv.dev/', attack: ['T1195.001'], usedBy: { files: 0, layers: [] } },
];
const ENDPOINTS = [
  ['POST', '/api/assistant/chat', 'services/api/src/routes/assistant.ts', 'api', 'likely'], ['POST', '/api/assistant/tools/refund', 'services/api/src/routes/assistant.ts', 'api', 'none'],
  ['GET', '/api/media', 'services/api/src/routes/media.ts', 'api', 'none'], ['GET', '/api/orders/:id', 'services/api/src/routes/orders.ts', 'api', 'likely'], ['POST', '/api/orders', 'services/api/src/routes/orders.ts', 'api', 'likely'],
  ['DELETE', '/api/orders/:id', 'services/api/src/routes/orders.ts', 'api', 'likely'], ['POST', '/api/checkout', 'services/api/src/routes/checkout.ts', 'api', 'likely'], ['POST', '/webhooks/stripe', 'services/api/src/integrations/stripe/webhook.ts', 'integrations', 'none'],
  ['POST', '/webhooks/shippo', 'services/api/src/integrations/shippo.ts', 'integrations', 'none'], ['GET', '/api/products', 'services/api/src/routes/catalog.ts', 'api', 'none'], ['GET', '/api/recs/:userId', 'services/recs/recs/server.py', 'ai', 'none'],
  ['POST', '/admin/reindex', 'services/recs/recs/server.py', 'ai', 'none'], ['GET', '/api/health', 'services/api/src/routes/health.ts', 'api', 'none'], ['POST', '/api/auth/login', 'services/api/src/routes/auth.ts', 'api', 'none'],
  ['POST', '/api/auth/reset', 'services/api/src/routes/auth.ts', 'api', 'none'], ['GET', '/api/admin/users', 'services/api/src/routes/admin.ts', 'api', 'likely'],
].map(([method, path, file, layer, auth], i) => ({ method, path, file, line: 10 + i * 7, layer, auth, sensitive: /admin|delete|refund|reset|webhook|reindex|DELETE/i.test(path + method), webhook: /webhook/.test(path) }));
const SCENARIOS = [
  { id: 'TM-1', title: 'Prompt injection drives the refund tool', likelihood: 'high', impact: 'critical', entryPoint: { layer: 'ui', endpoint: 'POST /api/assistant/chat', file: 'apps/web/src/features/assistant/ChatWidget.tsx' }, path: ['ui', 'api', 'ai', 'integrations'], target: 'Stripe refunds (money movement)',
    steps: [{ technique: 'AML.T0051', action: 'Customer message embeds instructions that override the system prompt', where: 'services/api/src/ai/prompts.ts:57' }, { technique: 'AML.T0054', action: 'Jailbreak bypasses the "never refund > $200" prompt rule', where: 'agent.ts' }, { technique: 'AML.T0053', action: 'Model calls issueRefund with attacker-chosen amount', where: 'tools/refund.ts:41' }, { technique: 'T1565.001', action: 'Refunds issued against arbitrary orders', where: 'Stripe API' }],
    evidence: ['llm-prompt-injection-services/api/src/ai/prompts.ts-57', 'llm-output-exec-services/api/src/ai/tools/refund.ts-41'], detection: 'Alert on refund tool calls above threshold or without a matching support ticket; log every tool call with the prompt trace.', mitigations: ['Code-level refund limits and human confirmation', 'Separate system/user roles and strip instructions', 'Per-user rate limits on tool calls'], source: 'ai' },
  { id: 'TM-2', title: 'SSRF from media proxy into cloud metadata', likelihood: 'medium', impact: 'high', entryPoint: { layer: 'api', endpoint: 'GET /api/media', file: 'services/api/src/routes/media.ts' }, path: ['api', 'integrations'], target: 'Cloud credentials (instance metadata)',
    steps: [{ technique: 'T1595', action: 'Probe /api/media?src= with internal URLs', where: 'GET /api/media' }, { technique: 'T1190', action: 'Fetch http://169.254.169.254/ through the proxy', where: 'routes/media.ts:19' }, { technique: 'T1552.001', action: 'Read temporary IAM credentials from the response', where: 'instance metadata' }],
    evidence: ['ssrf-services/api/src/routes/media.ts-19'], detection: 'Log and block outbound requests to private ranges from the API pods.', mitigations: ['Allow-list image hosts', 'Enforce IMDSv2 / block 169.254.169.254', 'Move image proxy behind a CDN'], source: 'ai' },
  { id: 'TM-3', title: 'Next.js middleware bypass exposes admin', likelihood: 'high', impact: 'high', entryPoint: { layer: 'ui', endpoint: 'GET /admin', file: 'apps/web/middleware.ts' }, path: ['ui', 'api', 'data'], target: 'Customer PII in Orders',
    steps: [{ technique: 'T1190', action: 'Send x-middleware-subrequest header to skip auth middleware (CVE-2025-29927)', where: 'next@14.1.0' }, { technique: 'T1078', action: 'Reuse the admin session flow without credentials', where: 'apps/web/middleware.ts' }, { technique: 'T1213', action: 'Export customer and order data', where: 'GET /api/admin/users' }],
    evidence: ['CVE-2025-29927'], detection: 'Drop requests carrying x-middleware-subrequest at the edge; alert on admin access from new IPs.', mitigations: ['Upgrade next to 14.2.25+', 'Enforce auth in the API, not only middleware'], source: 'ai' },
  { id: 'TM-4', title: 'Unauthenticated recs admin endpoint poisons cache', likelihood: 'medium', impact: 'medium', entryPoint: { layer: 'ai', endpoint: 'POST /admin/reindex', file: 'services/recs/recs/server.py' }, path: ['ai', 'data'], target: 'Recommendation embeddings',
    steps: [{ technique: 'T1190', action: 'Call /admin/reindex without auth', where: 'recs/server.py' }, { technique: 'T1203', action: 'Plant a pickled payload that recs later unpickles', where: 'pipeline.py:211' }, { technique: 'T1059', action: 'Code runs inside the recs container', where: 'services/recs' }],
    evidence: ['deserialization-services/recs/recs/pipeline.py-211', 'debug-on-services/recs/recs/server.py-88'], detection: 'Alert on reindex calls outside the nightly job window.', mitigations: ['Require service auth on /admin/*', 'Replace pickle with JSON/npz'], source: 'ai' },
].map((s) => ({ ...s, techniques: [...new Set(s.steps.map((x) => x.technique))].map(technique) }));
const INTEL = [
  { title: 'CVE-2025-29927: Next.js middleware authorization bypass explained', url: 'https://example.com/intel/nextjs-middleware-bypass', snippet: 'Attackers can skip middleware checks by sending a crafted x-middleware-subrequest header; patched in 14.2.25 and 15.2.3.', source: 'Tavily', topic: 'next CVE-2025-29927', published: '2025-03-24' },
  { title: 'Indirect prompt injection against tool-using agents', url: 'https://example.com/intel/agent-tool-abuse', snippet: 'Agents that can move money or data should never rely on prompt-level guardrails; enforce authorization in the tool layer.', source: 'Exa', topic: 'LLM attacks', published: '2026-02-11' },
  { title: 'SSRF to cloud metadata: still the #1 path to cloud keys', url: 'https://example.com/intel/ssrf-imds', snippet: 'Image proxies and URL previewers remain the most common SSRF entry points; IMDSv2 blocks the classic exploit.', source: 'Exa', topic: 'fastify', published: '2026-05-02' },
  { title: 'LangChain prompt template injection (CVE-2024-34062) PoC', url: 'https://example.com/intel/langchain-template-rce', snippet: 'Loading untrusted prompt templates can execute arbitrary code in affected LangChain versions.', source: 'Tavily', topic: 'langchain CVE-2024-34062', published: '2024-06-03' },
];
const P = (login, n) => ({ login, avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${login}`, contributions: n, url: `https://github.com/${login}` });
const PEOPLE = {
  contributors: [P('mira-dev', 412), P('deepak-r', 388), P('li-wen', 251), P('sam-k', 190), P('ana-ux', 144), P('jo-ops', 97)],
  commits: [
    ['mira-dev', 'feat(assistant): tool calling scaffold (#482)', 482, 1], ['deepak-r', 'pricing: regional tax tables (#497)', 497, 2], ['sam-k', 'chore: stripe v17 (#508)', 508, 2], ['li-wen', 'recs: pickle cache for embeddings', null, 4], ['jo-ops', 'ci: preview deploys on PR', null, 6],
    ['mira-dev', 'assistant: render markdown replies', null, 7], ['deepak-r', 'orders: raw query for region report', null, 9], ['ana-ux', 'design tokens WIP', 471, 11], ['li-wen', 'recs: admin reindex endpoint', null, 13], ['sam-k', 'shippo integration', null, 18],
  ].map(([login, message, pr, d], i) => ({ sha: `a${i}f3c9e${i}b2d4`, short: `a${i}f3c9e`, login, name: login, avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${login}`, date: new Date(Date.now() - d * 864e5).toISOString(), message, pr, url: 'https://github.com/acme/shopflow/commits' })),
  fileOwners: {},
  releases: [['v2.14.0', 3], ['v2.13.2', 17], ['v2.13.0', 31], ['v2.12.0', 58]].map(([tag, d]) => ({ tag, name: tag, date: new Date(Date.now() - d * 864e5).toISOString(), author: 'jo-ops', url: 'https://github.com/acme/shopflow/releases', prerelease: false })),
  traced: 12,
};
const OWN = { 'services/api/src/ai/tools/refund.ts': 'mira-dev', 'services/api/src/ai/prompts.ts': 'mira-dev', 'services/api/src/ai/agent.ts': 'mira-dev', 'apps/web/src/features/assistant/ChatWidget.tsx': 'mira-dev', 'services/api/src/db/repositories/orderRepo.ts': 'deepak-r', 'services/api/src/services/pricing.ts': 'deepak-r', 'services/recs/recs/pipeline.py': 'li-wen', 'services/recs/recs/server.py': 'li-wen', 'services/api/src/integrations/shippo.ts': 'sam-k', 'services/api/src/integrations/stripe/client.ts': 'sam-k', '.github/workflows/preview.yml': 'jo-ops', 'services/api/src/routes/media.ts': 'deepak-r', 'services/api/src/middleware/auth.ts': 'sam-k', 'apps/web/src/features/checkout/CheckoutPage.tsx': 'ana-ux' };
for (const [f, login] of Object.entries(OWN)) { const c = PEOPLE.commits.find((x) => x.login === login); PEOPLE.fileOwners[f] = [{ ...c }]; }

function demoSecurity(layers) {
  const sc = scoreSecurity({ layers, findings: FINDINGS, vulns: [], endpoints: ENDPOINTS, files: [] });
  for (const v of VULNS) for (const l of v.usedBy.layers) if (sc.layers[l]) { sc.layers[l].vulns++; sc.layers[l].score = Math.min(100, sc.layers[l].score + v.severity * 3); }
  const pos = posture({ score: sc.score, findings: FINDINGS, vulns: VULNS, endpoints: ENDPOINTS, scenarios: SCENARIOS });
  Object.assign(pos, { verdict: 'likely', aiWhy: 'The assistant can move money from model output, and the storefront runs a Next.js version with a public auth bypass.', firstProbe: 'POST /api/assistant/chat with injected instructions, then GET /admin with x-middleware-subrequest.' });
  const cats = {}; FINDINGS.forEach((f) => (cats[f.category] = (cats[f.category] || 0) + 1));
  return {
    score: sc.score, layers: sc.layers, posture: pos, findings: FINDINGS, vulns: VULNS, categories: cats, sensitiveFiles: ['services/api/.env.production'],
    deps: { total: 412, ecosystems: ['npm', 'PyPI'], unpinned: [{ name: 'openai', spec: '*', ecosystem: 'PyPI', manifest: 'services/recs/requirements.txt' }, { name: 'faiss-cpu', spec: '', ecosystem: 'PyPI', manifest: 'services/recs/requirements.txt' }], vulnerablePackages: 4, pending: false },
    surface: { endpoints: ENDPOINTS, total: ENDPOINTS.length, open: ENDPOINTS.filter((e) => e.auth === 'none').length, sensitiveOpen: ENDPOINTS.filter((e) => e.auth === 'none' && e.sensitive).length, webhooks: 2 },
    threats: { scenarios: SCENARIOS, source: 'ai', heuristic: [] }, mitre: mitreRollup(FINDINGS, VULNS, SCENARIOS), intel: INTEL,
    prFindings: [{ ...FINDINGS[0], pr: 482, prTitle: 'feat(assistant): agentic order support with tool calling', author: 'mira-dev', url: 'https://github.com/acme/shopflow/pull/482' }, { ...FINDINGS[3], pr: 482, prTitle: 'feat(assistant): agentic order support with tool calling', author: 'mira-dev', url: 'https://github.com/acme/shopflow/pull/482' }],
  };
}
const AGENTS = {
  'Layer Architect': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 3100, prompt: 4200, completion: 380, errors: 0 },
  'PR Reviewer': { model: 'gpt-5-mini', calls: 6, cached: 0, ms: 61000, prompt: 38000, completion: 9100, errors: 0 },
  'Doc Reader': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 6400, prompt: 9800, completion: 900, errors: 0 },
  'Backlog Analyst': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 7900, prompt: 5200, completion: 1400, errors: 0 },
  'Backlog Strategist': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 6100, prompt: 3900, completion: 600, errors: 0 },
  'Threat Modeler': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 14200, prompt: 7800, completion: 2100, errors: 0 },
  'Executive Briefer': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 8800, prompt: 3600, completion: 700, errors: 0 },
  'Layer Narrator': { model: 'gpt-5-mini', calls: 1, cached: 0, ms: 6900, prompt: 2900, completion: 640, errors: 0 },
};

export function demoResult() {
  const S = { layers: structuredClone(layers), edges, moduleEdges, cycles, hotspots: Object.values(HOT).flat().sort((a, b) => b.score - a.score) };
  const meta = { owner: { login: 'acme' }, name: 'shopflow', full_name: 'acme/shopflow', html_url: 'https://github.com/acme/shopflow', description: 'Headless commerce platform with AI shopping assistant and recommendations (demo data)', language: 'TypeScript', stargazers_count: 0, default_branch: 'main', pushed_at: new Date().toISOString() };
  const r = assemble({ meta, S, prs: structuredClone(prs), backlog: structuredClone(backlog), velocity: { mergeRate: 0.74, medianDaysToMerge: 6.5, closedSample: 60, openCount: 17 }, mode: 'ai', model: 'gpt-5-mini (demo)', archNotes: 'Next.js storefront + Fastify API monolith with an embedded LLM assistant, plus a Python recommendations service sharing the Postgres database.', stats: { totalFiles: 1210, analysedFiles: 956, skipped: 254, githubCalls: 4, seconds: 0 } });
  for (const l of r.layers) l.narrative = NARR[l.id] || '';
  Object.assign(r.summary, {
    headline: `AI / ML is the debt epicentre: index ${r.layers.find((l) => l.id === 'ai').score} today → ${r.layers.find((l) => l.id === 'ai').score90} in 90 days, and it is pulling API and UI up with it.`,
    narrative: 'Most of the repository is in reasonable shape; debt is concentrated in two places. The AI layer combines the lowest test coverage (12%), a 7-file import cycle with the API, and the most aggressive roadmap (agent tools, multi-agent design doc). PR #482 sets the pattern every future tool will copy, so fixing it now is worth more than any other single action. Separately, pricing.ts is the hottest file and both an open PR (#497) and a "temporary" ticket (SHOP-322) add to it. Two paydown items already exist in Jira but are sequenced after the work they would protect.',
    topRisks: [
      { title: 'Unguarded side-effecting agent tools', layer: 'ai', why: '#482 lets model output trigger refunds; SHOP-318 adds more tools on the same pattern.', action: 'Block #482 on a code-level tool guard + audit log; make it a shared framework.', horizon: 'now' },
      { title: 'api ↔ ai import cycle', layer: 'api', why: '7 files; #482 deepens it, and SHOP-311 (extract recs-service) depends on breaking it.', action: 'Move order lookups into services and inject them as tool dependencies.', horizon: '30d' },
      { title: 'Pricing hotspot under deadline', layer: 'service', why: 'pricing.ts (1,010 → 1,250 LOC) + hard-coded VAT ticket.', action: 'Rule-pipeline refactor before SHOP-322; rates into config.', horizon: '30d' },
      { title: 'No AI evals', layer: 'ai', why: 'Prompt changes ship blind; three forked system prompts.', action: 'Pull SHOP-301 ahead of SHOP-318.', horizon: '30d' },
      { title: 'Stale design-system branch', layer: 'ui', why: '#471: 97 days, 88 files, conflicts with checkout work.', action: 'Land tokens only; close the rest.', horizon: 'now' },
    ],
    recommendations: ['Request changes on #482: code-enforced refund limits, confirmation step, tool-call audit log.', 'Re-order Jira: SHOP-301 (prompt registry + evals) before SHOP-318.', 'Merge #508 and #511 today — both pay down debt.', 'Refactor pricing.ts into rules before #497 lands; reject SHOP-322 hard-coding.', 'Add a PaymentProvider port before SHOP-334 (Klarna).', 'Split #471: tokens PR now, component migration incrementally.'],
  });
  r.security = demoSecurity(r.layers);
  for (const l of r.layers) l.security = r.security.layers[l.id];
  r.people = PEOPLE;
  r.merged = [[508, 'chore: upgrade stripe-node to v17', 'sam-k', 1], [499, 'fix: cart rounding', 'deepak-r', 3], [495, 'recs: nightly reindex', 'li-wen', 5], [490, 'ci: preview deploys', 'jo-ops', 6], [486, 'assistant: markdown replies', 'mira-dev', 8]].map(([number, title, author, d]) => ({ number, title, author, avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${author}`, mergedAt: new Date(Date.now() - d * 864e5).toISOString(), url: 'https://github.com/acme/shopflow/pulls' }));
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  r.history = { snapshots: [{ at: ago(0), index: r.summary.index, index90: r.summary.index90, security: r.security.score, findings: FINDINGS.length, vulns: VULNS.length, prs: 6, endpoints: ENDPOINTS.length, current: true, headSha: 'a0f3c9e0b2d4' }, { at: ago(7), index: r.summary.index - 4, index90: r.summary.index90 - 6, security: r.security.score - 11, findings: FINDINGS.length - 3, vulns: 3, prs: 5, endpoints: 14, headSha: 'b7e1d2a' }, { at: ago(21), index: r.summary.index - 7, index90: r.summary.index90 - 9, security: r.security.score - 18, findings: FINDINGS.length - 5, vulns: 2, prs: 4, endpoints: 12, headSha: 'c4a9f01' }],
    diff: { from: ago(7), to: ago(0), sameCommit: false, prevSha: 'b7e1d2a', curSha: 'a0f3c9e', index: [r.summary.index - 4, r.summary.index], index90: [r.summary.index90 - 6, r.summary.index90], security: [r.security.score - 11, r.security.score], layers: [{ id: 'ai', from: 64, to: r.layers.find((l) => l.id === 'ai').score, secFrom: 51, secTo: r.security.layers.ai.score }, { id: 'api', from: 49, to: r.layers.find((l) => l.id === 'api').score, secFrom: 40, secTo: r.security.layers.api.score }],
      newFindings: [FINDINGS[0], FINDINGS[3], FINDINGS[11]].map((f) => ({ fp: f.fp, title: f.title, file: f.file, line: f.line, severity: f.severity })), fixedFindings: [{ fp: 'x1', title: 'TLS verification disabled', file: 'services/api/src/integrations/legacy/charges.ts', line: 22, severity: 3 }], newVulns: [['GHSA-demo-0003', 'langchain']], fixedVulns: [['GHSA-demo-0009', 'axios']], prsOpened: [511, 508], prsClosed: [490] } };
  r.engines = { osv: { packages: 412, queried: 398 }, tavily: true, exa: true, github: { traced: 12 } };
  r.usage = { calls: 13, cached: 0, prompt: 75400, completion: 15820, errors: 0, agents: AGENTS };
  r.jobId = 'demo';
  r.demo = true;
  return r;
}

export function demoDeepDive(layerId) {
  const l = LAYER_BY_ID[layerId];
  if (layerId === 'ai') return {
    model: 'gpt-5-mini (demo)', interestRate: 'critical — every new tool or prompt copies existing patterns, and there is no eval signal to catch regressions',
    assessment: 'The AI layer is effectively two systems (TS assistant inside the API, Python recs service) sharing a database but no contracts. Code quality is prototype-grade: long procedural pipelines, inline prompts, and model ids pinned in code. The biggest risk is not code style but control: model output can trigger side effects with only prompt-level guards.',
    rootCauses: ['Prototype code promoted to production without a hardening pass', 'No evaluation harness, so quality is measured in production', 'Assistant lives inside the API process, creating the api↔ai cycle', 'Prompts treated as strings, not versioned artifacts'],
    debtItems: [
      { title: 'Tool execution has no policy layer', severity: 5, file: 'services/api/src/ai/agent.ts', detail: 'executeTool() dispatches directly on model-provided name/args.', fix: 'ToolPolicy with allow-lists, arg schemas (zod), spend limits and human-in-the-loop for money movement.', effort: 'M' },
      { title: 'pipeline.py monolith', severity: 4, file: 'services/recs/recs/pipeline.py', detail: '1,120 LOC; retrieval, re-ranking, business filters and logging in one function chain; branches on vector store type.', fix: 'Split into retrieve → rerank → filter stages behind a VectorStore interface.', effort: 'L' },
      { title: 'Forked system prompts', severity: 3, file: 'services/api/src/ai/prompts.ts', detail: 'Three near-identical support personas.', fix: 'Prompt registry with ids + versions; reference by id.', effort: 'S' },
      { title: 'Nightly full re-embed', severity: 3, file: 'services/recs/recs/embeddings.py', detail: 'Cost and rate-limit risk grows linearly with catalog.', fix: 'Incremental embedding on product change events.', effort: 'M' },
    ],
    dependencyRisk: 'Upstream, AI inherits from Data (order model in a service↔data cycle) and Integrations (Stripe client used directly by the refund tool). Downstream, API, Services and UI all call into AI; with #482 merged the blast radius grows from 3 to 4 layers, so AI incidents become checkout incidents.',
    refactorPlan: [
      { step: 'Introduce ToolPolicy + audit log; gate #482 on it', why: 'Removes the only severity-5 item', effort: 'M', reducesScoreBy: '8' },
      { step: 'Prompt registry + golden-transcript evals in CI (SHOP-301)', why: 'Turns prompt changes into reviewed, tested diffs', effort: 'M', reducesScoreBy: '10' },
      { step: 'Move order lookup to services; inject into tools', why: 'Breaks the api↔ai cycle, unblocks SHOP-311', effort: 'S', reducesScoreBy: '5' },
      { step: 'VectorStore interface; finish pgvector migration and delete FAISS path', why: 'Ends the dual-store fork from #503', effort: 'M', reducesScoreBy: '6' },
    ],
    forecastNarrative: 'If nothing changes, the AI index rises from the high 60s to ~85 by day 90 as SHOP-318 and the multi-agent design land on unguarded foundations. Executing steps 1–3 before SHOP-318 holds it near 60 and cuts inherited debt in API/UI by roughly a third.',
  };
  return {
    model: 'gpt-5-mini (demo)', interestRate: 'medium',
    assessment: `${l?.name || layerId}: a canned deep dive is only included for the AI / ML layer in demo mode. Run a real analysis with an OpenAI key to get a code-grounded review of any layer.`,
    rootCauses: [], debtItems: [], refactorPlan: [], dependencyRisk: '', forecastNarrative: '',
  };
}

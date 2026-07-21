/**
 * Narraza v3 — Architecture boundaries (§3.3).
 * Enforces the dependency direction from design-spec §1.2:
 *   web/worker adapters -> application -> core (pure) + ports
 *   core never imports ai/db/next/http; application depends on ports only;
 *   web never imports prisma directly (D8); ai never touches ledger/db.
 *
 * M0 baseline: core-boundary, application-boundary, ai-boundary,
 * web-boundary, worker-boundary, command-no-ai, env-boundary.
 * Rules tighten as packages gain real modules (M1+).
 */
'use strict';

/** Helper: a path segment matcher for a workspace package. */
const pkg = (name) => `^(packages|apps)/${name}/`;

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-boundary',
      severity: 'error',
      comment: 'packages/core is pure domain: no AI, DB, Next, HTTP, or other workspace adapters.',
      from: { path: pkg('core'), pathNot: '\\.(test|spec)\\.ts$' },
      to: {
        path: [
          pkg('ai'),
          pkg('db'),
          pkg('application'),
          pkg('web'),
          pkg('worker-gen'),
          pkg('worker-outbox'),
          '^node_modules/(@prisma|prisma|next|react|@auth|next-auth|openai|@google)',
        ],
      },
    },
    {
      name: 'application-boundary',
      severity: 'error',
      comment:
        'packages/application depends on core + ports (shared) only — never on concrete adapters (db/ai/web).',
      from: { path: pkg('application'), pathNot: '\\.(test|spec)\\.ts$' },
      to: {
        path: [pkg('db'), pkg('web'), pkg('worker-gen'), pkg('worker-outbox')],
      },
    },
    {
      name: 'ai-boundary',
      severity: 'error',
      comment: 'packages/ai never touches ledger, DB, or artifact storage.',
      from: { path: pkg('ai'), pathNot: '\\.(test|spec)\\.ts$' },
      to: { path: [pkg('db'), pkg('web'), pkg('application')] },
    },
    {
      name: 'web-boundary',
      severity: 'error',
      comment:
        'apps/web is an adapter: it must not import Prisma directly (D8) — go through @narraza/db public API.',
      from: { path: pkg('web'), pathNot: '\\.(test|spec)\\.ts$' },
      to: { path: ['^node_modules/(@prisma/client|\\.prisma)'] },
    },
    {
      name: 'worker-boundary',
      severity: 'error',
      comment: 'Workers are adapters: no direct import of apps/web.',
      from: { path: [pkg('worker-gen'), pkg('worker-outbox')] },
      to: { path: pkg('web') },
    },
    {
      name: 'command-no-ai',
      severity: 'error',
      comment:
        'Command/use-case layer (application) must not import AI provider adapters directly; AI enters via ports only.',
      from: { path: pkg('application'), pathNot: '\\.(test|spec)\\.ts$' },
      to: { path: pkg('ai') },
    },
    {
      name: 'env-boundary',
      severity: 'error',
      comment:
        'Env schemas are process-scoped: web code must not import the worker/outbox env modules (keeps AI keys out of the web bundle).',
      from: { path: pkg('web'), pathNot: '\\.(test|spec)\\.ts$' },
      to: { path: '^packages/shared/src/env/(worker|outbox)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

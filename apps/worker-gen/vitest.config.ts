import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Worker unit tests import workspace packages from source so CI does not
// require a prior package build step (package.json exports point at dist) —
// same pattern as packages/db/vitest.schema.config.ts.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@narraza/application': path.resolve(here, '../../packages/application/src/index.ts'),
      '@narraza/core': path.resolve(here, '../../packages/core/src/index.ts'),
      '@narraza/shared/env/worker': path.resolve(here, '../../packages/shared/src/env/worker.ts'),
      '@narraza/shared': path.resolve(here, '../../packages/shared/src/index.ts'),
      '@narraza/ai': path.resolve(here, '../../packages/ai/src/index.ts'),
    },
  },
  test: {
    fileParallelism: true,
  },
});

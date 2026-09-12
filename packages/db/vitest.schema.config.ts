import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests import workspace packages from source so CI does not
// require a prior package build step (package.json exports point at dist).
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@narraza/application': path.resolve(here, '../application/src/index.ts'),
      '@narraza/core': path.resolve(here, '../core/src/index.ts'),
      '@narraza/shared': path.resolve(here, '../shared/src/index.ts'),
      '@narraza/ai': path.resolve(here, '../ai/src/index.ts'),
    },
  },
  test: {
    fileParallelism: true,
    maxWorkers: 2,
  },
});

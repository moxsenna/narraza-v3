import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Package exports point at compiled dist (for Turbopack/Node), but tests consume
// workspace deps from source so no build step is needed to run them.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@narraza/core': path.resolve(here, '../core/src/index.ts'),
      '@narraza/shared': path.resolve(here, '../shared/src/index.ts'),
    },
  },
});

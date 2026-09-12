import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '.worktrees/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
});

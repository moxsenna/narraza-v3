import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE } from './index.ts';

// M0 smoke test: proves the vitest harness runs in the workspace. Real policy
// tests arrive in M1.
describe('@narraza/shared', () => {
  it('exposes its package identifier', () => {
    expect(SHARED_PACKAGE).toBe('@narraza/shared');
  });
});

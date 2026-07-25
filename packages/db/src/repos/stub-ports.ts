import type { JobPort, LedgerPort } from '@narraza/application';

/** Stub adapters for M2 — full engines land in M3. */
export function createLedgerStub(): LedgerPort {
  return {
    assertNotUsedInM2() {
      throw new Error('LedgerPort is not implemented until M3.');
    },
  };
}

export function createJobStub(): JobPort {
  return {
    assertNotUsedInM2() {
      throw new Error('JobPort is not implemented until M3.');
    },
  };
}

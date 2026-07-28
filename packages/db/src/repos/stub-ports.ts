import type { LedgerPort } from '@narraza/application';

/**
 * Stub adapter for the credit ledger port. The real engine lands in a later
 * task; until then any caller that exercises the port surfaces the
 * not-implemented boundary as an unambiguous thrown string.
 */
export function createLedgerStub(): LedgerPort {
  const stub: LedgerPort = {
    releaseQueuedCancellation() {
      return Promise.reject('LedgerPort is not implemented until Task 4');
    },
  };
  return stub;
}

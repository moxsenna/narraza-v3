/**
 * Credit ledger port — full engine lands in M3. M2 defines the interface only;
 * Prisma adapter may throw if invoked before M3 wiring.
 */
export interface LedgerPort {
  /** Reserved for M3; calling before M3 is a programming error. */
  assertNotUsedInM2(): void;
}

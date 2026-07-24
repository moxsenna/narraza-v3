/**
 * Generation job port — full SM lands in M3. M2 defines the interface only.
 */
export interface JobPort {
  /** Reserved for M3; calling before M3 is a programming error. */
  assertNotUsedInM2(): void;
}

/**
 * Task 5 — one-snapshot credit summary port.
 *
 * The adapter MUST compute all three micro-IDR aggregates inside ONE
 * PostgreSQL statement (single MVCC snapshot); under READ COMMITTED separate
 * statements can observe different snapshots and produce torn balances.
 *
 * This port is read-only: it never mutates ledger, reservations, or user rows
 * and never takes the Task 6 users-row balance lock.
 */
export interface CreditBalanceSnapshot {
  /** Grants + refunds + credit adjustments − legacy charges − reservation settlements − debit adjustments. */
  readonly bookMicroIdr: bigint;
  /** Exposure of OPEN user-credit reservations (system_funded excluded; NULL legacy rows included). */
  readonly heldMicroIdr: bigint;
  /** Exposure of CLOSING user-credit reservations (system_funded excluded; NULL legacy rows included). */
  readonly reconcilingMicroIdr: bigint;
}

/**
 * Public/application credit view in whole CREDIT units (not micro-IDR):
 * - available: floor(max(book − held − reconciling, 0) / MICRO_IDR_PER_CREDIT)
 * - held:      ceil(held / MICRO_IDR_PER_CREDIT)
 * - reconciling: ceil(reconciling / MICRO_IDR_PER_CREDIT)
 *
 * Subtraction happens in micro-IDR BEFORE floor conversion. This canonical
 * view is shared by header/credit-page consumers — never re-derive it with a
 * second independent financial query.
 */
export interface CreditSummaryView {
  readonly available: bigint;
  readonly held: bigint;
  readonly reconciling: bigint;
}

export interface CreditBalancePort {
  /** Single-statement snapshot of a user's ledger book and reservation exposure. */
  getBalanceSnapshot(userId: string): Promise<CreditBalanceSnapshot>;

  // Task 6: Serialize user balance via FOR UPDATE lock on users row
  serializeUserBalance(userId: string): Promise<void>;
}

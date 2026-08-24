export type ReservationReconciliationConflictReason =
  'allocation_conflict' | 'settlement_conflict' | 'release_conflict' | 'reservation_conflict';

export interface ReservationReconciliationConflictContext {
  readonly reservationId: string;
  readonly jobId: string;
  readonly allocationId: string | null;
}

export class ReservationReconciliationConflict extends Error {
  override readonly name = 'ReservationReconciliationConflict';

  constructor(
    readonly reason: ReservationReconciliationConflictReason,
    readonly context: ReservationReconciliationConflictContext,
  ) {
    super(`reservation reconciliation conflict: ${reason}`);
  }
}

export type ReservationReconciliationConflictReason =
  'allocation_conflict' | 'settlement_conflict' | 'release_conflict' | 'reservation_conflict';

export class ReservationReconciliationConflict extends Error {
  override readonly name = 'ReservationReconciliationConflict';

  constructor(readonly reason: ReservationReconciliationConflictReason) {
    super(`reservation reconciliation conflict: ${reason}`);
  }
}

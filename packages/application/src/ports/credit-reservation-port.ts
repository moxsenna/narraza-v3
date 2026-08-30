import type { CreditReservationRecord } from './types.js';

export interface CreateReservationInput {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly quoteId: string;
  readonly confirmationRequestId: string;
  readonly reservedMicroIdr: bigint;
  readonly exposureMicroIdr: bigint;
}

export type CreateReservationResult =
  | { readonly kind: 'created'; readonly reservation: CreditReservationRecord }
  | { readonly kind: 'conflict' };

// Blocker 2 & 4 - Absolute Targets Design + Exact Binding Validation (NOT deltas)
export interface ApplyReconciliationTargetInput {
  readonly reservationId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly jobProjectId: string | null;
  readonly jobId: string | null;
  readonly settledTargetMicroIdr: bigint;
  readonly releasedTargetMicroIdr: bigint;
  readonly exposureTargetMicroIdr: bigint;
  readonly terminalReason?: 'cancelled' | 'expired' | 'released';
}

export type ReconciliationApplyResult =
  | { readonly kind: 'reconciled' }
  | { readonly kind: 'already_reconciled' }
  | { readonly kind: 'monotonicity_violation'; readonly reason: 'settled' | 'released' }
  | { readonly kind: 'conservation_violation'; readonly reason: string }
  | { readonly kind: 'binding_invalid' }
  | { readonly kind: 'not_found' }
  | {
      readonly kind: 'conflict';
      readonly reason: 'terminal_disposition_mismatch' | 'terminal_lifecycle_violation';
    };

export interface CreditReservationPort {
  // Task 6: Find replay by confirmation request ID (unique constraint ensures single record)
  findReplayByConfirmationRequestId(
    confirmationRequestId: string,
  ): Promise<CreditReservationRecord | null>;

  // Task 6: Create open USER_PAID reservation
  create(input: CreateReservationInput): Promise<CreateReservationResult>;

  /** Locks exact job binding for settlement target computation. */
  lockBound(input: {
    readonly reservationId: string;
    readonly projectId: string;
    readonly jobId: string;
  }): Promise<CreditReservationRecord | null>;

  /** Read-only lookup of the reservation bound to a project job; no locks, no writes. */
  findByJob(input: {
    readonly projectId: string;
    readonly jobId: string;
  }): Promise<CreditReservationRecord | null>;

  // Task 7/8: Apply reconciliation targets using ABSOLUTE TARGETS (Blocker 2)
  applyReconciliationTarget(
    input: ApplyReconciliationTargetInput,
  ): Promise<ReconciliationApplyResult>;
}

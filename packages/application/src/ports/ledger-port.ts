export interface ReleaseQueuedCancellationInput {
  readonly projectId: string;
  readonly jobId: string;
  readonly reservationId: string;
  readonly ledgerEntryId: string;
  readonly dedupeKey: `release:${string}:queued-cancel`;
  readonly entryType: 'release';
  readonly direction: 'credit';
}

export type ReleaseQueuedCancellationResult =
  | { readonly kind: 'released' }
  | { readonly kind: 'already_released' }
  | { readonly kind: 'binding_invalid' };

// Settlement append input - narrow semantic contract (adapter derives vocabulary)
export interface AppendReservationSettlementInput {
  readonly projectId: string;
  readonly jobId: string;
  readonly userId: string;
  readonly reservationId: string;
  readonly ledgerEntryId: string;
  readonly allocationId: string;
  readonly attemptId: string | null;
  readonly amountMicroIdr: bigint;
  readonly dedupeKey: `settle:${string}:${string}`;
}

export type ReservationSettlementAppendResult =
  | { readonly kind: 'settled' }
  | { readonly kind: 'already_settled' }
  | { readonly kind: 'monotonicity_violation'; readonly current: bigint; readonly proposed: bigint }
  | { readonly kind: 'conservation_violation'; readonly reason: string }
  | { readonly kind: 'binding_invalid' };

// Release append input - narrow semantic contract
export interface AppendReservationReleaseInput {
  readonly projectId: string;
  readonly jobId: string;
  readonly userId: string;
  readonly reservationId: string;
  readonly ledgerEntryId: string;
  readonly reason: 'invocation_completed' | 'final-close' | 'queued-cancel';
  readonly allocationId?: string;
  readonly attemptId: string | null;
  readonly amountMicroIdr: bigint;
  readonly dedupeKey:
    | `release:${string}:queued-cancel`
    | `release:${string}:final-close`
    | `release:${string}:invocation_completed:${string}`;
}

export type ReservationReleaseAppendResult =
  | { readonly kind: 'released' }
  | { readonly kind: 'already_released' }
  | { readonly kind: 'monotonicity_violation'; readonly current: bigint; readonly proposed: bigint }
  | { readonly kind: 'conservation_violation'; readonly reason: string }
  | { readonly kind: 'binding_invalid' };

export interface LedgerPort {
  releaseQueuedCancellation(
    input: ReleaseQueuedCancellationInput,
  ): Promise<ReleaseQueuedCancellationResult>;

  appendReservationSettlement(
    input: AppendReservationSettlementInput,
  ): Promise<ReservationSettlementAppendResult>;

  appendReservationRelease(
    input: AppendReservationReleaseInput,
  ): Promise<ReservationReleaseAppendResult>;
}

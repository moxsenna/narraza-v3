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

export interface LedgerPort {
  releaseQueuedCancellation(
    input: ReleaseQueuedCancellationInput,
  ): Promise<ReleaseQueuedCancellationResult>;
}

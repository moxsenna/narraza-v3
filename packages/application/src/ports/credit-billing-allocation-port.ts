export interface AppendCreditBillingAllocationInput {
  readonly id: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly reservationId: string;
  readonly usableOutputKind: string;
  readonly usableOutputRef: string;
  readonly contributingAttemptIds: readonly string[];
  readonly providerCostMicroIdr: bigint;
  readonly userSettlementMicroIdr: bigint;
  readonly systemSubsidyMicroIdr: bigint;
  readonly dedupeKey: `allocation:${string}:${string}:${string}`;
}

export type AppendCreditBillingAllocationResult =
  | { readonly kind: 'appended'; readonly allocationId: string }
  | { readonly kind: 'replayed'; readonly allocationId: string }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'attempt_binding_invalid' };

export interface CreditBillingAllocationPort {
  findReservationSettlement(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly reservationId: string;
  }): Promise<
    | {
        readonly kind: 'found';
        readonly allocationId: string;
        readonly userSettlementMicroIdr: bigint;
      }
    | { readonly kind: 'none' }
    | { readonly kind: 'conflict' }
  >;

  sumEligibleProviderCost(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly contributingAttemptIds: readonly string[];
  }): Promise<
    | { readonly kind: 'summed'; readonly providerCostMicroIdr: bigint }
    | { readonly kind: 'attempt_binding_invalid' }
  >;

  appendForUsableOutput(
    input: AppendCreditBillingAllocationInput,
  ): Promise<AppendCreditBillingAllocationResult>;
}

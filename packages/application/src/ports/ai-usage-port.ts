import type { GenerationAttemptRecord } from './types.js';

export interface UsageMetrics {
  readonly priceSnapshotId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly providerCostMicroIdr: bigint;
}

export type AppendUsageResult =
  { readonly kind: 'appended' } | { readonly kind: 'replayed' } | { readonly kind: 'conflict' };

/** Adapter derives project/job/attempt identity and chargedParty='system' from locked attempt. */
export interface AiUsagePort {
  appendForAttempt(
    attempt: GenerationAttemptRecord,
    metrics: UsageMetrics,
  ): Promise<AppendUsageResult>;
}

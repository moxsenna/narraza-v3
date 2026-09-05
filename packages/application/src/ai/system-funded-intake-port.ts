import type { CreditReservationRecord } from '../ports/types.js';

export const INTAKE_FAIR_USE_COUNTER_KIND = 'm4_chat_intake_reply_daily_jakarta' as const;

export interface SystemFundedIntakePort {
  /** Authoritative persisted plan/bundle values used before quota or reservation mutation. */
  loadBinding(input: {
    readonly projectId: string;
    readonly workflowPlanId: string;
    readonly bundleId: string;
  }): Promise<{
    readonly workflowKind: string;
    readonly workflowPlanHash: string;
    readonly dependencyHash: string;
    readonly estimatedMaxMicroIdr: bigint;
  } | null>;

  /**
   * Uses PostgreSQL now() and Asia/Jakarta calendar boundaries. Increment is
   * conditional, so concurrent callers can never admit more than `limit`.
   */
  acceptDailyGeneration(input: {
    readonly userId: string;
    readonly limit: number;
  }): Promise<{ readonly kind: 'accepted'; readonly count: number } | { readonly kind: 'limited' }>;

  /** Creates an unbound SYSTEM_FUNDED reservation. No quote or user ledger row. */
  createReservation(input: {
    readonly id: string;
    readonly userId: string;
    readonly projectId: string;
    readonly jobId: string;
    readonly budgetMicroIdr: bigint;
    readonly dedupeKey: string;
  }): Promise<
    | { readonly kind: 'created'; readonly reservation: CreditReservationRecord }
    | { readonly kind: 'conflict' }
  >;
}

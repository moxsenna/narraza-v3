import type { UsageMetrics } from './ai-usage-port.js';
import type {
  GenerationAttemptRecord,
  JobLeaseIdentity,
  JsonObject,
  WorkflowInvocationRecord,
} from './types.js';

export interface BeginAttemptInput extends JobLeaseIdentity {
  readonly invocationId: string;
  readonly attemptId: string;
  readonly stageKey: string;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export type BeginAttemptResult =
  | {
      readonly kind: 'started';
      readonly invocation: WorkflowInvocationRecord;
      readonly attempt: GenerationAttemptRecord;
    }
  | {
      readonly kind: 'already_started';
      readonly invocation: WorkflowInvocationRecord;
      readonly attempt: GenerationAttemptRecord;
    }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'not_authorized' };

export type FinalizableAttemptStatus = 'succeeded' | 'failed';

export interface FinalizeAttemptInput extends JobLeaseIdentity {
  readonly invocationId: string;
  readonly attemptId: string;
  readonly status: FinalizableAttemptStatus;
  readonly providerRequestId: string | null;
  readonly resultHash: string | null;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly usage: UsageMetrics;
}

export type WinnerOutcome =
  | 'selected'
  | 'selected_replay'
  | 'already_won_by_other'
  | 'ineligible_owner'
  | 'cancelled'
  | 'project_tombstoned'
  | 'attempt_failed'
  | 'not_selected';

export type FinalizeAttemptResult =
  | {
      readonly kind: 'finalized';
      readonly attempt: GenerationAttemptRecord;
      readonly winner: WinnerOutcome;
    }
  | {
      readonly kind: 'replayed';
      readonly attempt: GenerationAttemptRecord;
      readonly winner: WinnerOutcome;
    }
  | { readonly kind: 'conflict' }
  | {
      readonly kind: 'reconciliation_conflict';
      readonly reason:
        'allocation_conflict' | 'settlement_conflict' | 'release_conflict' | 'reservation_conflict';
    }
  | { readonly kind: 'not_authorized' };

export type BeginAttemptPortResult = Exclude<
  BeginAttemptResult,
  { readonly kind: 'not_authorized' }
>;
export type FinalizeAttemptPortResult =
  | { readonly kind: 'finalized'; readonly attempt: GenerationAttemptRecord }
  | { readonly kind: 'replayed'; readonly attempt: GenerationAttemptRecord }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'not_authorized' };
export type WinnerClassificationResult =
  | { readonly kind: 'classified'; readonly winner: WinnerOutcome }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'not_authorized' };

export type FinalizationEligibility =
  'eligible' | 'ineligible_owner' | 'cancelled' | 'project_tombstoned';

export type InvocationFinalizationLockResult =
  | { readonly kind: 'locked'; readonly invocation: WorkflowInvocationRecord }
  | { readonly kind: 'not_authorized' };

export interface WorkflowInvocationPort {
  countUnresolvedAttempts(input: {
    readonly projectId: string;
    readonly jobId: string;
  }): Promise<number>;
  beginAttempt(input: BeginAttemptInput): Promise<BeginAttemptPortResult>;
  lockForFinalization(input: FinalizeAttemptInput): Promise<InvocationFinalizationLockResult>;
  classifyWinner(
    input: FinalizeAttemptInput,
    attempt: GenerationAttemptRecord,
    allowSelection: boolean,
    eligibility: FinalizationEligibility,
  ): Promise<WinnerClassificationResult>;
}

export interface GenerationAttemptPort {
  finalizeAttempt(input: FinalizeAttemptInput): Promise<FinalizeAttemptPortResult>;
}

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
  | 'attempt_failed';

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

export interface WorkflowInvocationPort {
  beginAttempt(input: BeginAttemptInput): Promise<BeginAttemptPortResult>;
  classifyWinner(
    input: FinalizeAttemptInput,
    attempt: GenerationAttemptRecord,
    allowSelection: boolean,
  ): Promise<WinnerClassificationResult>;
}

export interface GenerationAttemptPort {
  finalizeAttempt(input: FinalizeAttemptInput): Promise<FinalizeAttemptPortResult>;
}

import type { ActionFundingModel } from '../credits/action-funding-policy.js';
import type {
  GenerationJobRecord,
  JobLeaseIdentity,
  JsonObject,
  TerminalJobStatus,
} from './types.js';

export interface JobInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly kind: string;
  /** Funding classification resolved from `kind`; the adapter matches it against `credit_reservations.funding_model`. */
  readonly fundingModel: ActionFundingModel;
  readonly priority: number;
  /** Positive whole milliseconds; adapter resolves availability as DB `NOW()` plus this delay. */
  readonly availableInMs: number;
  readonly retryOfJobId: string | null;
  readonly bundleId: string | null;
  readonly workflowPlanId: string | null;
  readonly reservationId: string | null;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export type JobInsertResult =
  | { readonly kind: 'inserted'; readonly job: GenerationJobRecord }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'binding_invalid' }
  | { readonly kind: 'funding_model_mismatch' };

export interface JobLookupInput {
  readonly projectId: string;
  readonly jobId: string;
}

export interface JobClaimInput {
  readonly leaseToken: string;
  readonly leaseDurationMs: number;
}

export type JobClaimResult =
  | {
      readonly kind: 'claimed';
      readonly job: GenerationJobRecord;
      readonly identity: JobLeaseIdentity;
    }
  | { readonly kind: 'none' };

export interface JobHeartbeatInput extends JobLeaseIdentity {
  readonly leaseDurationMs: number;
}

export type JobHeartbeatResult =
  | { readonly kind: 'extended'; readonly job: GenerationJobRecord }
  | { readonly kind: 'lost_ownership' };

export interface JobRequeueInput extends JobLeaseIdentity {
  readonly delayMs: number;
}

export type JobRequeueResult =
  | { readonly kind: 'requeued'; readonly job: GenerationJobRecord }
  | { readonly kind: 'lost_ownership' }
  | { readonly kind: 'not_allowed' };

export type QueuedTerminalStatus = 'cancelled';
export type RunningTerminalStatus = TerminalJobStatus;

export interface JobQueuedTerminalInput extends JobLookupInput {
  readonly status: QueuedTerminalStatus;
}

export interface JobRunningTerminalInput extends JobLeaseIdentity {
  readonly status: RunningTerminalStatus;
}

export type JobTerminalTransitionResult =
  | { readonly kind: 'terminalized'; readonly job: GenerationJobRecord }
  | { readonly kind: 'already_terminal'; readonly status: TerminalJobStatus }
  | { readonly kind: 'lost_ownership' }
  | { readonly kind: 'cancellation_required' }
  | { readonly kind: 'cancellation_blocks_success' };

export type JobCancelQueuedResult =
  | { readonly kind: 'cancelled'; readonly job: GenerationJobRecord }
  | { readonly kind: 'state_conflict' };

export type JobRunningCancellationResult =
  | { readonly kind: 'requested' }
  | { readonly kind: 'already_requested' }
  | { readonly kind: 'state_conflict' };

export type JobReclaimInput = Record<string, never>;

export type JobReclaimResult =
  | { readonly kind: 'requeued'; readonly job: GenerationJobRecord }
  | { readonly kind: 'cancelled'; readonly job: GenerationJobRecord }
  | { readonly kind: 'none' };

export type JobExpiredReclaimLockResult =
  | {
      readonly kind: 'locked';
      readonly job: GenerationJobRecord;
      readonly ownerUserId: string;
      readonly outcome: 'requeue' | 'cancel';
    }
  | { readonly kind: 'none' };

export type JobFencedLockResult =
  { readonly kind: 'locked'; readonly job: GenerationJobRecord } | { readonly kind: 'lost' };

export type JobLiveOwnerLockResult =
  | { readonly kind: 'locked'; readonly job?: GenerationJobRecord }
  | { readonly kind: 'not_authorized' };

export type JobFinalizationLockResult =
  | {
      readonly kind: 'locked';
      readonly eligibility: 'eligible' | 'cancelled' | 'ineligible_owner';
    }
  | { readonly kind: 'not_authorized' };

export interface JobPort {
  insert(input: JobInsertInput): Promise<JobInsertResult>;
  findById(input: JobLookupInput): Promise<GenerationJobRecord | null>;
  listActiveByProject(projectId: string): Promise<readonly GenerationJobRecord[]>;
  /**
   * Read-only UI lookup: the most recent immutable terminal job of `kind` for
   * the project whose payload contains every `payloadFilter` entry. Payload
   * eligibility is applied before ordering/limit, the lookup is project-scoped,
   * and terminal jobs are immutable — so it carries no lease or state-machine
   * semantics; it only surfaces a finished outcome.
   */
  findLatestTerminalByProject(input: {
    readonly projectId: string;
    readonly kind: string;
    readonly payloadFilter: JsonObject;
  }): Promise<GenerationJobRecord | null>;
  lockForUpdate(input: JobLookupInput): Promise<GenerationJobRecord | null>;
  /** Locks exact job without requiring live lease ownership; used after terminalization. */
  lockForReconciliation(input: JobLookupInput): Promise<GenerationJobRecord | null>;
  claimNext(input: JobClaimInput): Promise<JobClaimResult>;
  heartbeat(input: JobHeartbeatInput): Promise<JobHeartbeatResult>;
  requestRunningCancellation(input: JobLookupInput): Promise<JobRunningCancellationResult>;
  cancelQueued(input: JobLookupInput): Promise<JobCancelQueuedResult>;
  requeueRunning(input: JobRequeueInput): Promise<JobRequeueResult>;
  transitionQueuedToTerminal(input: JobQueuedTerminalInput): Promise<JobTerminalTransitionResult>;
  transitionRunningToTerminal(input: JobRunningTerminalInput): Promise<JobTerminalTransitionResult>;
  /** Legacy atomic seam retained for callers without W3.3 reconciliation capability. */
  reclaimNextExpired(input: JobReclaimInput): Promise<JobReclaimResult>;
  lockNextExpiredForReclaim(input: JobReclaimInput): Promise<JobExpiredReclaimLockResult>;
  applyLockedExpiredReclaim(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly outcome: 'requeue' | 'cancel';
  }): Promise<JobReclaimResult>;
  lockForFencedPublish(identity: JobLeaseIdentity): Promise<JobFencedLockResult>;
  /** Locks exact running, unexpired, uncancelled lease owner or returns non-enumerating denial. */
  lockLiveOwnerForAttempt(identity: JobLeaseIdentity): Promise<JobLiveOwnerLockResult>;
  lockForFinalization(identity: JobLeaseIdentity): Promise<JobFinalizationLockResult>;
}

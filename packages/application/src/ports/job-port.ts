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
  | { readonly kind: 'binding_invalid' };

export interface JobLookupInput {
  readonly projectId: string;
  readonly jobId: string;
}

export interface JobClaimInput {
  readonly projectId: string;
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

export interface JobReclaimInput {
  readonly projectId: string;
}

export type JobReclaimResult =
  | { readonly kind: 'requeued'; readonly job: GenerationJobRecord }
  | { readonly kind: 'cancelled'; readonly job: GenerationJobRecord }
  | { readonly kind: 'none' };

export type JobFencedLockResult =
  { readonly kind: 'locked'; readonly job: GenerationJobRecord } | { readonly kind: 'lost' };

export interface JobPort {
  insert(input: JobInsertInput): Promise<JobInsertResult>;
  findById(input: JobLookupInput): Promise<GenerationJobRecord | null>;
  listActiveByProject(projectId: string): Promise<readonly GenerationJobRecord[]>;
  lockForUpdate(input: JobLookupInput): Promise<GenerationJobRecord | null>;
  claimNext(input: JobClaimInput): Promise<JobClaimResult>;
  heartbeat(input: JobHeartbeatInput): Promise<JobHeartbeatResult>;
  requestRunningCancellation(input: JobLookupInput): Promise<JobRunningCancellationResult>;
  cancelQueued(input: JobLookupInput): Promise<JobCancelQueuedResult>;
  requeueRunning(input: JobRequeueInput): Promise<JobRequeueResult>;
  transitionQueuedToTerminal(input: JobQueuedTerminalInput): Promise<JobTerminalTransitionResult>;
  transitionRunningToTerminal(input: JobRunningTerminalInput): Promise<JobTerminalTransitionResult>;
  reclaimNextExpired(input: JobReclaimInput): Promise<JobReclaimResult>;
  lockForFencedPublish(identity: JobLeaseIdentity): Promise<JobFencedLockResult>;
}

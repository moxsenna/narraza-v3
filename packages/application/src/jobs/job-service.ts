import type {
  JobClaimResult,
  JobHeartbeatResult,
  JobReclaimResult,
  JobRequeueResult,
  JobTerminalTransitionResult,
  RunningTerminalStatus,
} from '../ports/job-port.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type {
  GenerationJobRecord,
  JobLeaseIdentity,
  JsonObject,
  TerminalJobStatus,
} from '../ports/types.js';

export interface CancelInput {
  readonly projectId: string;
  readonly jobId: string;
}

export type CancelResult =
  | { readonly kind: 'cancelled'; readonly job: GenerationJobRecord }
  | { readonly kind: 'cancellation_requested' }
  | { readonly kind: 'cancellation_already_requested' }
  | { readonly kind: 'already_terminal'; readonly status: TerminalJobStatus }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'ledger_binding_invalid' }
  | { readonly kind: 'state_conflict' };

export interface ManualRetryInput {
  readonly projectId: string;
  readonly sourceJobId: string;
  /** Positive whole milliseconds; adapter resolves availability as DB `NOW()` plus this delay. */
  readonly availableInMs: number;
  readonly reservationId: string | null;
}

export type ManualRetryResult =
  | { readonly kind: 'created'; readonly job: GenerationJobRecord }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'source_not_terminal'; readonly status: 'queued' | 'running' }
  | { readonly kind: 'source_not_retryable'; readonly status: 'succeeded' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'reservation_binding_invalid' };

export interface ClaimInput {
  readonly leaseToken: string;
  readonly leaseDurationMs: number;
}

export interface HeartbeatInput extends JobLeaseIdentity {
  readonly leaseDurationMs: number;
}

export interface RequeueInput extends JobLeaseIdentity {
  readonly delayMs: number;
}

export interface FinishInput extends JobLeaseIdentity {
  readonly status: RunningTerminalStatus;
}

export type ReclaimOneInput = Record<string, never>;

export interface FencedPublishSentinelInput {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly dedupeKey: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface FencedPublishContext {
  readonly appendSentinel: (input: FencedPublishSentinelInput) => Promise<void>;
}

export type FencedPublishResult =
  | { readonly kind: 'published'; readonly job: GenerationJobRecord }
  | { readonly kind: 'lost' }
  | { readonly kind: 'already_terminal'; readonly status: TerminalJobStatus }
  | { readonly kind: 'lost_ownership' }
  | { readonly kind: 'cancellation_required' }
  | { readonly kind: 'cancellation_blocks_success' };

export interface JobService {
  cancel(input: CancelInput): Promise<CancelResult>;
  manualRetry(input: ManualRetryInput): Promise<ManualRetryResult>;
  claim(input: ClaimInput): Promise<JobClaimResult>;
  heartbeat(input: HeartbeatInput): Promise<JobHeartbeatResult>;
  requeue(input: RequeueInput): Promise<JobRequeueResult>;
  finish(input: FinishInput): Promise<JobTerminalTransitionResult>;
  reclaimOne(input: ReclaimOneInput): Promise<JobReclaimResult>;
  withFencedPublish(
    identity: JobLeaseIdentity,
    publish: (context: FencedPublishContext) => Promise<void>,
  ): Promise<FencedPublishResult>;
}

/**
 * Sentinels force a transaction rollback while carrying the typed outcome back to
 * the caller. Message/name stay free of serialization/deadlock vocabulary so the
 * UnitOfWork never classifies them as retryable.
 */
class CancelRollback extends Error {
  constructor(readonly result: CancelResult) {
    super('Job transaction must roll back');
    this.name = 'CancelRollback';
  }
}

class FencedPublishRollback extends Error {
  constructor(readonly result: FencedPublishResult) {
    super('Job transaction must roll back');
    this.name = 'FencedPublishRollback';
  }
}

export function createJobService(unitOfWork: UnitOfWork): JobService {
  return {
    async cancel(input) {
      try {
        return await unitOfWork.execute<CancelResult>(async (ports) => {
          const current = await ports.job.lockForUpdate(input);
          if (current === null) return { kind: 'not_found' };

          if (current.status === 'queued') {
            if (current.reservationId !== null) {
              const release = await ports.ledger.releaseQueuedCancellation({
                projectId: input.projectId,
                jobId: input.jobId,
                reservationId: current.reservationId,
                ledgerEntryId: ports.allocateId(),
                dedupeKey: `release:${current.reservationId}:queued-cancel`,
                entryType: 'release',
                direction: 'credit',
              });
              if (release.kind === 'binding_invalid') {
                throw new CancelRollback({ kind: 'ledger_binding_invalid' });
              }
            }

            const cancelled = await ports.job.cancelQueued(input);
            if (cancelled.kind === 'state_conflict') {
              throw new CancelRollback({ kind: 'state_conflict' });
            }
            return cancelled;
          }

          if (current.status === 'running') {
            const requested = await ports.job.requestRunningCancellation(input);
            switch (requested.kind) {
              case 'requested':
                return { kind: 'cancellation_requested' };
              case 'already_requested':
                return { kind: 'cancellation_already_requested' };
              case 'state_conflict':
                return { kind: 'state_conflict' };
              default: {
                const _never: never = requested;
                return _never;
              }
            }
          }

          const terminal: TerminalJobStatus = current.status;
          return { kind: 'already_terminal', status: terminal };
        });
      } catch (error) {
        if (error instanceof CancelRollback) return error.result;
        throw error;
      }
    },

    async manualRetry(input) {
      return unitOfWork.execute(async (ports) => {
        const source = await ports.job.lockForUpdate({
          projectId: input.projectId,
          jobId: input.sourceJobId,
        });
        if (source === null) return { kind: 'not_found' as const };
        if (source.status === 'queued' || source.status === 'running') {
          return { kind: 'source_not_terminal' as const, status: source.status };
        }
        if (source.status === 'succeeded') {
          return { kind: 'source_not_retryable' as const, status: source.status };
        }

        const inserted = await ports.job.insert({
          id: ports.allocateId(),
          projectId: source.projectId,
          kind: source.kind,
          priority: source.priority,
          availableInMs: input.availableInMs,
          retryOfJobId: source.id,
          bundleId: source.bundleId,
          workflowPlanId: source.workflowPlanId,
          reservationId: input.reservationId,
          schemaVersion: source.schemaVersion,
          payload: source.payload,
        });
        switch (inserted.kind) {
          case 'inserted':
            return { kind: 'created', job: inserted.job };
          case 'conflict':
            return { kind: 'conflict' };
          case 'binding_invalid':
            return { kind: 'reservation_binding_invalid' };
        }
      });
    },

    claim(input) {
      return unitOfWork.execute((ports) => ports.job.claimNext(input));
    },

    heartbeat(input) {
      return unitOfWork.execute((ports) => ports.job.heartbeat(input));
    },

    requeue(input) {
      return unitOfWork.execute((ports) => ports.job.requeueRunning(input));
    },

    finish(input) {
      return unitOfWork.execute((ports) => ports.job.transitionRunningToTerminal(input));
    },

    reclaimOne(input) {
      return unitOfWork.execute((ports) => ports.job.reclaimNextExpired(input));
    },

    async withFencedPublish(identity, publish) {
      try {
        return await unitOfWork.execute<FencedPublishResult>(async (ports) => {
          const lock = await ports.job.lockForFencedPublish(identity);
          if (lock.kind === 'lost') return { kind: 'lost' };

          const context: FencedPublishContext = {
            appendSentinel: async (input) => {
              const id = ports.allocateId();
              const occurredAt = await ports.dbNow();
              await ports.outbox.append({
                ...input,
                id,
                occurredAt,
              });
            },
          };
          await publish(context);

          const terminal = await ports.job.transitionRunningToTerminal({
            ...identity,
            status: 'succeeded',
          });
          if (terminal.kind !== 'terminalized') {
            throw new FencedPublishRollback(terminal);
          }
          return { kind: 'published', job: terminal.job };
        });
      } catch (error) {
        if (error instanceof FencedPublishRollback) return error.result;
        throw error;
      }
    },
  };
}

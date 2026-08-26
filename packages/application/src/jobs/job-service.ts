import type { ActionFundingModel } from '../credits/action-funding-policy.js';
import {
  recordMissingJobReservationIncident,
  reconcileTerminalReservation,
  type MissingReservationViolation,
} from '../credits/reservation-reconciliation-service.js';
import {
  resolveFundingModel,
  validateFundingModelEnqueue,
} from '../credits/action-funding-policy.js';
import type {
  JobClaimResult,
  JobHeartbeatResult,
  JobReclaimResult,
  JobRequeueResult,
  JobTerminalTransitionResult,
  RunningTerminalStatus,
} from '../ports/job-port.js';
import type { TxPorts, UnitOfWork } from '../ports/unit-of-work.js';
import type { UsableOutputClassification } from '../ports/usable-output-classifier.js';
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
  | { readonly kind: 'reservation_binding_invalid' }
  | { readonly kind: 'funding_model_mismatch' }
  | {
      readonly kind: 'funding_model_violation';
      readonly reason:
        'missing_reservation_for_paid' | 'missing_reservation_for_system_funded' | 'unknown_kind';
      readonly fundingModel?: ActionFundingModel;
    };

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

export interface FencedPublishOptions {
  /** Opt-in W3.3 capability. Omission preserves W3.1/W3.2 sentinel behavior. */
  readonly settleUsableOutput?: boolean;
}

export type FencedPublishResult =
  | { readonly kind: 'published'; readonly job: GenerationJobRecord }
  | { readonly kind: 'project_tombstoned' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'already_terminal'; readonly status: TerminalJobStatus }
  | { readonly kind: 'lost_ownership' }
  | { readonly kind: 'cancellation_required' }
  | { readonly kind: 'cancellation_blocks_success' }
  | { readonly kind: 'funding_model_conflict' }
  | (MissingReservationViolation & { readonly job: GenerationJobRecord });

/**
 * Service-level finish outcome: either the port's terminal transition or a
 * funding-binding violation carrying the committed terminal job.
 */
export type JobFinishResult =
  | JobTerminalTransitionResult
  | (MissingReservationViolation & { readonly job: GenerationJobRecord });

/**
 * Service-level reclaim outcome: either the port's reclaim result or a
 * funding-binding violation carrying the committed cancelled job.
 */
export type JobReclaimServiceResult =
  JobReclaimResult | (MissingReservationViolation & { readonly job: GenerationJobRecord });

export interface JobService {
  cancel(input: CancelInput): Promise<CancelResult>;
  manualRetry(input: ManualRetryInput): Promise<ManualRetryResult>;
  claim(input: ClaimInput): Promise<JobClaimResult>;
  heartbeat(input: HeartbeatInput): Promise<JobHeartbeatResult>;
  requeue(input: RequeueInput): Promise<JobRequeueResult>;
  finish(input: FinishInput): Promise<JobFinishResult>;
  reclaimOne(input: ReclaimOneInput): Promise<JobReclaimServiceResult>;
  withFencedPublish(
    identity: JobLeaseIdentity,
    publish: (context: FencedPublishContext) => Promise<void>,
    options?: FencedPublishOptions,
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

/**
 * Thrown when the reclaim cancellation CAS loses after a funding incident was
 * recorded, so the incident never commits without cancellation evidence.
 */
class ReclaimRollback extends Error {
  constructor() {
    super('Job transaction must roll back');
    this.name = 'ReclaimRollback';
  }
}

async function settleUsableOutput(
  ports: TxPorts,
  userId: string,
  job: GenerationJobRecord,
  output: Extract<UsableOutputClassification, { kind: 'usable' }>,
): Promise<void> {
  const allocationPort = ports.creditBillingAllocation;
  if (allocationPort === undefined)
    throw new Error('usable-output settlement capability unavailable');
  const fundingModel = resolveFundingModel(job.kind);
  if (job.reservationId === null) {
    if (fundingModel === 'pre_d4_legacy') return;
    throw new Error('funding_model_violation: usable paid output has no reservation');
  }

  const reservation = await ports.creditReservation.lockBound({
    reservationId: job.reservationId,
    projectId: job.projectId,
    jobId: job.id,
  });
  if (reservation === null || reservation.status !== 'open') {
    throw new Error('usable-output settlement reservation binding invalid');
  }

  if (fundingModel !== 'pre_d4_legacy' && reservation.fundingModel !== fundingModel) {
    throw new FencedPublishRollback({ kind: 'funding_model_conflict' });
  }
  if (
    fundingModel === 'pre_d4_legacy' &&
    reservation.fundingModel !== null &&
    reservation.fundingModel !== 'user_paid' &&
    reservation.fundingModel !== 'system_funded'
  ) {
    throw new FencedPublishRollback({ kind: 'funding_model_conflict' });
  }

  const effectiveFundingModel =
    fundingModel === 'pre_d4_legacy' ? reservation.fundingModel : fundingModel;
  if (effectiveFundingModel === 'system_funded') {
    await reconcileTerminalReservation(ports, {
      ownerUserId: userId,
      job,
      terminalReason: 'released',
    });
    return;
  }

  const cost = await allocationPort.sumEligibleProviderCost({
    projectId: job.projectId,
    jobId: job.id,
    contributingAttemptIds: output.contributingAttemptIds,
  });
  if (cost.kind !== 'summed') {
    throw new Error('usable-output contributing attempts are not eligible winners');
  }

  const intendedSettlement = cost.providerCostMicroIdr;
  const actualSettlement =
    intendedSettlement < reservation.reservedMicroIdr
      ? intendedSettlement
      : reservation.reservedMicroIdr;
  const subsidy = intendedSettlement - actualSettlement;
  const allocationDedupeKey =
    `allocation:${reservation.id}:${output.outputKind}:${output.outputRef}` as const;
  const allocation = await allocationPort.appendForUsableOutput({
    id: allocationDedupeKey,
    projectId: job.projectId,
    jobId: job.id,
    reservationId: reservation.id,
    usableOutputKind: output.outputKind,
    usableOutputRef: output.outputRef,
    contributingAttemptIds: output.contributingAttemptIds,
    providerCostMicroIdr: intendedSettlement,
    userSettlementMicroIdr: actualSettlement,
    systemSubsidyMicroIdr: subsidy,
    dedupeKey: allocationDedupeKey,
  });
  if (allocation.kind === 'conflict' || allocation.kind === 'attempt_binding_invalid') {
    throw new Error(`usable-output allocation ${allocation.kind}`);
  }
  const durableAllocationId = allocation.allocationId;

  await reconcileTerminalReservation(ports, {
    ownerUserId: userId,
    job,
    terminalReason: 'released',
    settlement: {
      allocationId: durableAllocationId,
      userSettlementMicroIdr: actualSettlement,
    },
    releaseReason: 'invocation_completed',
  });

  if (subsidy > 0n && fundingModel !== 'pre_d4_legacy') {
    const appendIncident = ports.outbox.appendCreditOverageIncident;
    if (appendIncident === undefined) {
      throw new Error('credit-overage incident capability unavailable');
    }
    const incidentDedupeKey =
      `incident:credit-overage:${reservation.id}:${durableAllocationId}` as const;
    const incident = await appendIncident({
      id: incidentDedupeKey,
      reservationId: reservation.id,
      allocationId: durableAllocationId,
      intendedSettlementMicroIdr: intendedSettlement,
      actualSettlementMicroIdr: actualSettlement,
      systemSubsidyMicroIdr: subsidy,
      dedupeKey: incidentDedupeKey,
    });
    if (incident.kind === 'conflict') {
      throw new Error('credit-overage incident conflict');
    }
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

        // Funding-model enqueue guard: executed strictly before ports.job.insert
        const validation = validateFundingModelEnqueue({
          kind: source.kind,
          reservationId: input.reservationId,
        });
        if (!validation.valid) {
          return validation.fundingModel !== undefined
            ? {
                kind: 'funding_model_violation' as const,
                reason: validation.reason,
                fundingModel: validation.fundingModel,
              }
            : {
                kind: 'funding_model_violation' as const,
                reason: validation.reason,
              };
        }

        const inserted = await ports.job.insert({
          id: ports.allocateId(),
          projectId: source.projectId,
          kind: source.kind,
          fundingModel: validation.fundingModel,
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
          case 'funding_model_mismatch':
            return { kind: 'funding_model_mismatch' };
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
      return unitOfWork.execute<JobFinishResult>(async (ports) => {
        if (ports.creditReservation === undefined) {
          return ports.job.transitionRunningToTerminal(input);
        }
        const project = await ports.project.lockForUpdate(input.projectId);
        if (project === null) return { kind: 'lost_ownership' as const };

        // Funding-binding preflight under lock: a known nonlegacy unbounded job
        // must never fake success; commit failed instead.
        const locked = await ports.job.lockForUpdate({
          projectId: input.projectId,
          jobId: input.jobId,
        });
        const unboundedSuccess =
          locked !== null &&
          locked.reservationId === null &&
          input.status === 'succeeded' &&
          resolveFundingModel(locked.kind) !== 'pre_d4_legacy';

        const terminal = await ports.job.transitionRunningToTerminal(
          unboundedSuccess ? { ...input, status: 'failed' } : input,
        );
        if (terminal.kind !== 'terminalized') return terminal;

        const reconciled = await reconcileTerminalReservation(ports, {
          ownerUserId: project.ownerUserId,
          job: terminal.job,
          terminalReason:
            (unboundedSuccess ? 'failed' : input.status) === 'cancelled' ? 'cancelled' : 'released',
        });
        if (reconciled.kind === 'funding_model_violation') {
          return { ...reconciled, job: terminal.job };
        }
        return terminal;
      });
    },

    async reclaimOne(input) {
      try {
        return await unitOfWork.execute<JobReclaimServiceResult>(async (ports) => {
          if (
            ports.creditReservation === undefined ||
            ports.job.lockNextExpiredForReclaim === undefined ||
            ports.job.applyLockedExpiredReclaim === undefined
          ) {
            return ports.job.reclaimNextExpired(input);
          }
          const candidate = await ports.job.lockNextExpiredForReclaim(input);
          if (candidate.kind === 'none') return candidate;
          let violation: MissingReservationViolation | undefined;
          if (candidate.outcome === 'cancel') {
            const reconciled = await reconcileTerminalReservation(ports, {
              ownerUserId: candidate.ownerUserId,
              job: candidate.job,
              terminalReason: 'cancelled',
            });
            if (reconciled.kind === 'funding_model_violation') violation = reconciled;
          }
          const applied = await ports.job.applyLockedExpiredReclaim({
            projectId: candidate.job.projectId,
            jobId: candidate.job.id,
            outcome: candidate.outcome,
          });
          if (applied.kind === 'none') throw new ReclaimRollback();
          if (violation) return { ...violation, job: applied.job };
          return applied;
        });
      } catch (error) {
        if (error instanceof ReclaimRollback) return { kind: 'none' as const };
        throw error;
      }
    },

    async withFencedPublish(identity, publish, options) {
      try {
        return await unitOfWork.execute<FencedPublishResult>(async (ports) => {
          const project = await ports.project.lockForUpdate(identity.projectId);
          if (project === null || project.deletedAt !== null) {
            return { kind: 'project_tombstoned' };
          }

          const lock = await ports.job.lockForFencedPublish(identity);
          if (lock.kind === 'lost') return { kind: 'lost' };

          // Funding-binding preflight: a known nonlegacy unbounded job can never
          // publish successfully. Record the durable incident, transition the
          // running job to failed, and skip callback, classifier, sentinel,
          // allocation, ledger, and reservation reconciliation entirely.
          if (
            lock.job.reservationId === null &&
            resolveFundingModel(lock.job.kind) !== 'pre_d4_legacy'
          ) {
            const recorded = await recordMissingJobReservationIncident(ports, lock.job);
            if (recorded.kind === 'funding_model_violation') {
              const terminal = await ports.job.transitionRunningToTerminal({
                ...identity,
                status: 'failed',
              });
              if (terminal.kind !== 'terminalized') {
                throw new FencedPublishRollback(terminal);
              }
              return { ...recorded, job: terminal.job };
            }
          }

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

          if (options?.settleUsableOutput === true) {
            const classifier = ports.usableOutputClassifier;
            if (classifier === undefined) {
              throw new Error('usable-output classifier capability unavailable');
            }
            const classification = await classifier.classifyPublishedOutput({
              projectId: identity.projectId,
              jobId: identity.jobId,
              jobKind: lock.job.kind,
            });
            if (classification.kind === 'usable') {
              await settleUsableOutput(ports, project.ownerUserId, lock.job, classification);
            } else {
              await reconcileTerminalReservation(ports, {
                ownerUserId: project.ownerUserId,
                job: lock.job,
                terminalReason: 'released',
              });
            }
          }

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

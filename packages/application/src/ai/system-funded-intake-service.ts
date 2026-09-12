import { createHash } from 'node:crypto';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { GenerationJobRecord, JsonObject } from '../ports/types.js';

export const DEFAULT_INTAKE_FAIR_USE_DAILY_LIMIT = 60 as const;

export class SystemFundedIntakeRollbackError extends Error {
  constructor() {
    super('system-funded intake transaction must roll back');
    this.name = 'SystemFundedIntakeRollbackError';
  }
}

export interface CreateSystemFundedIntakeInput {
  readonly requestId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly bundleId: string;
  readonly workflowPlanId: string;
  readonly workflowPlanHash: string;
  readonly dependencyHash: string;
  readonly budgetMicroIdr: bigint;
  readonly payload: JsonObject;
  readonly dailyLimit?: number;
}

export type CreateSystemFundedIntakeResult =
  | {
      readonly kind: 'accepted' | 'exact_replay';
      readonly job: GenerationJobRecord;
      readonly reservationId: string;
    }
  | { readonly kind: 'fair_use_limited'; readonly limit: number }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

function deterministicId(prefix: string, requestId: string): string {
  return `${prefix}-${createHash('sha256').update(requestId).digest('hex').slice(0, 32)}`;
}

/** Opaque stable counter key; DB never receives raw user identity as key_hash. */
function fairUseKey(userId: string): string {
  return createHash('sha256').update(`m4-intake-fair-use\0${userId}`).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonObject;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function requestFingerprint(input: CreateSystemFundedIntakeInput): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        userId: input.userId,
        projectId: input.projectId,
        bundleId: input.bundleId,
        workflowPlanId: input.workflowPlanId,
        workflowPlanHash: input.workflowPlanHash,
        dependencyHash: input.dependencyHash,
        budgetMicroIdr: input.budgetMicroIdr.toString(),
        payload: input.payload,
      }),
    )
    .digest('hex');
}

function exactReplayMatches(
  job: GenerationJobRecord,
  input: CreateSystemFundedIntakeInput,
  jobId: string,
  reservationId: string,
  fingerprint: string,
): boolean {
  return (
    job.id === jobId &&
    job.projectId === input.projectId &&
    job.kind === 'chat_intake_reply' &&
    job.bundleId === input.bundleId &&
    job.workflowPlanId === input.workflowPlanId &&
    job.reservationId === reservationId &&
    job.payload.requestId === input.requestId &&
    job.payload.workflowPlanHash === input.workflowPlanHash &&
    job.payload.dependencyHash === input.dependencyHash &&
    job.payload.requestFingerprint === fingerprint
  );
}

export function createSystemFundedIntakeService(deps: { readonly unitOfWork: UnitOfWork }) {
  return {
    async create(input: CreateSystemFundedIntakeInput): Promise<CreateSystemFundedIntakeResult> {
      if (input.budgetMicroIdr <= 0n) return { kind: 'conflict' };
      const dailyLimit = input.dailyLimit ?? DEFAULT_INTAKE_FAIR_USE_DAILY_LIMIT;
      if (!Number.isSafeInteger(dailyLimit) || dailyLimit <= 0) return { kind: 'conflict' };

      const jobId = deterministicId('intake-job', input.requestId);
      const reservationId = deterministicId('intake-res', input.requestId);
      const dedupeKey = `system-budget:${jobId}`;
      const fingerprint = requestFingerprint(input);

      try {
        return await deps.unitOfWork.execute<CreateSystemFundedIntakeResult>(
          async (ports) => {
            const intake = ports.systemFundedIntake;
            if (!intake) throw new Error('system-funded intake port not configured');

            const binding = await intake.loadBinding({
              projectId: input.projectId,
              workflowPlanId: input.workflowPlanId,
              bundleId: input.bundleId,
            });
            if (
              binding === null ||
              binding.workflowKind !== 'chat_intake_reply' ||
              binding.workflowPlanHash !== input.workflowPlanHash ||
              binding.dependencyHash !== input.dependencyHash ||
              binding.estimatedMaxMicroIdr !== input.budgetMicroIdr
            ) {
              return { kind: 'conflict' };
            }

            // Replay is free: exact persisted request and live reservation binding
            // return before quota mutation.
            const replay = await ports.job.findById({ projectId: input.projectId, jobId });
            if (replay) {
              const reservation = await ports.creditReservation.lockBound({
                reservationId,
                projectId: input.projectId,
                jobId,
              });
              return exactReplayMatches(replay, input, jobId, reservationId, fingerprint) &&
                reservation !== null &&
                reservation.userId === input.userId &&
                reservation.fundingModel === 'system_funded' &&
                reservation.reservedMicroIdr === binding.estimatedMaxMicroIdr
                ? { kind: 'exact_replay', job: replay, reservationId }
                : { kind: 'conflict' };
            }

            const project = await ports.project.lockForUpdate(input.projectId);
            if (
              project === null ||
              project.deletedAt !== null ||
              project.ownerUserId !== input.userId ||
              project.status !== 'active'
            ) {
              return { kind: 'not_found' };
            }

            // A concurrent identical request can commit while this transaction waits
            // for the project lock. Re-check replay before consuming quota.
            const replayAfterLock = await ports.job.findById({
              projectId: input.projectId,
              jobId,
            });
            if (replayAfterLock) {
              const reservation = await ports.creditReservation.lockBound({
                reservationId,
                projectId: input.projectId,
                jobId,
              });
              return exactReplayMatches(
                replayAfterLock,
                input,
                jobId,
                reservationId,
                fingerprint,
              ) &&
                reservation !== null &&
                reservation.userId === input.userId &&
                reservation.fundingModel === 'system_funded' &&
                reservation.reservedMicroIdr === binding.estimatedMaxMicroIdr
                ? { kind: 'exact_replay', job: replayAfterLock, reservationId }
                : { kind: 'conflict' };
            }

            const admitted = await intake.acceptDailyGeneration({
              userId: fairUseKey(input.userId),
              limit: dailyLimit,
            });
            if (admitted.kind === 'limited') {
              return { kind: 'fair_use_limited', limit: dailyLimit };
            }

            const created = await intake.createReservation({
              id: reservationId,
              userId: input.userId,
              projectId: input.projectId,
              jobId,
              budgetMicroIdr: binding.estimatedMaxMicroIdr,
              dedupeKey,
            });
            if (created.kind !== 'created') throw new SystemFundedIntakeRollbackError();

            const inserted = await ports.job.insert({
              id: jobId,
              projectId: input.projectId,
              kind: 'chat_intake_reply',
              fundingModel: 'system_funded',
              priority: 0,
              availableInMs: 0,
              retryOfJobId: null,
              bundleId: input.bundleId,
              workflowPlanId: input.workflowPlanId,
              reservationId,
              schemaVersion: 1,
              payload: {
                ...input.payload,
                requestId: input.requestId,
                workflowPlanHash: input.workflowPlanHash,
                dependencyHash: binding.dependencyHash,
                requestFingerprint: fingerprint,
                systemBudgetDedupeKey: dedupeKey,
              },
            });
            if (inserted.kind !== 'inserted') throw new SystemFundedIntakeRollbackError();

            return { kind: 'accepted', job: inserted.job, reservationId };
          },
          { isolation: 'read_committed', requestId: input.requestId },
        );
      } catch (error) {
        if (error instanceof SystemFundedIntakeRollbackError) return { kind: 'conflict' };
        throw error;
      }
    },
  };
}

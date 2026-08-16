import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  JobInsertInput,
  JobInsertResult,
  JobPort,
  JobTerminalTransitionResult,
} from '../ports/job-port.js';
import type { LedgerPort } from '../ports/ledger-port.js';
import type { TxPorts, UnitOfWork } from '../ports/unit-of-work.js';
import type {
  GenerationJobRecord,
  JobLeaseIdentity,
  JsonObject,
  TerminalJobStatus,
} from '../ports/types.js';
import {
  createJobService,
  type CancelResult,
  type FencedPublishContext,
  type FencedPublishResult,
  type FencedPublishSentinelInput,
  type ManualRetryInput,
  type ManualRetryResult,
} from './job-service.js';

const fixedDate = new Date('2026-07-26T12:00:00.000Z');

function job(overrides: Partial<GenerationJobRecord> = {}): GenerationJobRecord {
  return {
    id: 'job-1',
    projectId: 'project-1',
    kind: 'draft_generation',
    status: 'queued',
    priority: 7,
    availableAt: fixedDate,
    leaseToken: null,
    leaseExpiresAt: null,
    fenceVersion: 0,
    cancelRequestedAt: null,
    retryOfJobId: null,
    bundleId: 'bundle-1',
    workflowPlanId: 'plan-1',
    reservationId: 'reservation-old',
    schemaVersion: 2,
    payload: { prompt: 'source' },
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

interface HarnessOptions {
  readonly projectDeletedAt?: Date | null;
  readonly lockedJob?: GenerationJobRecord | null;
  readonly releaseResult?:
    | { readonly kind: 'released' }
    | { readonly kind: 'already_released' }
    | { readonly kind: 'binding_invalid' };
  readonly cancelQueuedResult?:
    | { readonly kind: 'cancelled'; readonly job: GenerationJobRecord }
    | { readonly kind: 'state_conflict' };
}

function makeHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  let executeCount = 0;
  let allocated = 0;

  const jobPort = {
    insert: vi.fn(),
    findById: vi.fn(),
    listActiveByProject: vi.fn(),
    lockForUpdate: vi.fn(async () => {
      calls.push('job.lockForUpdate');
      return options.lockedJob === undefined ? job() : options.lockedJob;
    }),
    claimNext: vi.fn(),
    heartbeat: vi.fn(),
    requestRunningCancellation: vi.fn<JobPort['requestRunningCancellation']>(async () => {
      calls.push('job.requestRunningCancellation');
      return { kind: 'requested' as const };
    }),
    cancelQueued: vi.fn(async () => {
      calls.push('job.cancelQueued');
      return (
        options.cancelQueuedResult ?? {
          kind: 'cancelled' as const,
          job: job({ status: 'cancelled' }),
        }
      );
    }),
    requeueRunning: vi.fn(),
    transitionQueuedToTerminal: vi.fn(),
    transitionRunningToTerminal: vi.fn(),
    reclaimNextExpired: vi.fn(),
    lockForFencedPublish: vi.fn(),
    lockLiveOwnerForAttempt: vi.fn(),
  } satisfies JobPort;

  const ledgerPort = {
    releaseQueuedCancellation: vi.fn(async () => {
      calls.push('ledger.releaseQueuedCancellation');
      return options.releaseResult ?? { kind: 'released' as const };
    }),
  } satisfies LedgerPort;

  const ports = {
    project: {
      lockForUpdate: vi.fn(async () => {
        calls.push('project.lockForUpdate');
        return { deletedAt: options.projectDeletedAt ?? null };
      }),
    },
    job: jobPort,
    ledger: ledgerPort,
    allocateId: () => {
      calls.push('allocateId');
      return `allocated-${++allocated}`;
    },
    dbNow: vi.fn(async () => {
      calls.push('dbNow');
      return fixedDate;
    }),
    outbox: {
      append: vi.fn(async () => {
        calls.push('outbox.append');
      }),
    },
  } as unknown as TxPorts;

  const unitOfWork: UnitOfWork = {
    async execute<T>(fn: (txPorts: TxPorts) => Promise<T>): Promise<T> {
      executeCount += 1;
      calls.push('begin');
      try {
        const result = await fn(ports);
        calls.push('commit');
        return result;
      } catch (error) {
        calls.push('rollback');
        throw error;
      }
    },
  };

  return {
    calls,
    jobPort,
    ledgerPort,
    ports,
    unitOfWork,
    executeCount: () => executeCount,
  };
}

const identity: JobLeaseIdentity = {
  projectId: 'project-1',
  jobId: 'job-1',
  leaseToken: 'lease-1',
  fenceVersion: 4,
};

describe('job cancellation', () => {
  it('locks job first, releases exact queued reservation, CASes cancellation, then commits', async () => {
    const h = makeHarness();
    const service = createJobService(h.unitOfWork);

    const result = await service.cancel({ projectId: 'project-1', jobId: 'job-1' });

    expect(result).toEqual({ kind: 'cancelled', job: job({ status: 'cancelled' }) });
    expect(h.calls).toEqual([
      'begin',
      'job.lockForUpdate',
      'allocateId',
      'ledger.releaseQueuedCancellation',
      'job.cancelQueued',
      'commit',
    ]);
    expect(h.jobPort.lockForUpdate).toHaveBeenCalledWith({
      projectId: 'project-1',
      jobId: 'job-1',
    });
    expect(h.ledgerPort.releaseQueuedCancellation).toHaveBeenCalledWith({
      projectId: 'project-1',
      jobId: 'job-1',
      reservationId: 'reservation-old',
      ledgerEntryId: 'allocated-1',
      dedupeKey: 'release:reservation-old:queued-cancel',
      entryType: 'release',
      direction: 'credit',
    });
    expect(h.jobPort.cancelQueued).toHaveBeenCalledWith({
      projectId: 'project-1',
      jobId: 'job-1',
    });
    expect(h.executeCount()).toBe(1);
  });

  it('cancels queued job without reservation and never invents a ledger binding', async () => {
    const h = makeHarness({ lockedJob: job({ reservationId: null }) });

    const result = await createJobService(h.unitOfWork).cancel({
      projectId: 'project-1',
      jobId: 'job-1',
    });

    expect(result.kind).toBe('cancelled');
    expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'job.cancelQueued', 'commit']);
    expect(h.ledgerPort.releaseQueuedCancellation).not.toHaveBeenCalled();
  });

  it('treats an already-released reservation as idempotent success without rollback', async () => {
    const h = makeHarness({ releaseResult: { kind: 'already_released' } });

    const result = await createJobService(h.unitOfWork).cancel({
      projectId: 'project-1',
      jobId: 'job-1',
    });

    expect(result).toEqual({ kind: 'cancelled', job: job({ status: 'cancelled' }) });
    expect(h.calls).toEqual([
      'begin',
      'job.lockForUpdate',
      'allocateId',
      'ledger.releaseQueuedCancellation',
      'job.cancelQueued',
      'commit',
    ]);
    expect(h.ledgerPort.releaseQueuedCancellation).toHaveBeenCalledOnce();
    expect(h.calls).not.toContain('rollback');
  });

  it.each([
    ['requested', 'cancellation_requested'],
    ['already_requested', 'cancellation_already_requested'],
  ] as const)(
    'running cancellation %s calls only requestRunningCancellation',
    async (portKind, resultKind) => {
      const h = makeHarness({
        lockedJob: job({
          status: 'running',
          leaseToken: 'lease-1',
          leaseExpiresAt: fixedDate,
          fenceVersion: 4,
        }),
      });
      h.jobPort.requestRunningCancellation.mockImplementationOnce(async () => {
        h.calls.push('job.requestRunningCancellation');
        return { kind: portKind };
      });

      const result = await createJobService(h.unitOfWork).cancel({
        projectId: 'project-1',
        jobId: 'job-1',
      });

      expect(result).toEqual({ kind: resultKind });
      expect(h.jobPort.requestRunningCancellation).toHaveBeenCalledWith({
        projectId: 'project-1',
        jobId: 'job-1',
      });
      expect(h.ledgerPort.releaseQueuedCancellation).not.toHaveBeenCalled();
      expect(h.jobPort.cancelQueued).not.toHaveBeenCalled();
      expect(h.calls).toEqual([
        'begin',
        'job.lockForUpdate',
        'job.requestRunningCancellation',
        'commit',
      ]);
    },
  );

  it.each(['succeeded', 'failed', 'dead', 'cancelled'] as const)(
    'keeps terminal %s job immutable',
    async (status) => {
      const h = makeHarness({ lockedJob: job({ status }) });

      const result = await createJobService(h.unitOfWork).cancel({
        projectId: 'project-1',
        jobId: 'job-1',
      });

      expect(result).toEqual({ kind: 'already_terminal', status });
      expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'commit']);
      expect(h.ledgerPort.releaseQueuedCancellation).not.toHaveBeenCalled();
      expect(h.jobPort.requestRunningCancellation).not.toHaveBeenCalled();
      expect(h.jobPort.cancelQueued).not.toHaveBeenCalled();
    },
  );

  it('already_terminal carries only terminal statuses, never queued or running', () => {
    expectTypeOf<TerminalJobStatus>().toEqualTypeOf<
      'succeeded' | 'failed' | 'dead' | 'cancelled'
    >();
    expectTypeOf<
      Extract<CancelResult, { readonly kind: 'already_terminal' }>['status']
    >().toEqualTypeOf<TerminalJobStatus>();
    expectTypeOf<
      Extract<FencedPublishResult, { readonly kind: 'already_terminal' }>['status']
    >().toEqualTypeOf<TerminalJobStatus>();
    expectTypeOf<
      Extract<JobTerminalTransitionResult, { readonly kind: 'already_terminal' }>['status']
    >().toEqualTypeOf<TerminalJobStatus>();
    expectTypeOf<'queued'>().not.toExtend<TerminalJobStatus>();
    expectTypeOf<'running'>().not.toExtend<TerminalJobStatus>();
  });

  it('propagates a non-sentinel thrown value unchanged out of cancel', async () => {
    const h = makeHarness();
    const failure = new Error('infrastructure exploded');
    h.jobPort.cancelQueued.mockImplementationOnce(async () => {
      h.calls.push('job.cancelQueued');
      throw failure;
    });

    await expect(
      createJobService(h.unitOfWork).cancel({ projectId: 'project-1', jobId: 'job-1' }),
    ).rejects.toBe(failure);
    expect(h.calls.at(-1)).toBe('rollback');
  });

  it('returns typed not-found after exact project-scoped lock', async () => {
    const h = makeHarness({ lockedJob: null });

    const result = await createJobService(h.unitOfWork).cancel({
      projectId: 'project-1',
      jobId: 'job-foreign',
    });

    expect(result).toEqual({ kind: 'not_found' });
    expect(h.jobPort.lockForUpdate).toHaveBeenCalledWith({
      projectId: 'project-1',
      jobId: 'job-foreign',
    });
    expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'commit']);
  });

  it('rolls back and maps invalid reservation binding', async () => {
    const h = makeHarness({ releaseResult: { kind: 'binding_invalid' } });

    const result = await createJobService(h.unitOfWork).cancel({
      projectId: 'project-1',
      jobId: 'job-1',
    });

    expect(result).toEqual({ kind: 'ledger_binding_invalid' });
    expect(h.calls).toEqual([
      'begin',
      'job.lockForUpdate',
      'allocateId',
      'ledger.releaseQueuedCancellation',
      'rollback',
    ]);
    expect(h.jobPort.cancelQueued).not.toHaveBeenCalled();
  });

  it('rolls back a release when queued cancellation CAS loses', async () => {
    const h = makeHarness({ cancelQueuedResult: { kind: 'state_conflict' } });

    const result = await createJobService(h.unitOfWork).cancel({
      projectId: 'project-1',
      jobId: 'job-1',
    });

    expect(result).toEqual({ kind: 'state_conflict' });
    expect(h.calls).toEqual([
      'begin',
      'job.lockForUpdate',
      'allocateId',
      'ledger.releaseQueuedCancellation',
      'job.cancelQueued',
      'rollback',
    ]);
  });
});

describe('manual retry', () => {
  const retryInput = {
    projectId: 'project-1',
    sourceJobId: 'job-1',
    availableInMs: 43_200_000,
    reservationId: 'reservation-new',
  } as const satisfies ManualRetryInput;

  it('schedules retries with a DB-resolved delay, never a caller-supplied wall clock', () => {
    expectTypeOf<ManualRetryInput>().toEqualTypeOf<{
      readonly projectId: string;
      readonly sourceJobId: string;
      readonly availableInMs: number;
      readonly reservationId: string | null;
    }>();
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('availableAt');
    expectTypeOf<JobInsertInput>().not.toHaveProperty('availableAt');
    expectTypeOf<JobInsertInput['availableInMs']>().toEqualTypeOf<number>();
    expectTypeOf<GenerationJobRecord['availableAt']>().toEqualTypeOf<Date>();
  });

  it('public input exposes only authorization and new state while result omits same_id', () => {
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('newJobId');
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('kind');
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('priority');
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('bundleId');
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('workflowPlanId');
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('schemaVersion');
    expectTypeOf<ManualRetryInput>().not.toHaveProperty('payload');
    expectTypeOf<Extract<ManualRetryResult, { readonly kind: 'same_id' }>>().toEqualTypeOf<never>();
  });

  it.each(['failed', 'dead', 'cancelled'] as const)(
    'allocates ID after validating %s source and inserts locked source context',
    async (status) => {
      const source = job({
        projectId: 'project-from-lock',
        status,
        kind: 'source-kind',
        priority: 13,
        bundleId: 'source-bundle',
        workflowPlanId: 'source-plan',
        reservationId: 'old-source-reservation',
        schemaVersion: 4,
        payload: { prompt: 'locked source payload' },
      });
      const sourceSnapshot = structuredClone(source);
      const inserted = job({
        id: 'allocated-1',
        projectId: source.projectId,
        status: 'queued',
        kind: source.kind,
        priority: source.priority,
        leaseToken: null,
        leaseExpiresAt: null,
        fenceVersion: 0,
        cancelRequestedAt: null,
        retryOfJobId: source.id,
        bundleId: source.bundleId,
        workflowPlanId: source.workflowPlanId,
        reservationId: retryInput.reservationId,
        schemaVersion: source.schemaVersion,
        payload: source.payload,
      });
      const h = makeHarness({ lockedJob: source });
      h.jobPort.insert.mockImplementationOnce(async (input) => {
        h.calls.push('job.insert');
        expect(input).toEqual({
          id: 'allocated-1',
          projectId: source.projectId,
          kind: source.kind,
          fundingModel: 'pre_d4_legacy',
          priority: source.priority,
          availableInMs: 43_200_000,
          retryOfJobId: source.id,
          bundleId: source.bundleId,
          workflowPlanId: source.workflowPlanId,
          reservationId: retryInput.reservationId,
          schemaVersion: source.schemaVersion,
          payload: source.payload,
        });
        expect(input.availableInMs).toBe(retryInput.availableInMs);
        expect(Object.hasOwn(input, 'availableAt')).toBe(false);
        expect(Object.hasOwn(input, 'status')).toBe(false);
        expect(Object.hasOwn(input, 'leaseToken')).toBe(false);
        expect(Object.hasOwn(input, 'cancelRequestedAt')).toBe(false);
        expect(Object.hasOwn(input, 'fenceVersion')).toBe(false);
        return { kind: 'inserted', job: inserted };
      });

      const result = await createJobService(h.unitOfWork).manualRetry(retryInput);

      expect(result).toEqual({ kind: 'created', job: inserted });
      expect(source).toEqual(sourceSnapshot);
      expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'allocateId', 'job.insert', 'commit']);
      expect(h.executeCount()).toBe(1);
    },
  );

  it('uses explicit null reservation and never copies source reservation', async () => {
    const h = makeHarness({
      lockedJob: job({ status: 'failed', reservationId: 'old-reservation' }),
    });
    h.jobPort.insert.mockImplementationOnce(async (input) => {
      h.calls.push('job.insert');
      return {
        kind: 'inserted',
        job: job({
          id: input.id,
          status: 'queued',
          retryOfJobId: 'job-1',
          reservationId: null,
        }),
      };
    });

    await createJobService(h.unitOfWork).manualRetry({ ...retryInput, reservationId: null });

    expect(h.jobPort.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: null, retryOfJobId: 'job-1' }),
    );
  });

  it.each(['queued', 'running'] as const)(
    'rejects %s source before allocating ID or inserting',
    async (status) => {
      const h = makeHarness({ lockedJob: job({ status }) });

      const result = await createJobService(h.unitOfWork).manualRetry(retryInput);

      expect(result).toEqual({ kind: 'source_not_terminal', status });
      expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'commit']);
      expect(h.jobPort.insert).not.toHaveBeenCalled();
    },
  );

  it('rejects succeeded source before allocating ID or inserting', async () => {
    const h = makeHarness({ lockedJob: job({ status: 'succeeded' }) });

    const result = await createJobService(h.unitOfWork).manualRetry(retryInput);

    expect(result).toEqual({ kind: 'source_not_retryable', status: 'succeeded' });
    expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'commit']);
    expect(h.jobPort.insert).not.toHaveBeenCalled();
  });

  it('uses one project-scoped not_found outcome for missing and foreign jobs', async () => {
    const h = makeHarness({ lockedJob: null });

    const result = await createJobService(h.unitOfWork).manualRetry(retryInput);

    expect(result).toEqual({ kind: 'not_found' });
    expect(h.jobPort.lockForUpdate).toHaveBeenCalledWith({
      projectId: 'project-1',
      jobId: 'job-1',
    });
    expect(h.calls).toEqual(['begin', 'job.lockForUpdate', 'commit']);
    expect(h.jobPort.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 'conflict'],
    ['binding_invalid', 'reservation_binding_invalid'],
    ['funding_model_mismatch', 'funding_model_mismatch'],
  ] as const)('maps insert %s to %s', async (insertKind, resultKind) => {
    const h = makeHarness({ lockedJob: job({ status: 'dead' }) });
    h.jobPort.insert.mockImplementationOnce(async () => {
      h.calls.push('job.insert');
      return { kind: insertKind };
    });

    const result = await createJobService(h.unitOfWork).manualRetry(retryInput);

    expect(result).toEqual({ kind: resultKind });
  });

  it('declares binding-invalid and funding-mismatch port and service result variants', () => {
    expectTypeOf<Extract<JobInsertResult, { readonly kind: 'binding_invalid' }>>().toEqualTypeOf<{
      readonly kind: 'binding_invalid';
    }>();
    expectTypeOf<
      Extract<JobInsertResult, { readonly kind: 'funding_model_mismatch' }>
    >().toEqualTypeOf<{ readonly kind: 'funding_model_mismatch' }>();
    expectTypeOf<
      Extract<ManualRetryResult, { readonly kind: 'reservation_binding_invalid' }>
    >().toEqualTypeOf<{ readonly kind: 'reservation_binding_invalid' }>();
    expectTypeOf<
      Extract<ManualRetryResult, { readonly kind: 'funding_model_mismatch' }>
    >().toEqualTypeOf<{ readonly kind: 'funding_model_mismatch' }>();
  });

  describe('funding model enqueue guard in manualRetry unit tests', () => {
    it('rejects user_paid job with missing reservationId', async () => {
      const h = makeHarness({
        lockedJob: job({ status: 'failed', kind: 'concept_generation' }),
      });
      const service = createJobService(h.unitOfWork);

      const result = await service.manualRetry({ ...retryInput, reservationId: null });

      expect(result).toEqual({
        kind: 'funding_model_violation',
        reason: 'missing_reservation_for_paid',
        fundingModel: 'user_paid',
      });
      expect(h.jobPort.insert).not.toHaveBeenCalled();
      expect(h.executeCount()).toBe(1);
    });

    it('allows user_paid job with non-empty reservationId', async () => {
      const h = makeHarness({
        lockedJob: job({ status: 'failed', kind: 'concept_generation' }),
      });
      h.jobPort.insert.mockImplementationOnce(async (input) => ({
        kind: 'inserted',
        job: job({ id: input.id, kind: input.kind, reservationId: input.reservationId }),
      }));
      const service = createJobService(h.unitOfWork);

      const result = await service.manualRetry({ ...retryInput, reservationId: 'res-paid-1' });

      expect(result.kind).toBe('created');
      expect(h.jobPort.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'res-paid-1' }),
      );
    });

    it('rejects system_funded job with missing reservationId', async () => {
      const h = makeHarness({
        lockedJob: job({ status: 'failed', kind: 'chat_intake' }),
      });
      const service = createJobService(h.unitOfWork);

      const result = await service.manualRetry({ ...retryInput, reservationId: null });

      expect(result).toEqual({
        kind: 'funding_model_violation',
        reason: 'missing_reservation_for_system_funded',
        fundingModel: 'system_funded',
      });
      expect(h.jobPort.insert).not.toHaveBeenCalled();
    });

    it('allows system_funded job with non-empty reservationId', async () => {
      const h = makeHarness({
        lockedJob: job({ status: 'failed', kind: 'chat_intake' }),
      });
      h.jobPort.insert.mockImplementationOnce(async (input) => ({
        kind: 'inserted',
        job: job({ id: input.id, kind: input.kind, reservationId: input.reservationId }),
      }));
      const service = createJobService(h.unitOfWork);

      const result = await service.manualRetry({ ...retryInput, reservationId: 'res-sys-1' });

      expect(result.kind).toBe('created');
      expect(h.jobPort.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'res-sys-1' }),
      );
    });

    it('allows pre_d4_legacy job without reservationId', async () => {
      const h = makeHarness({
        lockedJob: job({ status: 'failed', kind: 'prose' }),
      });
      h.jobPort.insert.mockImplementationOnce(async (input) => ({
        kind: 'inserted',
        job: job({ id: input.id, kind: input.kind, reservationId: input.reservationId }),
      }));
      const service = createJobService(h.unitOfWork);

      const result = await service.manualRetry({ ...retryInput, reservationId: null });

      expect(result.kind).toBe('created');
      expect(h.jobPort.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: null }),
      );
    });

    it('rejects unmapped/unknown job kind with funding_model_violation', async () => {
      const h = makeHarness({
        lockedJob: job({ status: 'failed', kind: 'unmapped_custom_action' }),
      });
      const service = createJobService(h.unitOfWork);

      const result = await service.manualRetry({ ...retryInput, reservationId: 'res-1' });

      expect(result).toEqual({
        kind: 'funding_model_violation',
        reason: 'unknown_kind',
      });
      expect(h.jobPort.insert).not.toHaveBeenCalled();
    });
  });
});

describe('owner wrappers and reclaim', () => {
  it('claim and reclaim contracts are global while claimed identity uses returned project', async () => {
    expectTypeOf<Parameters<JobPort['claimNext']>[0]>().not.toHaveProperty('projectId');
    expectTypeOf<Parameters<JobPort['reclaimNextExpired']>[0]>().not.toHaveProperty('projectId');
    expectTypeOf<Parameters<ReturnType<typeof createJobService>['claim']>[0]>().not.toHaveProperty(
      'projectId',
    );
    expectTypeOf<
      Parameters<ReturnType<typeof createJobService>['reclaimOne']>[0]
    >().not.toHaveProperty('projectId');

    const h = makeHarness();
    const foreignProjectJob = job({
      projectId: 'project-global-winner',
      status: 'running',
      leaseToken: 'lease-global',
      fenceVersion: 1,
    });
    h.jobPort.claimNext.mockResolvedValueOnce({
      kind: 'claimed',
      job: foreignProjectJob,
      identity: {
        projectId: foreignProjectJob.projectId,
        jobId: foreignProjectJob.id,
        leaseToken: 'lease-global',
        fenceVersion: 1,
      },
    });

    const result = await createJobService(h.unitOfWork).claim({
      leaseToken: 'lease-global',
      leaseDurationMs: 30_000,
    });

    expect(result).toMatchObject({
      kind: 'claimed',
      job: { projectId: 'project-global-winner' },
      identity: { projectId: 'project-global-winner' },
    });
  });

  it('claim forwards lease token and numeric duration in one UoW for every outcome', async () => {
    const h = makeHarness();
    const claimed = {
      kind: 'claimed' as const,
      job: job({
        status: 'running',
        leaseToken: 'lease-new',
        leaseExpiresAt: fixedDate,
        fenceVersion: 1,
      }),
      identity: { ...identity, leaseToken: 'lease-new', fenceVersion: 1 },
    };
    h.jobPort.claimNext.mockResolvedValueOnce(claimed).mockResolvedValueOnce({ kind: 'none' });
    const service = createJobService(h.unitOfWork);

    await expect(
      service.claim({ leaseToken: 'lease-new', leaseDurationMs: 60_000 }),
    ).resolves.toEqual(claimed);
    await expect(
      service.claim({ leaseToken: 'lease-next', leaseDurationMs: 30_000 }),
    ).resolves.toEqual({ kind: 'none' });

    expect(h.jobPort.claimNext).toHaveBeenNthCalledWith(1, {
      leaseToken: 'lease-new',
      leaseDurationMs: 60_000,
    });
    expect(h.jobPort.claimNext).toHaveBeenNthCalledWith(2, {
      leaseToken: 'lease-next',
      leaseDurationMs: 30_000,
    });
    expect(h.executeCount()).toBe(2);
  });

  it.each([
    { kind: 'extended' as const, job: job({ status: 'running' }) },
    { kind: 'lost_ownership' as const },
  ])('heartbeat forwards exact identity and duration for $kind', async (portResult) => {
    const h = makeHarness();
    h.jobPort.heartbeat.mockResolvedValueOnce(portResult);

    const result = await createJobService(h.unitOfWork).heartbeat({
      ...identity,
      leaseDurationMs: 20_000,
    });

    expect(result).toEqual(portResult);
    expect(h.jobPort.heartbeat).toHaveBeenCalledWith({ ...identity, leaseDurationMs: 20_000 });
    expect(h.jobPort.transitionRunningToTerminal).not.toHaveBeenCalled();
    expect(h.executeCount()).toBe(1);
  });

  it.each([
    { kind: 'requeued' as const, job: job() },
    { kind: 'lost_ownership' as const },
    { kind: 'not_allowed' as const },
  ])('requeue forwards exact identity and numeric delay for $kind', async (portResult) => {
    const h = makeHarness();
    h.jobPort.requeueRunning.mockResolvedValueOnce(portResult);

    const result = await createJobService(h.unitOfWork).requeue({ ...identity, delayMs: 5_000 });

    expect(result).toEqual(portResult);
    expect(h.jobPort.requeueRunning).toHaveBeenCalledWith({ ...identity, delayMs: 5_000 });
    expect(h.executeCount()).toBe(1);
  });

  it.each(['succeeded', 'failed', 'dead', 'cancelled'] as const)(
    'finish routes legal %s target only through running terminal transition',
    async (status) => {
      const h = makeHarness();
      const terminalized = { kind: 'terminalized' as const, job: job({ status }) };
      h.jobPort.transitionRunningToTerminal.mockResolvedValueOnce(terminalized);

      const result = await createJobService(h.unitOfWork).finish({ ...identity, status });

      expect(result).toEqual(terminalized);
      expect(h.jobPort.transitionRunningToTerminal).toHaveBeenCalledWith({ ...identity, status });
      expect(h.jobPort.transitionQueuedToTerminal).not.toHaveBeenCalled();
      expect(h.executeCount()).toBe(1);
    },
  );

  it.each([
    { kind: 'lost_ownership' as const },
    { kind: 'cancellation_required' as const },
    { kind: 'cancellation_blocks_success' as const },
    { kind: 'already_terminal' as const, status: 'failed' as const },
  ])('finish preserves typed rejection $kind with no further work', async (portResult) => {
    const h = makeHarness();
    h.jobPort.transitionRunningToTerminal.mockResolvedValueOnce(portResult);

    const result = await createJobService(h.unitOfWork).finish({
      ...identity,
      status: 'succeeded',
    });

    expect(result).toEqual(portResult);
    expect(h.jobPort.transitionRunningToTerminal).toHaveBeenCalledTimes(1);
    expect(h.ports.outbox.append).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'none' as const },
    { kind: 'requeued' as const, job: job() },
    { kind: 'cancelled' as const, job: job({ status: 'cancelled' }) },
  ])('reclaimOne makes one bounded call and preserves $kind', async (portResult) => {
    const h = makeHarness();
    h.jobPort.reclaimNextExpired.mockResolvedValueOnce(portResult);

    const result = await createJobService(h.unitOfWork).reclaimOne({});

    expect(result).toEqual(portResult);
    expect(h.jobPort.reclaimNextExpired).toHaveBeenCalledOnce();
    expect(h.jobPort.reclaimNextExpired).toHaveBeenCalledWith({});
    expect(h.executeCount()).toBe(1);
  });

  it('JobPort declares a list-shaped active lookup (cardinality itself is covered by DB integration tests in a later task)', () => {
    expectTypeOf<JobPort>().toHaveProperty('listActiveByProject');
    expectTypeOf<JobPort>().not.toHaveProperty('findActiveByProject');
    expectTypeOf<JobPort>().not.toHaveProperty('findActiveJob');
    expectTypeOf<JobPort>().not.toHaveProperty('getActiveByProject');
    expectTypeOf<JobPort['listActiveByProject']>().returns.resolves.toEqualTypeOf<
      readonly GenerationJobRecord[]
    >();
  });
});

describe('fenced publish', () => {
  const sentinel: FencedPublishSentinelInput = {
    aggregateType: 'generation_job',
    aggregateId: 'job-1',
    eventType: 'generation.succeeded',
    dedupeKey: 'job:job-1:succeeded',
    schemaVersion: 2,
    payload: { projectId: 'project-1' },
  };

  it('exposes only appendSentinel and publishes with allocated ID plus DB time before success CAS', async () => {
    const h = makeHarness();
    h.jobPort.lockForFencedPublish.mockImplementationOnce(async () => {
      h.calls.push('job.lockForFencedPublish');
      return { kind: 'locked', job: job({ status: 'running' }) };
    });
    h.jobPort.transitionRunningToTerminal.mockImplementationOnce(async () => {
      h.calls.push('job.transitionRunningToTerminal');
      return { kind: 'terminalized', job: job({ status: 'succeeded', fenceVersion: 5 }) };
    });
    let runtimeKeys: string[] = [];

    const result = await createJobService(h.unitOfWork).withFencedPublish(
      identity,
      async (context) => {
        h.calls.push('callback');
        runtimeKeys = Object.keys(context);
        await context.appendSentinel(sentinel);
      },
    );

    expect(result).toEqual({
      kind: 'published',
      job: job({ status: 'succeeded', fenceVersion: 5 }),
    });
    expect(runtimeKeys).toEqual(['appendSentinel']);
    expect(h.calls).toEqual([
      'begin',
      'project.lockForUpdate',
      'job.lockForFencedPublish',
      'callback',
      'allocateId',
      'dbNow',
      'outbox.append',
      'job.transitionRunningToTerminal',
      'commit',
    ]);
    expect(h.jobPort.lockForFencedPublish).toHaveBeenCalledWith(identity);
    expect(h.ports.outbox.append).toHaveBeenCalledWith({
      ...sentinel,
      id: 'allocated-1',
      occurredAt: fixedDate,
    });
    expect(h.jobPort.transitionRunningToTerminal).toHaveBeenCalledWith({
      ...identity,
      status: 'succeeded',
    });
    expect(h.executeCount()).toBe(1);
  });

  it('compile-time sentinel input excludes id and occurredAt', () => {
    expectTypeOf<FencedPublishContext>().toEqualTypeOf<{
      readonly appendSentinel: (input: FencedPublishSentinelInput) => Promise<void>;
    }>();
    expectTypeOf<FencedPublishSentinelInput>().not.toHaveProperty('id');
    expectTypeOf<FencedPublishSentinelInput>().not.toHaveProperty('occurredAt');
    expectTypeOf<FencedPublishContext>().not.toHaveProperty('job');
    expectTypeOf<FencedPublishContext>().not.toHaveProperty('ledger');
    expectTypeOf<FencedPublishContext>().not.toHaveProperty('outbox');
  });

  it('tombstone-after-winner locks project before job and denies callback plus success', async () => {
    const h = makeHarness({ projectDeletedAt: fixedDate });
    h.jobPort.lockForFencedPublish.mockImplementationOnce(async () => {
      h.calls.push('job.lockForFencedPublish');
      return { kind: 'locked', job: job({ status: 'running' }) };
    });
    const callback = vi.fn();

    const result = await createJobService(h.unitOfWork).withFencedPublish(identity, callback);

    expect(result).toEqual({ kind: 'project_tombstoned' });
    expect(callback).not.toHaveBeenCalled();
    expect(h.jobPort.lockForFencedPublish).not.toHaveBeenCalled();
    expect(h.jobPort.transitionRunningToTerminal).not.toHaveBeenCalled();
    expect(h.calls).toEqual(['begin', 'project.lockForUpdate', 'commit']);
  });

  it('guard loss skips callback and all publication work', async () => {
    const h = makeHarness();
    h.jobPort.lockForFencedPublish.mockImplementationOnce(async () => {
      h.calls.push('job.lockForFencedPublish');
      return { kind: 'lost' };
    });
    const callback = vi.fn();

    const result = await createJobService(h.unitOfWork).withFencedPublish(identity, callback);

    expect(result).toEqual({ kind: 'lost' });
    expect(callback).not.toHaveBeenCalled();
    expect(h.ports.dbNow).not.toHaveBeenCalled();
    expect(h.ports.outbox.append).not.toHaveBeenCalled();
    expect(h.jobPort.transitionRunningToTerminal).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'begin',
      'project.lockForUpdate',
      'job.lockForFencedPublish',
      'commit',
    ]);
  });

  it('callback throw propagates and rolls back without success transition', async () => {
    const h = makeHarness();
    h.jobPort.lockForFencedPublish.mockImplementationOnce(async () => {
      h.calls.push('job.lockForFencedPublish');
      return { kind: 'locked', job: job({ status: 'running' }) };
    });
    const failure = new Error('publish failed');

    await expect(
      createJobService(h.unitOfWork).withFencedPublish(identity, async (context) => {
        h.calls.push('callback');
        await context.appendSentinel(sentinel);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(h.calls).toEqual([
      'begin',
      'project.lockForUpdate',
      'job.lockForFencedPublish',
      'callback',
      'allocateId',
      'dbNow',
      'outbox.append',
      'rollback',
    ]);
    expect(h.jobPort.transitionRunningToTerminal).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'lost_ownership' as const },
    { kind: 'cancellation_blocks_success' as const },
    { kind: 'already_terminal' as const, status: 'failed' as const },
  ])('terminal CAS $kind rolls back sentinel and maps typed outcome', async (terminalResult) => {
    const h = makeHarness();
    h.jobPort.lockForFencedPublish.mockImplementationOnce(async () => {
      h.calls.push('job.lockForFencedPublish');
      return { kind: 'locked', job: job({ status: 'running' }) };
    });
    h.jobPort.transitionRunningToTerminal.mockImplementationOnce(async () => {
      h.calls.push('job.transitionRunningToTerminal');
      return terminalResult;
    });

    const result = await createJobService(h.unitOfWork).withFencedPublish(
      identity,
      async (context) => {
        h.calls.push('callback');
        await context.appendSentinel(sentinel);
      },
    );

    expect(result).toEqual(terminalResult);
    expect(h.calls.at(-1)).toBe('rollback');
    expect(h.calls).not.toContain('commit');
  });

  it('propagates a non-sentinel thrown value unchanged out of withFencedPublish', async () => {
    const h = makeHarness();
    h.jobPort.lockForFencedPublish.mockImplementationOnce(async () => {
      h.calls.push('job.lockForFencedPublish');
      return { kind: 'locked', job: job({ status: 'running' }) };
    });
    const failure = new Error('terminal CAS exploded');
    h.jobPort.transitionRunningToTerminal.mockImplementationOnce(async () => {
      h.calls.push('job.transitionRunningToTerminal');
      throw failure;
    });

    await expect(
      createJobService(h.unitOfWork).withFencedPublish(identity, async (context) => {
        h.calls.push('callback');
        await context.appendSentinel(sentinel);
      }),
    ).rejects.toBe(failure);
    expect(h.calls.at(-1)).toBe('rollback');
  });
});

void ({} as JsonObject);

import { describe, expect, it, vi } from 'vitest';
import type { JobInsertResult, JobPort } from '../ports/job-port.js';
import type { QuotePort } from '../ports/quote-port.js';
import type {
  CreditQuoteRecord,
  CreditReservationRecord,
  GenerationJobRecord,
  ProjectRecord,
} from '../ports/types.js';
import type { TxPorts, UnitOfWork, UnitOfWorkOptions } from '../ports/unit-of-work.js';
import type { CreateConfirmationInput } from './confirmation-contract.js';
import { createCreditQuoteConfirmationService } from './credit-quote-confirmation-service.js';

const FIXED_DATE = new Date('2026-08-20T10:00:00.000Z');
const EXPIRY_DATE = new Date('2026-08-20T10:10:00.000Z');
const WORKFLOW_HASH = 'a'.repeat(64);
const DEPENDENCY_HASH = 'b'.repeat(64);

const validInput: CreateConfirmationInput = {
  userId: 'user-1',
  projectId: 'project-1',
  quoteId: 'quote-1',
  confirmationRequestId: 'confirmation-1',
  expectedWorkflowPlanHash: WORKFLOW_HASH,
  expectedDependencyHash: DEPENDENCY_HASH,
  reservationId: 'reservation-1',
  jobId: 'job-1',
  jobKind: 'concept_generation',
  bundleId: 'bundle-1',
  workflowPlanId: 'plan-1',
  payload: { prompt: 'Write' },
};

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    ownerUserId: 'user-1',
    title: 'Project One',
    intakePath: 'guided',
    status: 'active',
    currentCanonicalVersion: 1,
    revision: 0,
    deletedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

function makeQuote(overrides: Partial<CreditQuoteRecord> = {}): CreditQuoteRecord {
  return {
    id: 'quote-1',
    userId: 'user-1',
    projectId: 'project-1',
    workflowPlanProjectId: 'project-1',
    workflowPlanId: 'plan-1',
    workflowPlanHash: WORKFLOW_HASH,
    dependencyHash: DEPENDENCY_HASH,
    maxAmountMicroIdr: 50_000n,
    expiresAt: EXPIRY_DATE,
    consumedAt: null,
    requestId: 'issuance-1',
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

function makeReservation(
  overrides: Partial<CreditReservationRecord> = {},
): CreditReservationRecord {
  return {
    id: 'reservation-1',
    userId: 'user-1',
    projectId: 'project-1',
    jobId: 'job-1',
    projectJobId: 'project-1',
    status: 'open',
    fundingModel: 'user_paid',
    reservedMicroIdr: 50_000n,
    settledMicroIdr: 0n,
    releasedMicroIdr: 0n,
    exposureMicroIdr: 50_000n,
    closingAt: null,
    quoteId: 'quote-1',
    confirmationRequestId: 'confirmation-1',
    schemaVersion: 1,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

function makeJob(overrides: Partial<GenerationJobRecord> = {}): GenerationJobRecord {
  return {
    id: 'job-1',
    projectId: 'project-1',
    kind: 'concept_generation',
    status: 'queued',
    priority: 0,
    availableAt: FIXED_DATE,
    leaseToken: null,
    leaseExpiresAt: null,
    fenceVersion: 0,
    cancelRequestedAt: null,
    retryOfJobId: null,
    bundleId: 'bundle-1',
    workflowPlanId: 'plan-1',
    reservationId: 'reservation-1',
    schemaVersion: 1,
    payload: { prompt: 'Write' },
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

interface HarnessOptions {
  readonly quote?: CreditQuoteRecord;
  readonly replayReservation?: CreditReservationRecord | null;
  readonly replayJob?: GenerationJobRecord | null;
  readonly postBindReservation?: CreditReservationRecord | null;
  readonly jobInsertResult?: JobInsertResult;
  readonly unexpectedJobError?: Error;
}

function makeHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  let observedOptions: UnitOfWorkOptions | undefined;
  const quote = options.quote ?? makeQuote();
  const createdReservation = makeReservation({ jobId: null, projectJobId: null });
  const boundReservation = options.postBindReservation ?? makeReservation();
  const createdJob = makeJob();
  let replayLookupCount = 0;

  const quotePort = {
    insert: vi.fn(),
    findById: vi.fn(),
    findByRequestId: vi.fn(),
    confirmLock: vi.fn<QuotePort['confirmLock']>(async () => {
      calls.push('quote.confirmLock');
      return quote;
    }),
    consumeQuote: vi.fn<QuotePort['consumeQuote']>(async () => {
      calls.push('quote.consumeQuote');
      return { kind: 'consumed', quote: makeQuote({ consumedAt: FIXED_DATE }) };
    }),
  } satisfies QuotePort;

  const jobPort = {
    insert: vi.fn<JobPort['insert']>(async () => {
      calls.push('job.insert');
      if (options.unexpectedJobError) throw options.unexpectedJobError;
      return options.jobInsertResult ?? { kind: 'inserted', job: createdJob };
    }),
    findById: vi.fn<JobPort['findById']>(async () => {
      calls.push('job.findById');
      return options.replayJob === undefined ? makeJob() : options.replayJob;
    }),
    listActiveByProject: vi.fn(),
    findLatestTerminalByProject: vi.fn(),
    lockForUpdate: vi.fn(),
    claimNext: vi.fn(),
    heartbeat: vi.fn(),
    requestRunningCancellation: vi.fn(),
    cancelQueued: vi.fn(),
    requeueRunning: vi.fn(),
    transitionQueuedToTerminal: vi.fn(),
    transitionRunningToTerminal: vi.fn(),
    reclaimNextExpired: vi.fn(),
    lockForFencedPublish: vi.fn(),
    lockLiveOwnerForAttempt: vi.fn(),
  } satisfies JobPort;

  const ports = {
    creditBalance: {
      serializeUserBalance: vi.fn(async () => calls.push('balance.serialize')),
      getBalanceSnapshot: vi.fn(async () => {
        calls.push('balance.snapshot');
        return { bookMicroIdr: 100_000n, heldMicroIdr: 0n, reconcilingMicroIdr: 0n };
      }),
    },
    project: {
      lockForUpdate: vi.fn(async () => {
        calls.push('project.lockForUpdate');
        return makeProject();
      }),
    },
    quote: quotePort,
    creditReservation: {
      findReplayByConfirmationRequestId: vi.fn(async () => {
        calls.push('reservation.findReplay');
        replayLookupCount += 1;
        if (replayLookupCount === 1) return options.replayReservation ?? null;
        return boundReservation;
      }),
      create: vi.fn(async () => {
        calls.push('reservation.create');
        return { kind: 'created' as const, reservation: createdReservation };
      }),
    },
    job: jobPort,
    allocateId: vi.fn(() => {
      calls.push('allocateId');
      return 'forbidden-allocated-id';
    }),
    dbNow: vi.fn(async () => {
      calls.push('dbNow');
      return FIXED_DATE;
    }),
    dbOperationalNow: vi.fn(async () => {
      calls.push('dbOperationalNow');
      return FIXED_DATE;
    }),
  } as unknown as TxPorts;

  const unitOfWork: UnitOfWork = {
    async execute<T>(fn: (txPorts: TxPorts) => Promise<T>, opts?: UnitOfWorkOptions): Promise<T> {
      observedOptions = opts;
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
    quotePort,
    jobPort,
    ports,
    unitOfWork,
    get observedOptions() {
      return observedOptions;
    },
  };
}

describe('CreditQuoteConfirmationService', () => {
  it('uses stable UoW identity and caller-provided reservation/job IDs', async () => {
    const h = makeHarness();

    const result = await createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote(
      validInput,
    );

    expect(result).toEqual({
      kind: 'confirmed',
      reservation: makeReservation(),
      job: makeJob(),
    });
    expect(h.observedOptions).toEqual({
      isolation: 'read_committed',
      requestId: 'confirmation-1',
    });
    expect(h.ports.creditReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reservation-1' }),
    );
    expect(h.jobPort.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1', reservationId: 'reservation-1' }),
    );
    expect(h.ports.allocateId).not.toHaveBeenCalled();
  });

  it('checks durable replay after locks and before consumed rejection, then uses reservation.jobId', async () => {
    const reservation = makeReservation({ status: 'settled' });
    const job = makeJob();
    const h = makeHarness({
      quote: makeQuote({ consumedAt: FIXED_DATE }),
      replayReservation: reservation,
      replayJob: job,
    });

    const result = await createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote(
      validInput,
    );

    expect(result).toEqual({ kind: 'exact_replay', reservation, job });
    expect(h.calls).toEqual([
      'begin',
      'balance.serialize',
      'project.lockForUpdate',
      'quote.confirmLock',
      'reservation.findReplay',
      'job.findById',
      'commit',
    ]);
    expect(h.jobPort.findById).toHaveBeenCalledWith({ projectId: 'project-1', jobId: 'job-1' });
  });

  it.each([
    ['workflow hash', { expectedWorkflowPlanHash: 'c'.repeat(64) }],
    ['dependency hash', { expectedDependencyHash: 'd'.repeat(64) }],
  ])('returns conflict for divergent replay %s', async (_case, overrides) => {
    const h = makeHarness({ replayReservation: makeReservation(), replayJob: makeJob() });

    const result = await createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote({
      ...validInput,
      ...overrides,
    });

    expect(result).toEqual({ kind: 'conflict' });
    expect(h.quotePort.consumeQuote).not.toHaveBeenCalled();
  });

  it.each([
    ['reservation ID', makeReservation({ id: 'other-reservation' }), makeJob()],
    ['user ID', makeReservation({ userId: 'other-user' }), makeJob()],
    ['project ID', makeReservation({ projectId: 'other-project' }), makeJob()],
    ['quote ID', makeReservation({ quoteId: 'other-quote' }), makeJob()],
    [
      'confirmation request ID',
      makeReservation({ confirmationRequestId: 'other-confirmation' }),
      makeJob(),
    ],
    ['funding model', makeReservation({ fundingModel: 'system_funded' }), makeJob()],
    ['missing job binding', makeReservation({ jobId: null }), makeJob()],
    ['job ID', makeReservation(), makeJob({ id: 'other-job' })],
    ['job reservation binding', makeReservation(), makeJob({ reservationId: 'other-reservation' })],
    ['job kind', makeReservation(), makeJob({ kind: 'foundation_generation' })],
    ['job bundle', makeReservation(), makeJob({ bundleId: 'other-bundle' })],
    ['job workflow plan', makeReservation(), makeJob({ workflowPlanId: 'other-plan' })],
  ])('returns conflict for divergent replay %s', async (_case, reservation, job) => {
    const h = makeHarness({ replayReservation: reservation, replayJob: job });

    const result = await createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote(
      validInput,
    );

    expect(result).toEqual({ kind: 'conflict' });
    expect(h.quotePort.consumeQuote).not.toHaveBeenCalled();
    expect(h.ports.creditReservation.create).not.toHaveBeenCalled();
    expect(h.jobPort.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['chat_intake', 'known_ineligible_kind'],
    ['prose', 'known_ineligible_kind'],
    ['some_new_unmapped_kind', 'unknown_kind'],
  ] as const)('rejects %s with %s and zero UoW work', async (jobKind, reason) => {
    const h = makeHarness();

    const result = await createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote({
      ...validInput,
      jobKind,
    });

    expect(result).toEqual({ kind: 'funding_model_violation', reason });
    expect(h.calls).toHaveLength(0);
  });

  it.each(['conflict', 'binding_invalid', 'funding_model_mismatch'] as const)(
    'rolls back quote consumption when job insertion returns %s',
    async (kind) => {
      const h = makeHarness({ jobInsertResult: { kind } });

      const result = await createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote(
        validInput,
      );

      expect(result).toEqual({ kind: 'conflict' });
      expect(h.calls).toContain('quote.consumeQuote');
      expect(h.calls).toContain('reservation.create');
      expect(h.calls.at(-1)).toBe('rollback');
      expect(h.calls).not.toContain('commit');
    },
  );

  it('rethrows unexpected transaction errors unchanged', async () => {
    const infrastructureError = new Error('database connection lost');
    const h = makeHarness({ unexpectedJobError: infrastructureError });

    await expect(
      createCreditQuoteConfirmationService(h.unitOfWork).confirmQuote(validInput),
    ).rejects.toBe(infrastructureError);
    expect(h.calls.at(-1)).toBe('rollback');
  });
});

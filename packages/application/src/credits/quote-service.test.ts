import { describe, expect, it, vi } from 'vitest';
import type { CreditQuoteRecord, ProjectRecord } from '../ports/types.js';
import type { QuoteInsertInput, QuoteInsertResult, QuotePort } from '../ports/quote-port.js';
import type { TxPorts, UnitOfWork } from '../ports/unit-of-work.js';
import { createCreditQuoteService, type IssueQuoteInput } from './quote-service.js';

const FIXED_DATE = new Date('2026-08-16T10:00:00.000Z');
const EXPIRY_DATE = new Date('2026-08-16T10:10:00.000Z');
const VALID_HASH_A = 'a'.repeat(64);
const VALID_HASH_B = 'b'.repeat(64);

function makeQuoteRecord(overrides: Partial<CreditQuoteRecord> = {}): CreditQuoteRecord {
  return {
    id: 'quote-1',
    userId: 'user-1',
    projectId: 'project-1',
    workflowPlanProjectId: 'project-1',
    workflowPlanId: 'plan-1',
    workflowPlanHash: VALID_HASH_A,
    dependencyHash: VALID_HASH_B,
    maxAmountMicroIdr: 50_000n,
    expiresAt: EXPIRY_DATE,
    consumedAt: null,
    requestId: 'req-1',
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

function makeProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
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

interface HarnessOptions {
  readonly project?: ProjectRecord | null;
  readonly insertResult?: QuoteInsertResult;
}

function makeHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  let allocated = 0;

  const quotePort = {
    insert: vi.fn<QuotePort['insert']>(async (input: QuoteInsertInput) => {
      calls.push('quote.insert');
      return (
        options.insertResult ?? {
          kind: 'inserted' as const,
          quote: makeQuoteRecord({
            id: input.id,
            userId: input.userId,
            projectId: input.projectId,
            workflowPlanId: input.workflowPlanId,
            workflowPlanHash: input.workflowPlanHash,
            dependencyHash: input.dependencyHash,
            maxAmountMicroIdr: input.maxAmountMicroIdr,
            requestId: input.requestId,
          }),
        }
      );
    }),
    findById: vi.fn(),
    findByRequestId: vi.fn(),
  } satisfies QuotePort;

  const projectRepo = {
    insert: vi.fn(),
    findByIdForOwner: vi.fn(async (projectId: string, ownerUserId: string) => {
      calls.push('project.findByIdForOwner');
      if (options.project === null) return null;
      const proj = options.project ?? makeProjectRecord();
      if (proj.id === projectId && proj.ownerUserId === ownerUserId) {
        return proj;
      }
      return null;
    }),
    listByOwner: vi.fn(),
    lockForUpdate: vi.fn(),
    bumpCanonicalVersion: vi.fn(),
  };

  const jobPort = {
    insert: vi.fn(),
    findById: vi.fn(),
    listActiveByProject: vi.fn(),
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
  };

  const ledgerPort = {
    releaseQueuedCancellation: vi.fn(),
  };

  const ports = {
    project: projectRepo,
    quote: quotePort,
    job: jobPort,
    ledger: ledgerPort,
    allocateId: () => {
      calls.push('allocateId');
      return `quote-alloc-${++allocated}`;
    },
    dbNow: vi.fn(async () => {
      calls.push('dbNow');
      return FIXED_DATE;
    }),
  } as unknown as TxPorts;

  const unitOfWork: UnitOfWork = {
    async execute<T>(fn: (txPorts: TxPorts) => Promise<T>): Promise<T> {
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
    projectRepo,
    jobPort,
    ports,
    unitOfWork,
  };
}

describe('CreditQuoteService - issueQuote', () => {
  const validInput: IssueQuoteInput = {
    userId: 'user-1',
    projectId: 'project-1',
    workflowPlanId: 'plan-1',
    workflowPlanHash: VALID_HASH_A,
    bundleId: 'bundle-1',
    dependencyHash: VALID_HASH_B,
    maxAmountMicroIdr: 50_000n,
    issuanceRequestId: 'req-1',
  };

  it('issues exact quote tuple for authenticated owner with valid hashes and positive amount', async () => {
    const h = makeHarness();
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result).toEqual({
      kind: 'issued',
      quote: makeQuoteRecord({ id: 'quote-alloc-1' }),
      isReplay: false,
    });
    expect(h.projectRepo.findByIdForOwner).toHaveBeenCalledWith('project-1', 'user-1');
    expect(h.quotePort.insert).toHaveBeenCalledWith({
      id: 'quote-alloc-1',
      userId: 'user-1',
      projectId: 'project-1',
      workflowPlanId: 'plan-1',
      workflowPlanHash: VALID_HASH_A,
      dependencyHash: VALID_HASH_B,
      maxAmountMicroIdr: 50_000n,
      requestId: 'req-1',
    });
    expect(h.jobPort.insert).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'begin',
      'project.findByIdForOwner',
      'allocateId',
      'quote.insert',
      'commit',
    ]);
  });

  it('rejects maxAmountMicroIdr = 0 with typed invalid_quote_amount and zero DB writes', async () => {
    const h = makeHarness();
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote({ ...validInput, maxAmountMicroIdr: 0n });

    expect(result).toEqual({ kind: 'invalid_quote_amount', amount: 0n });
    expect(h.quotePort.insert).not.toHaveBeenCalled();
    expect(h.calls).toHaveLength(0);
  });

  it('rejects negative maxAmountMicroIdr with typed invalid_quote_amount and zero DB writes', async () => {
    const h = makeHarness();
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote({ ...validInput, maxAmountMicroIdr: -100n });

    expect(result).toEqual({ kind: 'invalid_quote_amount', amount: -100n });
    expect(h.quotePort.insert).not.toHaveBeenCalled();
    expect(h.calls).toHaveLength(0);
  });

  it.each([
    ['uppercase hex', 'A'.repeat(64), VALID_HASH_B, 'workflowPlanHash'],
    ['short hex', 'a'.repeat(63), VALID_HASH_B, 'workflowPlanHash'],
    ['long hex', 'a'.repeat(65), VALID_HASH_B, 'workflowPlanHash'],
    ['non-hex chars', 'g'.repeat(64), VALID_HASH_B, 'workflowPlanHash'],
    ['dependency uppercase', VALID_HASH_A, 'B'.repeat(64), 'dependencyHash'],
    ['dependency short', VALID_HASH_A, 'b'.repeat(60), 'dependencyHash'],
  ] as const)(
    'rejects %s with typed invalid_hash on %s without DB writes',
    async (_desc, planHash, depHash, expectedField) => {
      const h = makeHarness();
      const service = createCreditQuoteService(h.unitOfWork);

      const result = await service.issueQuote({
        ...validInput,
        workflowPlanHash: planHash,
        dependencyHash: depHash,
      });

      expect(result.kind).toBe('invalid_hash');
      if (result.kind === 'invalid_hash') {
        expect(result.field).toBe(expectedField);
      }
      expect(h.quotePort.insert).not.toHaveBeenCalled();
      expect(h.calls).toHaveLength(0);
    },
  );

  it('returns not_found without enumeration when project is not owned by user', async () => {
    const h = makeHarness({
      project: makeProjectRecord({ id: 'project-1', ownerUserId: 'other-user' }),
    });
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result).toEqual({ kind: 'not_found' });
    expect(h.quotePort.insert).not.toHaveBeenCalled();
  });

  it('returns not_found without enumeration when project is tombstoned', async () => {
    const h = makeHarness({
      project: makeProjectRecord({ deletedAt: FIXED_DATE }),
    });
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result).toEqual({ kind: 'not_found' });
    expect(h.quotePort.insert).not.toHaveBeenCalled();
  });

  it('returns not_found when project does not exist', async () => {
    const h = makeHarness({ project: null });
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result).toEqual({ kind: 'not_found' });
    expect(h.quotePort.insert).not.toHaveBeenCalled();
  });

  it('returns exact existing quote on identical issuanceRequestId replay', async () => {
    const existingQuote = makeQuoteRecord({ id: 'existing-quote-id' });
    const h = makeHarness({
      insertResult: { kind: 'replayed', quote: existingQuote },
    });
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result).toEqual({
      kind: 'issued',
      quote: existingQuote,
      isReplay: true,
    });
    expect(h.quotePort.insert).toHaveBeenCalled();
  });

  it('returns typed conflict on divergent issuanceRequestId replay', async () => {
    const h = makeHarness({
      insertResult: { kind: 'conflict' },
    });
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result).toEqual({ kind: 'conflict' });
  });

  it('issuance does NOT reserve credit, create generation job, or consume quote', async () => {
    const h = makeHarness();
    const service = createCreditQuoteService(h.unitOfWork);

    const result = await service.issueQuote(validInput);

    expect(result.kind).toBe('issued');
    if (result.kind === 'issued') {
      expect(result.quote.consumedAt).toBeNull();
    }
    expect(h.jobPort.insert).not.toHaveBeenCalled();
  });
});

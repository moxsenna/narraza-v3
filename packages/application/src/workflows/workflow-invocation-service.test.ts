import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { AiUsagePort, UsageMetrics } from '../ports/ai-usage-port.js';
import type { JobPort } from '../ports/job-port.js';
import type { ProjectRepo } from '../ports/project-repo.js';
import type { TxPorts, UnitOfWork } from '../ports/unit-of-work.js';
import type {
  BeginAttemptInput,
  GenerationAttemptPort,
  WorkflowInvocationPort,
} from '../ports/workflow-invocation-port.js';
import type {
  GenerationAttemptRecord,
  GenerationAttemptStatus,
  ProjectRecord,
  WorkflowInvocationRecord,
  WorkflowInvocationStatus,
} from '../ports/types.js';
import { createWorkflowInvocationService } from './workflow-invocation-service.js';

const now = new Date('2026-08-11T10:00:00.000Z');
const project = { id: 'project-1', deletedAt: null } as ProjectRecord;
const invocation: WorkflowInvocationRecord = {
  id: 'invocation-1',
  projectId: 'project-1',
  jobId: 'job-1',
  stageKey: 'draft',
  status: 'running',
  winnerAttemptId: null,
  fenceVersion: 0,
  createdAt: now,
  updatedAt: now,
};
const attempt: GenerationAttemptRecord = {
  id: 'attempt-1',
  projectId: 'project-1',
  jobId: 'job-1',
  invocationId: 'invocation-1',
  ordinal: 0,
  status: 'started',
  providerRequestId: null,
  resultHash: null,
  startedAt: now,
  finishedAt: null,
  schemaVersion: 1,
  payload: { prompt: 'x' },
  createdAt: now,
  updatedAt: now,
};
const beginInput: BeginAttemptInput = {
  projectId: 'project-1',
  jobId: 'job-1',
  leaseToken: 'lease-1',
  fenceVersion: 3,
  invocationId: 'invocation-1',
  attemptId: 'attempt-1',
  stageKey: 'draft',
  schemaVersion: 1,
  payload: { prompt: 'x' },
};
const usage: UsageMetrics = {
  priceSnapshotId: 'price-1',
  inputTokens: 10,
  outputTokens: 20,
  providerCostMicroIdr: 300n,
};

interface HarnessOptions {
  project?: ProjectRecord | null;
  owner?: 'locked' | 'not_authorized';
  begin?: 'started' | 'already_started' | 'conflict';
  finalize?: 'finalized' | 'replayed' | 'conflict' | 'not_authorized';
  usage?: 'appended' | 'replayed' | 'conflict';
  winner?:
    | 'selected'
    | 'selected_replay'
    | 'already_won_by_other'
    | 'ineligible_owner'
    | 'cancelled'
    | 'project_tombstoned'
    | 'attempt_failed'
    | 'not_selected'
    | 'conflict'
    | 'not_authorized';
  retryFinalizeOnce?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  let transactionAttempt = 0;
  const workflow = {
    beginAttempt: vi.fn<WorkflowInvocationPort['beginAttempt']>(async () => {
      calls.push('workflow.beginAttempt');
      const kind = options.begin ?? 'started';
      return kind === 'conflict' ? { kind } : { kind, invocation, attempt };
    }),
    lockForFinalization: vi.fn(async () => {
      calls.push('workflow.lockForFinalization');
      return { kind: 'locked' as const, invocation };
    }),
    classifyWinner: vi.fn<WorkflowInvocationPort['classifyWinner']>(async () => {
      calls.push('workflow.classifyWinner');
      const kind = options.winner ?? 'selected';
      return kind === 'conflict' || kind === 'not_authorized'
        ? { kind }
        : { kind: 'classified', winner: kind };
    }),
  } as unknown as WorkflowInvocationPort & {
    lockForFinalization: ReturnType<typeof vi.fn>;
  };
  const generationAttempt = {
    finalizeAttempt: vi.fn<GenerationAttemptPort['finalizeAttempt']>(async (input) => {
      calls.push('attempt.finalize');
      if (options.retryFinalizeOnce && transactionAttempt === 1)
        throw new Error('serialization failure');
      const kind = options.finalize ?? 'finalized';
      return kind === 'finalized' || kind === 'replayed'
        ? {
            kind,
            attempt: {
              ...attempt,
              status: input.status,
              providerRequestId: input.providerRequestId,
              resultHash: input.resultHash,
              finishedAt: now,
              schemaVersion: input.schemaVersion,
              payload: input.payload,
            },
          }
        : { kind };
    }),
  } satisfies GenerationAttemptPort;
  const aiUsage = {
    appendForAttempt: vi.fn<AiUsagePort['appendForAttempt']>(async (lockedAttempt, metrics) => {
      calls.push('usage.appendForAttempt');
      expect(lockedAttempt.id).toBe('attempt-1');
      expect(metrics).toBe(usage);
      return { kind: options.usage ?? 'appended' };
    }),
  } satisfies AiUsagePort;
  const job = {
    lockLiveOwnerForAttempt: vi.fn(async () => {
      calls.push('job.lockLiveOwnerForAttempt');
      return { kind: options.owner ?? 'locked' } as const;
    }),
    lockForFinalization: vi.fn(async () => {
      calls.push('job.lockForFinalization');
      return { kind: 'locked' as const, eligibility: 'eligible' as const };
    }),
  } as unknown as JobPort & {
    lockForFinalization: ReturnType<typeof vi.fn>;
  };
  const projectRepo = {
    lockForUpdate: vi.fn(async () => {
      calls.push('project.lockForUpdate');
      return options.project === undefined ? project : options.project;
    }),
  } as unknown as ProjectRepo;
  const ports = {
    project: projectRepo,
    job,
    workflowInvocation: workflow,
    generationAttempt,
    aiUsage,
  } as unknown as TxPorts;
  const unitOfWork: UnitOfWork = {
    async execute<T>(fn: (ports: TxPorts) => Promise<T>): Promise<T> {
      for (;;) {
        transactionAttempt += 1;
        calls.push('begin');
        try {
          const result = await fn(ports);
          calls.push('commit');
          return result;
        } catch (error) {
          calls.push('rollback');
          if (
            options.retryFinalizeOnce &&
            transactionAttempt === 1 &&
            error instanceof Error &&
            error.message === 'serialization failure'
          )
            continue;
          throw error;
        }
      }
    },
  };
  return {
    calls,
    workflow,
    generationAttempt,
    aiUsage,
    job,
    projectRepo,
    service: createWorkflowInvocationService(unitOfWork),
  };
}

describe('workflow invocation service Tx A', () => {
  it('locks project then exact live owner and starts caller-owned stable IDs', async () => {
    const h = harness();
    const result = await h.service.beginAttempt(beginInput);
    expect(result).toEqual({ kind: 'started', invocation, attempt });
    expect(h.calls).toEqual([
      'begin',
      'project.lockForUpdate',
      'job.lockLiveOwnerForAttempt',
      'workflow.beginAttempt',
      'commit',
    ]);
    expect(h.job.lockLiveOwnerForAttempt).toHaveBeenCalledWith(beginInput);
    expect(h.workflow.beginAttempt).toHaveBeenCalledWith(beginInput);
  });

  it.each([
    ['missing project', null, 'locked'],
    ['tombstoned project', { ...project, deletedAt: now }, 'locked'],
    ['invalid job/token/fence/state/expiry/cancellation', project, 'not_authorized'],
  ] as const)(
    'returns not_authorized with zero lifecycle writes for %s',
    async (_name, lockedProject, owner) => {
      const h = harness({ project: lockedProject, owner });
      expect(await h.service.beginAttempt(beginInput)).toEqual({ kind: 'not_authorized' });
      expect(h.workflow.beginAttempt).not.toHaveBeenCalled();
    },
  );

  it.each(['already_started', 'conflict'] as const)(
    'preserves deterministic begin outcome %s',
    async (kind) => {
      const h = harness({ begin: kind });
      const result = await h.service.beginAttempt(beginInput);
      expect(result.kind).toBe(kind);
      expect(h.workflow.beginAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ invocationId: 'invocation-1', attemptId: 'attempt-1' }),
      );
    },
  );

  it('does not allocate caller invocation or attempt IDs', async () => {
    const h = harness();
    await h.service.beginAttempt(beginInput);
    expect((h as unknown as { allocateId?: unknown }).allocateId).toBeUndefined();
    expect(h.workflow.beginAttempt).toHaveBeenCalledWith(beginInput);
  });
});

describe('workflow invocation service Tx B', () => {
  const finalizeInput = {
    ...beginInput,
    status: 'succeeded' as const,
    providerRequestId: 'provider-1',
    resultHash: 'hash-1',
    schemaVersion: 2,
    payload: { result: 'ok' },
    usage,
  };

  it.each(['ineligible_owner', 'cancelled', 'project_tombstoned', 'already_won_by_other'] as const)(
    'commits finalized attempt and usage for expected %s outcome',
    async (winner) => {
      const h = harness({ winner });
      const result = await h.service.finalizeAttempt(finalizeInput);
      expect(result.kind).toBe('finalized');
      expect(result).toMatchObject({ winner });
      expect(h.calls).toEqual([
        'begin',
        'project.lockForUpdate',
        'job.lockForFinalization',
        'workflow.lockForFinalization',
        'attempt.finalize',
        'usage.appendForAttempt',
        'workflow.classifyWinner',
        'commit',
      ]);
    },
  );

  it('returns explicit not_selected for exact terminal replay with no invocation winner', async () => {
    const h = harness({ finalize: 'replayed', usage: 'replayed', winner: 'not_selected' });
    expect(await h.service.finalizeAttempt(finalizeInput)).toMatchObject({
      kind: 'replayed',
      winner: 'not_selected',
    });
    expect(h.workflow.classifyWinner).toHaveBeenCalledWith(
      finalizeInput,
      expect.any(Object),
      false,
      'eligible',
    );
  });

  it.each([
    ['attempt semantic conflict', { finalize: 'conflict' }],
    ['usage semantic conflict after lifecycle write', { usage: 'conflict' }],
    ['winner semantic conflict after lifecycle and usage writes', { winner: 'conflict' }],
  ] as const)('rolls back %s and maps external conflict', async (_name, options) => {
    const h = harness(options);
    expect(await h.service.finalizeAttempt(finalizeInput)).toEqual({ kind: 'conflict' });
    expect(h.calls.at(-1)).toBe('rollback');
  });

  it('retries DB error with stable IDs and produces one logical result', async () => {
    const h = harness({ retryFinalizeOnce: true });
    const result = await h.service.finalizeAttempt(finalizeInput);
    expect(result.kind).toBe('finalized');
    expect(h.generationAttempt.finalizeAttempt).toHaveBeenCalledTimes(2);
    for (const [input] of h.generationAttempt.finalizeAttempt.mock.calls) {
      expect(input).toMatchObject({ invocationId: 'invocation-1', attemptId: 'attempt-1' });
    }
    expect(h.aiUsage.appendForAttempt).toHaveBeenCalledOnce();
  });

  it('keeps chargedParty out of caller-controlled metrics and commands', () => {
    expectTypeOf<UsageMetrics>().not.toHaveProperty('chargedParty');
    expectTypeOf<typeof finalizeInput>().not.toHaveProperty('chargedParty');
  });

  it('owns transactions only and exposes no executor or validator dependencies', () => {
    const h = harness();
    expect(h.service).toEqual({
      beginAttempt: expect.any(Function),
      finalizeAttempt: expect.any(Function),
    });
  });
});

describe('persisted lifecycle vocabulary', () => {
  it('uses exact invocation and attempt states while finalize excludes cancelled', () => {
    expectTypeOf<WorkflowInvocationStatus>().toEqualTypeOf<
      'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    >();
    expectTypeOf<GenerationAttemptStatus>().toEqualTypeOf<
      'started' | 'succeeded' | 'failed' | 'cancelled'
    >();
  });
});

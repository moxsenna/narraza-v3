import { describe, expect, it, vi } from 'vitest';
import { createAttemptOrchestrator } from './attempt-orchestrator.js';
import type { WorkflowInvocationService } from '../workflows/workflow-invocation-service.js';
import type { JobService } from '../jobs/job-service.js';

const identity = {
  projectId: 'project-1',
  jobId: 'job-1',
  leaseToken: 'lease-1',
  fenceVersion: 3,
} as const;

const profiles = [
  {
    providerId: 'mock-primary',
    requestedModelId: 'primary',
    resolvedModelId: 'primary-v1',
    structuredOutput: true,
    timeoutMs: 1_000,
    maxInputTokens: 100,
    maxOutputTokens: 100,
    priceSnapshotId: 'price-primary',
    maxInvocations: 1,
  },
  {
    providerId: 'mock-secondary',
    requestedModelId: 'secondary',
    resolvedModelId: 'secondary-v1',
    structuredOutput: true,
    timeoutMs: 2_000,
    maxInputTokens: 100,
    maxOutputTokens: 100,
    priceSnapshotId: 'price-secondary',
    maxInvocations: 1,
  },
] as const;

const plan = {
  schemaVersion: 1 as const,
  workflowKind: 'concept_generation',
  stages: [
    {
      stageKey: 'concepts',
      purpose: 'generate' as const,
      packetKind: 'planner' as const,
      dataClass: 'author_private',
      runPolicy: 'always' as const,
      routing: profiles,
    },
  ],
};

function harness(attemptCount: number) {
  const workflow = {
    beginAttempt: vi.fn(async () => ({ kind: 'started' as const, attempt: {} as never })),
    finalizeAttempt: vi.fn(),
  } as unknown as WorkflowInvocationService;
  const jobs = {
    finish: vi.fn(async () => ({ kind: 'terminalized' as const, job: {} as never })),
    withFencedPublish: vi.fn(),
  } as unknown as JobService;
  const attemptRecovery = {
    closeOrphanedStartedAttempts: vi.fn(async () => ({ closed: attemptCount > 0 ? 1 : 0 })),
    loadStageWinners: vi.fn(async () => []),
    countStageAttempts: vi.fn(async () => attemptCount),
  };
  const executeStage = vi.fn(async () => ({
    kind: 'recoverable_no_response' as const,
    reason: 'threw' as const,
    errorCode: 'provider_timeout',
  }));
  const orchestrator = createAttemptOrchestrator({
    workflow,
    jobs,
    attemptRecovery,
    executeStage,
  });
  orchestrator.withIdAllocator(() => 'attempt-sequence');
  return { workflow, jobs, attemptRecovery, executeStage, orchestrator };
}

const runInput = {
  identity,
  plan,
  buildStageRequest: (_stage: (typeof plan.stages)[number], profileIndex: number) => ({
    systemPrompt: 'system',
    userPrompt: 'user',
    profileIndex,
  }),
  publish: vi.fn(async () => {}),
};

describe('attempt orchestrator hard caps and explicit routing', () => {
  it('passes successful parsed stage outputs into one fenced publish', async () => {
    const workflow = {
      beginAttempt: vi.fn(async () => ({ kind: 'started' as const, attempt: {} as never })),
      finalizeAttempt: vi.fn(async () => ({ kind: 'finalized' as const })),
    } as unknown as WorkflowInvocationService;
    const publishM4ProductOutput = vi.fn(async () => undefined);
    const jobs = {
      finish: vi.fn(),
      withFencedPublish: vi.fn(async (_identity, publish) => {
        await publish({ appendSentinel: vi.fn(), publishM4ProductOutput });
        return { kind: 'published' as const, job: {} as never };
      }),
    } as unknown as JobService;
    const executeStage = vi.fn(async () => ({
      kind: 'billable' as const,
      status: 'succeeded' as const,
      providerRequestId: 'request-1',
      resultHash: 'hash-1',
      schemaVersion: 1,
      payload: { parseFailed: false, output: { concepts: [{ title: 'One' }] } },
      usage: {
        priceSnapshotId: 'price-primary',
        inputTokens: 1,
        outputTokens: 1,
        providerCostMicroIdr: 1n,
      },
    }));
    const publish = vi.fn(async () => undefined);
    const orchestrator = createAttemptOrchestrator({ workflow, jobs, executeStage });
    orchestrator.withIdAllocator(() => 'attempt-sequence');

    await expect(orchestrator.runPlan({ ...runInput, publish })).resolves.toMatchObject({
      kind: 'published',
    });

    expect(jobs.withFencedPublish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        stageOutputs: { concepts: { concepts: [{ title: 'One' }] } },
        publishM4ProductOutput,
      }),
    );
  });

  it('hydrates durable winners and resumes at next stage without duplicate provider call', async () => {
    const twoStagePlan = {
      ...plan,
      workflowKind: 'beat_write_judge',
      stages: [
        { ...plan.stages[0]!, stageKey: 'writer', packetKind: 'writer' as const },
        {
          ...plan.stages[0]!,
          stageKey: 'judge',
          purpose: 'judge' as const,
          packetKind: 'validator' as const,
        },
      ],
    };
    const workflow = {
      beginAttempt: vi.fn(async () => ({ kind: 'started' as const, attempt: {} as never })),
      finalizeAttempt: vi.fn(async () => ({ kind: 'finalized' as const })),
    } as unknown as WorkflowInvocationService;
    const jobs = {
      finish: vi.fn(),
      withFencedPublish: vi.fn(async (_identity, publish) => {
        await publish({ appendSentinel: vi.fn() });
        return { kind: 'published' as const, job: {} as never };
      }),
    } as unknown as JobService;
    const attemptRecovery = {
      closeOrphanedStartedAttempts: vi.fn(async () => ({ closed: 0 })),
      loadStageWinners: vi.fn(async () => [
        {
          stageKey: 'writer',
          status: 'succeeded' as const,
          schemaVersion: 1,
          payload: { output: { candidates: [{ text: 'original' }] } },
        },
      ]),
      countStageAttempts: vi.fn(async ({ stageKey }: { stageKey: string }) =>
        stageKey === 'writer' ? 1 : 0,
      ),
    };
    const executeStage = vi.fn(async () => ({
      kind: 'billable' as const,
      status: 'succeeded' as const,
      providerRequestId: 'judge-request',
      resultHash: 'judge-hash',
      schemaVersion: 1,
      payload: { output: { verdict: 'pass' } },
      usage: {
        priceSnapshotId: 'price-primary',
        inputTokens: 1,
        outputTokens: 1,
        providerCostMicroIdr: 1n,
      },
    }));
    const publish = vi.fn(async () => undefined);
    const orchestrator = createAttemptOrchestrator({
      workflow,
      jobs,
      attemptRecovery,
      executeStage,
    });

    await expect(
      orchestrator.runPlan({ ...runInput, plan: twoStagePlan, publish }),
    ).resolves.toMatchObject({ kind: 'published' });
    expect(executeStage).toHaveBeenCalledOnce();
    expect(executeStage).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: expect.objectContaining({ stageKey: 'judge' }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        stageOutputs: {
          writer: { candidates: [{ text: 'original' }] },
          judge: { verdict: 'pass' },
        },
      }),
    );
  });

  it('finalizes parse-failed output as failed so it cannot become durable winner', async () => {
    const workflow = {
      beginAttempt: vi.fn(async () => ({ kind: 'started' as const, attempt: {} as never })),
      finalizeAttempt: vi.fn(async () => ({ kind: 'finalized' as const })),
    } as unknown as WorkflowInvocationService;
    const jobs = {
      finish: vi.fn(async () => ({ kind: 'terminalized' as const, job: {} as never })),
      withFencedPublish: vi.fn(),
    } as unknown as JobService;
    const executeStage = vi.fn(async () => ({
      kind: 'billable' as const,
      status: 'succeeded' as const,
      providerRequestId: 'malformed-request',
      resultHash: 'malformed-hash',
      schemaVersion: 1,
      payload: { parseFailed: true, errorCode: 'malformed_json' },
      usage: {
        priceSnapshotId: 'price-primary',
        inputTokens: 3,
        outputTokens: 4,
        providerCostMicroIdr: 9n,
      },
    }));
    const orchestrator = createAttemptOrchestrator({ workflow, jobs, executeStage });

    await expect(orchestrator.runPlan(runInput)).resolves.toMatchObject({
      kind: 'plan_failed',
      errorCode: 'malformed_json',
    });
    expect(workflow.finalizeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        payload: { parseFailed: true, errorCode: 'malformed_json' },
        usage: expect.objectContaining({ providerCostMicroIdr: 9n }),
      }),
    );
  });

  it('fenced-finishes successful output missing as failed', async () => {
    const workflow = {
      beginAttempt: vi.fn(async () => ({ kind: 'started' as const, attempt: {} as never })),
      finalizeAttempt: vi.fn(async () => ({ kind: 'finalized' as const })),
    } as unknown as WorkflowInvocationService;
    const jobs = {
      finish: vi.fn(async () => ({ kind: 'terminalized' as const, job: {} as never })),
      withFencedPublish: vi.fn(),
    } as unknown as JobService;
    const orchestrator = createAttemptOrchestrator({
      workflow,
      jobs,
      executeStage: vi.fn(async () => ({
        kind: 'billable' as const,
        status: 'succeeded' as const,
        providerRequestId: 'request',
        resultHash: 'hash',
        schemaVersion: 1,
        payload: { parseFailed: false },
        usage: {
          priceSnapshotId: 'price-primary',
          inputTokens: 1,
          outputTokens: 1,
          providerCostMicroIdr: 1n,
        },
      })),
    });

    await expect(orchestrator.runPlan(runInput)).resolves.toEqual({
      kind: 'plan_failed',
      errorCode: 'successful_stage_output_missing',
      stageKey: 'concepts',
    });
    expect(jobs.finish).toHaveBeenCalledWith({ ...identity, status: 'failed' });
  });

  it('reports ownership loss distinctly and never finishes after begin denial', async () => {
    const workflow = {
      beginAttempt: vi.fn(async () => ({ kind: 'not_authorized' as const })),
      finalizeAttempt: vi.fn(),
    } as unknown as WorkflowInvocationService;
    const jobs = { finish: vi.fn(), withFencedPublish: vi.fn() } as unknown as JobService;
    const executeStage = vi.fn();
    const orchestrator = createAttemptOrchestrator({ workflow, jobs, executeStage });

    await expect(orchestrator.runPlan(runInput)).resolves.toEqual({
      kind: 'ownership_lost',
      phase: 'begin',
    });
    expect(executeStage).not.toHaveBeenCalled();
    expect(jobs.finish).not.toHaveBeenCalled();
  });

  it('terminalizes permanent model-policy failure without recovery loop', async () => {
    const workflow = {
      beginAttempt: vi.fn(async () => ({ kind: 'started' as const, attempt: {} as never })),
      finalizeAttempt: vi.fn(async () => ({ kind: 'finalized' as const })),
    } as unknown as WorkflowInvocationService;
    const jobs = {
      finish: vi.fn(async () => ({ kind: 'terminalized' as const, job: {} as never })),
      withFencedPublish: vi.fn(),
    } as unknown as JobService;
    const executeStage = vi.fn(async () => ({
      kind: 'billable' as const,
      status: 'failed' as const,
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: { errorCode: 'model_policy_violation' },
      usage: {
        priceSnapshotId: 'price-primary',
        inputTokens: 0,
        outputTokens: 0,
        providerCostMicroIdr: 0n,
      },
    }));
    const orchestrator = createAttemptOrchestrator({ workflow, jobs, executeStage });

    await expect(orchestrator.runPlan(runInput)).resolves.toEqual({
      kind: 'plan_failed',
      errorCode: 'model_policy_violation',
      stageKey: 'concepts',
    });
    expect(executeStage).toHaveBeenCalledOnce();
    expect(jobs.finish).toHaveBeenCalledWith({ ...identity, status: 'failed' });
    expect(jobs.withFencedPublish).not.toHaveBeenCalled();
  });

  it('counts recovered orphan capacity and persists selected second profile route', async () => {
    const h = harness(1);

    await expect(h.orchestrator.runPlan(runInput)).resolves.toEqual({
      kind: 'recoverable',
      errorCode: 'provider_timeout',
      stageKey: 'concepts',
    });

    expect(h.attemptRecovery.closeOrphanedStartedAttempts).toHaveBeenCalledWith({
      projectId: 'project-1',
      jobId: 'job-1',
      errorCode: 'attempt_abandoned_worker_loss',
    });
    expect(h.workflow.beginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'wf-att:job-1:concepts:attempt-sequence',
        payload: {
          providerId: 'mock-secondary',
          requestedModelId: 'secondary',
          resolvedModelId: 'secondary-v1',
          profileIndex: 1,
        },
      }),
    );
    expect(h.executeStage).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'mock-secondary',
        requestedModelId: 'secondary',
        profileIndex: 1,
        timeoutMs: 2_000,
      }),
    );
    expect(h.executeStage).toHaveBeenCalledOnce();
  });

  it('fails at exact cumulative ceiling before begin or provider', async () => {
    const h = harness(2);

    await expect(h.orchestrator.runPlan(runInput)).resolves.toEqual({
      kind: 'plan_failed',
      errorCode: 'invocations_exhausted',
      stageKey: 'concepts',
    });

    expect(h.workflow.beginAttempt).not.toHaveBeenCalled();
    expect(h.executeStage).not.toHaveBeenCalled();
    expect(h.jobs.finish).toHaveBeenCalledWith({ ...identity, status: 'failed' });
  });
});

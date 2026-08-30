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

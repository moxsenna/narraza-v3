import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobRecord, UnitOfWork } from '@narraza/application';
import type { ProviderPort } from '@narraza/ai';
import { createM4JobProcessor, M4_WORKFLOW_KINDS } from './m4-job-processor.js';

const claimed = (kind: string): GenerationJobRecord => ({
  id: 'job-1',
  projectId: 'project-1',
  kind,
  status: 'running',
  priority: 0,
  availableAt: new Date('2026-01-01T00:00:00.000Z'),
  leaseToken: 'lease-1',
  leaseExpiresAt: new Date('2026-01-01T00:01:00.000Z'),
  fenceVersion: 1,
  cancelRequestedAt: null,
  retryOfJobId: null,
  bundleId: 'bundle-1',
  workflowPlanId: 'plan-1',
  reservationId: 'reservation-1',
  schemaVersion: 1,
  payload: {},
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const neverUow = {
  execute: async () => {
    throw new Error('unit of work must not run');
  },
} as unknown as UnitOfWork;

describe('M4 job processor boundary', () => {
  it('exposes exact authoritative workflow allowlist', () => {
    expect(M4_WORKFLOW_KINDS).toEqual([
      'chat_intake_reply',
      'concept_generation',
      'foundation_generation',
      'character_generation',
      'outline_generation',
      'beat_write_judge',
      'safe_repair',
      'publish_package',
    ]);
  });

  it('fails closed on unknown job kind before DB or provider', async () => {
    const processor = createM4JobProcessor({ unitOfWork: neverUow, providers: new Map() });

    await expect(
      processor(claimed('chapter.write.compose'), new AbortController().signal),
    ).rejects.toThrow("rejects unknown job kind 'chapter.write.compose'");
  });

  it('requeues an already-aborted allowed job before DB or provider', async () => {
    const processor = createM4JobProcessor({ unitOfWork: neverUow, providers: new Map() });
    const controller = new AbortController();
    controller.abort();

    await expect(processor(claimed('concept_generation'), controller.signal)).resolves.toEqual({
      kind: 'requeue',
      delayMs: 0,
    });
  });

  it('terminalizes unsupported restricted frozen route before beginAttempt or provider', async () => {
    const executeSingleAttempt = vi.fn();
    const beginAttempt = vi.fn();
    const transitionRunningToTerminal = vi.fn(async () => ({
      kind: 'terminalized' as const,
      job: { ...claimed('concept_generation'), status: 'failed' as const },
    }));
    const packet = {
      packetKind: 'planner',
      payload: {
        kind: 'planner',
        dataClass: 'author_private',
        metadata: { projectId: 'project-1', dependencyHash: 'dependency-1' },
      },
    };
    const uow = {
      execute: async (operation: (ports: unknown) => Promise<unknown>) =>
        operation({
          project: {
            lockForUpdate: vi.fn(async () => ({ ownerUserId: 'user-1', deletedAt: null })),
          },
          job: {
            lockForUpdate: vi.fn(async () => claimed('concept_generation')),
            transitionRunningToTerminal,
            lockLiveOwnerForAttempt: vi.fn(),
          },
          workflowInvocation: { beginAttempt },
          workflowPlan: {
            findPlanById: vi.fn(async () => ({
              id: 'plan-1',
              bundleId: 'bundle-1',
              workflowKind: 'concept_generation',
              planHash: 'plan-hash',
              payload: {
                schemaVersion: 1,
                workflowKind: 'concept_generation',
                stages: [
                  {
                    stageKey: 'concepts',
                    purpose: 'generate',
                    packetKind: 'planner',
                    dataClass: 'author_private',
                    runPolicy: 'always',
                    routing: [
                      {
                        providerId: 'openrouter',
                        requestedModelId: 'model',
                        resolvedModelId: 'model',
                        structuredOutput: true,
                        timeoutMs: 1_000,
                        maxInputTokens: 100,
                        maxOutputTokens: 100,
                        priceSnapshotId: 'price',
                        maxInvocations: 1,
                      },
                    ],
                  },
                ],
              },
            })),
          },
          contextBundle: {
            findBundleById: vi.fn(async () => ({ id: 'bundle-1', dependencyHash: 'dependency-1' })),
            findPacketByKind: vi.fn(async () => packet),
          },
        }),
    } as unknown as UnitOfWork;
    const job = {
      ...claimed('concept_generation'),
      payload: { workflowPlanHash: 'plan-hash', dependencyHash: 'dependency-1' },
    };
    const provider = { executeSingleAttempt } as ProviderPort;
    const processor = createM4JobProcessor({
      unitOfWork: uow,
      providers: new Map([['openrouter', provider]]),
    });

    await expect(processor(job, new AbortController().signal)).resolves.toEqual({
      kind: 'terminalized',
    });
    expect(transitionRunningToTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', status: 'failed' }),
    );
    expect(beginAttempt).not.toHaveBeenCalled();
    expect(executeSingleAttempt).not.toHaveBeenCalled();
  });
});

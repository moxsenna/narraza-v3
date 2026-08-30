import { createHash } from 'node:crypto';
import {
  createAttemptOrchestrator,
  createAttemptRecoveryService,
  createJobService,
  createWorkflowInvocationService,
  type GenerationJobRecord,
  type JsonObject,
  type UnitOfWork,
} from '@narraza/application';
import {
  assertModelPolicy,
  classifyProviderError,
  mockScenarioForStage,
  parseOutput,
  projectWorkflowPrompt,
  workflowOutputSchema,
  type ProviderPort,
  type SingleAttemptRequest,
} from '@narraza/ai';
import type { JobProcessor } from './job-loop.js';

export const M4_WORKFLOW_KINDS = [
  'chat_intake_reply',
  'concept_generation',
  'foundation_generation',
  'character_generation',
  'outline_generation',
  'beat_write_judge',
  'safe_repair',
  'publish_package',
] as const;

type M4WorkflowKind = (typeof M4_WORKFLOW_KINDS)[number];
const M4_KIND_SET = new Set<string>(M4_WORKFLOW_KINDS);

interface ProcessorDeps {
  readonly unitOfWork: UnitOfWork;
  readonly providers: ReadonlyMap<string, ProviderPort>;
}

function asJob(value: unknown): GenerationJobRecord {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { id?: unknown }).id !== 'string' ||
    typeof (value as { projectId?: unknown }).projectId !== 'string' ||
    typeof (value as { kind?: unknown }).kind !== 'string' ||
    typeof (value as { leaseToken?: unknown }).leaseToken !== 'string' ||
    typeof (value as { fenceVersion?: unknown }).fenceVersion !== 'number'
  ) {
    throw new Error('M4 processor received invalid claimed job');
  }
  return value as GenerationJobRecord;
}

function promptValue(payload: JsonObject, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

export function createM4JobProcessor(deps: ProcessorDeps): JobProcessor {
  const jobs = createJobService(deps.unitOfWork);
  const orchestrator = createAttemptOrchestrator({
    workflow: createWorkflowInvocationService(deps.unitOfWork),
    jobs,
    attemptRecovery: createAttemptRecoveryService({ unitOfWork: deps.unitOfWork }),
    executeStage: async (stageRequest) => {
      const provider = deps.providers.get(stageRequest.providerId);
      if (!provider) {
        throw new Error(`M4 provider '${stageRequest.providerId}' is not configured`);
      }
      const request: SingleAttemptRequest = {
        providerId: stageRequest.providerId,
        requestedModelId: stageRequest.requestedModelId,
        structuredOutput: stageRequest.structuredOutput,
        timeoutMs: stageRequest.timeoutMs,
        dataClass: stageRequest.dataClass as SingleAttemptRequest['dataClass'],
        systemPrompt: stageRequest.systemPrompt,
        userPrompt: stageRequest.userPrompt,
        ...(stageRequest.mockScenario ? { mockScenario: stageRequest.mockScenario } : {}),
      };
      assertModelPolicy(request);
      try {
        const response = await provider.executeSingleAttempt(request);
        const parsed = parseOutput(
          workflowOutputSchema(stageRequest.stage.stageKey),
          response.rawBody,
        );
        return {
          kind: 'billable' as const,
          status: 'succeeded' as const,
          providerRequestId: response.providerRequestId,
          resultHash: createHash('sha256').update(response.rawBody).digest('hex'),
          schemaVersion: 1,
          payload:
            parsed.kind === 'parse_failed'
              ? { parseFailed: true, errorCode: parsed.errorCode }
              : { parseFailed: false, output: parsed.value as JsonObject },
          usage: {
            priceSnapshotId: stageRequest.stage.routing[stageRequest.profileIndex]!.priceSnapshotId,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            providerCostMicroIdr: response.usage.providerReportedCostMicroIdr ?? 0n,
          },
        };
      } catch (error) {
        const normalized = classifyProviderError(error);
        if (normalized.retryable) {
          return {
            kind: 'recoverable_no_response' as const,
            reason: 'threw' as const,
            errorCode: normalized.errorCode,
          };
        }
        return {
          kind: 'billable' as const,
          status: 'failed' as const,
          providerRequestId: null,
          resultHash: null,
          schemaVersion: 1,
          payload: { errorCode: normalized.errorCode },
          usage: {
            priceSnapshotId: stageRequest.stage.routing[stageRequest.profileIndex]!.priceSnapshotId,
            inputTokens: 0,
            outputTokens: 0,
            providerCostMicroIdr: 0n,
          },
        };
      }
    },
  });

  return async (value, signal) => {
    const job = asJob(value);
    if (!M4_KIND_SET.has(job.kind)) {
      throw new Error(`M4 processor rejects unknown job kind '${job.kind}'`);
    }
    if (signal.aborted) return { kind: 'requeue', delayMs: 0 };
    if (!job.workflowPlanId || !job.bundleId || !job.leaseToken) {
      throw new Error('M4 processor requires exact plan, bundle, and live lease');
    }

    const plan = await deps.unitOfWork.execute(async (ports) => {
      const record = await ports.workflowPlan?.findPlanById(job.projectId, job.workflowPlanId!);
      return record ?? null;
    });
    if (!plan || plan.workflowKind !== job.kind) {
      throw new Error('M4 processor exact plan binding invalid');
    }

    const result = await orchestrator.runPlan({
      identity: {
        projectId: job.projectId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        fenceVersion: job.fenceVersion,
      },
      plan: plan.payload as unknown as {
        schemaVersion: 1;
        workflowKind: M4WorkflowKind;
        stages: never[];
      },
      buildStageRequest: (stage, profileIndex) => {
        const prompt = projectWorkflowPrompt({
          stageKey: stage.stageKey,
          userContent:
            promptValue(job.payload, `${stage.stageKey}UserPrompt`) || JSON.stringify(job.payload),
        });
        return {
          ...prompt,
          ...(typeof job.payload.mockScenario === 'string'
            ? { mockScenario: job.payload.mockScenario }
            : stage.routing[profileIndex]?.providerId === 'mock'
              ? { mockScenario: mockScenarioForStage(stage.stageKey) }
              : {}),
          profileIndex,
        };
      },
      publish: async ({ appendSentinel }) => {
        await appendSentinel({
          aggregateType: 'generation_job',
          aggregateId: job.id,
          eventType: 'm4_workflow_published',
          dedupeKey: `m4-workflow-published:${job.id}`,
          payload: { projectId: job.projectId, jobId: job.id, workflowKind: job.kind },
        });
      },
    });

    if (result.kind === 'recoverable') return { kind: 'requeue', delayMs: 0 };
    return { kind: 'terminalized' };
  };
}

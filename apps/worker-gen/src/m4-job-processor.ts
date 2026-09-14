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
  assertSingleAttemptInputCeiling,
  classifyProviderError,
  ModelPolicyViolation,
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

function packetDataClass(payload: JsonObject): string {
  return typeof payload.dataClass === 'string' ? payload.dataClass : '';
}

function packetMetadata(payload: JsonObject): JsonObject | null {
  const value = payload.metadata;
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function validateM4StageOutput(stage: { readonly purpose: string }, payload: JsonObject) {
  if (stage.purpose !== 'judge' && stage.purpose !== 'judge_output_repair') {
    return { kind: 'valid' as const };
  }
  const output = payload.output ?? payload.value;
  const verdict =
    typeof output === 'object' && output !== null && !Array.isArray(output)
      ? (output as JsonObject).verdict
      : undefined;
  return verdict === 'fail'
    ? ({ kind: 'invalid', errorCode: 'judge_verdict_failed' } as const)
    : ({ kind: 'valid' } as const);
}

export function frozenPacketPrompt(input: {
  readonly stagePacketKind: string;
  readonly stageDataClass: string;
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly packet: { readonly packetKind: string; readonly payload: JsonObject } | null;
}): string {
  const packet = input.packet;
  const metadata = packet ? packetMetadata(packet.payload) : null;
  if (
    !packet ||
    packet.packetKind !== input.stagePacketKind ||
    packet.payload.kind !== input.stagePacketKind ||
    packetDataClass(packet.payload) !== input.stageDataClass ||
    metadata?.projectId !== input.projectId ||
    metadata.dependencyHash !== input.dependencyHash
  ) {
    throw new Error(`M4 processor frozen packet binding invalid for '${input.stagePacketKind}'`);
  }
  return JSON.stringify(packet.payload);
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
        maxInputTokens: stageRequest.maxInputTokens,
        maxOutputTokens: stageRequest.maxOutputTokens,
        dataClass: stageRequest.dataClass as SingleAttemptRequest['dataClass'],
        systemPrompt: stageRequest.systemPrompt,
        userPrompt: stageRequest.userPrompt,
        ...(stageRequest.mockScenario ? { mockScenario: stageRequest.mockScenario } : {}),
      };
      try {
        assertModelPolicy(request);
        assertSingleAttemptInputCeiling(request);
        const response = await provider.executeSingleAttempt(request);
        const parsed = parseOutput(
          workflowOutputSchema(stageRequest.stage.stageKey),
          response.rawBody,
        );
        return {
          kind: 'billable' as const,
          status: parsed.kind === 'parse_failed' ? ('failed' as const) : ('succeeded' as const),
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
        if (error instanceof ModelPolicyViolation) {
          return {
            kind: 'billable' as const,
            status: 'failed' as const,
            providerRequestId: null,
            resultHash: null,
            schemaVersion: 1,
            payload: { errorCode: error.code },
            usage: {
              priceSnapshotId:
                stageRequest.stage.routing[stageRequest.profileIndex]!.priceSnapshotId,
              inputTokens: 0,
              outputTokens: 0,
              providerCostMicroIdr: 0n,
            },
          };
        }
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
    validateStage: async (stage, outcome) => validateM4StageOutput(stage, outcome.payload),
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

    const frozen = await deps.unitOfWork.execute(async (ports) => {
      const plan = await ports.workflowPlan?.findPlanById(job.projectId, job.workflowPlanId!);
      if (!plan || plan.bundleId !== job.bundleId) return null;
      const bundle = await ports.contextBundle?.findBundleById(job.projectId, job.bundleId!);
      if (!bundle || bundle.id !== job.bundleId) return null;
      const stages = (plan.payload as { stages?: Array<{ packetKind?: unknown }> }).stages;
      if (!Array.isArray(stages) || !ports.contextBundle) return null;
      const packetKinds = [...new Set(stages.map((stage) => stage.packetKind))];
      if (packetKinds.some((kind) => typeof kind !== 'string')) return null;
      const packets = await Promise.all(
        packetKinds.map(
          async (kind) =>
            [
              kind as string,
              await ports.contextBundle!.findPacketByKind(
                job.projectId,
                job.bundleId!,
                kind as string,
              ),
            ] as const,
        ),
      );
      return { plan, bundle, packets: new Map(packets) };
    });
    if (
      !frozen ||
      frozen.plan.workflowKind !== job.kind ||
      frozen.plan.planHash !== promptValue(job.payload, 'workflowPlanHash') ||
      frozen.bundle.dependencyHash !== promptValue(job.payload, 'dependencyHash')
    ) {
      throw new Error('M4 processor exact plan/bundle/hash binding invalid');
    }
    const plan = frozen.plan;
    const dependencyHash = frozen.bundle.dependencyHash;
    const planPayload = plan.payload as unknown as {
      schemaVersion: 1;
      workflowKind: M4WorkflowKind;
      stages: Array<{
        packetKind: string;
        dataClass: SingleAttemptRequest['dataClass'];
        routing: Array<{ providerId: string }>;
      }>;
    };
    for (const stage of planPayload.stages) {
      frozenPacketPrompt({
        stagePacketKind: stage.packetKind,
        stageDataClass: stage.dataClass,
        projectId: job.projectId,
        dependencyHash,
        packet: frozen.packets.get(stage.packetKind) ?? null,
      });
    }
    try {
      for (const stage of planPayload.stages) {
        for (const route of stage.routing) {
          assertModelPolicy({ providerId: route.providerId, dataClass: stage.dataClass });
        }
      }
    } catch (error) {
      if (!(error instanceof ModelPolicyViolation)) throw error;
      const finished = await jobs.finish({
        projectId: job.projectId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        fenceVersion: job.fenceVersion,
        status: 'failed',
      });
      return finished.kind === 'terminalized' || finished.kind === 'already_terminal'
        ? { kind: 'terminalized' }
        : { kind: 'ownership_lost' };
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
          userContent: frozenPacketPrompt({
            stagePacketKind: stage.packetKind,
            stageDataClass: stage.dataClass,
            projectId: job.projectId,
            dependencyHash,
            packet: frozen.packets.get(stage.packetKind) ?? null,
          }),
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
      publish: async ({ appendSentinel, publishM4ProductOutput, stageOutputs }) => {
        if (!publishM4ProductOutput) {
          throw new Error('M4 product projection port is not configured');
        }
        const dependencyHash = promptValue(job.payload, 'dependencyHash');
        if (!dependencyHash) throw new Error('M4 processor exact dependency binding missing');
        await publishM4ProductOutput({
          projectId: job.projectId,
          jobId: job.id,
          workflowKind: job.kind,
          dependencyHash,
          jobPayload: job.payload,
          stageOutputs,
        });
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
    if (result.kind === 'ownership_lost' || result.kind === 'publish_denied') {
      return { kind: 'ownership_lost' };
    }
    return { kind: 'terminalized' };
  };
}

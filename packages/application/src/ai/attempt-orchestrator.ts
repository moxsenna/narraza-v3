import type { JobLeaseIdentity, JsonObject } from '../ports/types.js';
import type { JobService } from '../jobs/job-service.js';
import type { WorkflowInvocationService } from '../workflows/workflow-invocation-service.js';
import type { ExecutorOutcome, ValidatorOutcome } from '../workflows/three-phase-attempt.js';
import { ai } from '@narraza/core';
const { decideNextAction } = ai;
type WorkflowPlanStage = ai.WorkflowPlanStage;
type StageOutcomeRecord = ai.StageOutcomeRecord;
import { ORPHAN_ATTEMPT_ERROR_CODE } from './attempt-recovery-port.js';
import type { M4ProductOutputPort } from './m4-product-output-port.js';

/** UoW-backed recovery service (see createAttemptRecoveryService). */
interface AttemptRecoveryService {
  closeOrphanedStartedAttempts(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly errorCode: string;
  }): Promise<{ readonly closed: number }>;
  loadStageWinners(input: { readonly projectId: string; readonly jobId: string }): Promise<
    readonly {
      readonly stageKey: string;
      readonly status: 'succeeded' | 'failed';
      readonly schemaVersion: number;
      readonly payload: JsonObject;
    }[]
  >;
  countStageAttempts(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly stageKey: string;
  }): Promise<number>;
}

/**
 * Block C attempt orchestrator: runs one frozen workflow plan against one
 * claimed job using the EXISTING M3 three-phase attempt contracts.
 *
 * Per executed stage the M3 sequence is preserved exactly:
 *   Tx A beginAttempt → provider call OUTSIDE any transaction (injected
 *   executor) → Tx B finalizeAttempt (+ usage) → CPU validation outside any
 *   transaction → (final stage) Tx C fenced publish.
 *
 * The executor adapter is injected by composition (worker/test) and wraps the
 * packages/ai provider port; the orchestrator itself never imports an AI
 * adapter (application-boundary). Stage progression is decided by the pure
 * `decideNextAction` policy over the frozen plan and recorded outcomes.
 */

export interface OrchestratorStageRequest {
  readonly stage: WorkflowPlanStage;
  /** Execution profile selected for this attempt (explicit, never a hidden fallback). */
  readonly providerId: string;
  readonly requestedModelId: string;
  readonly profileIndex: number;
  readonly structuredOutput: boolean;
  readonly timeoutMs: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly dataClass: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly mockScenario?: string;
}

export interface AttemptOrchestratorDeps {
  readonly workflow: WorkflowInvocationService;
  readonly jobs: JobService;
  readonly attemptRecovery?: AttemptRecoveryService;
  /** Wraps the packages/ai provider port; maps failures to ExecutorOutcome. */
  readonly executeStage: (request: OrchestratorStageRequest) => Promise<ExecutorOutcome>;
  /** CPU validation between Tx B and Tx C (defaults to accept). */
  readonly validateStage?: (
    stage: WorkflowPlanStage,
    outcome: Extract<ExecutorOutcome, { kind: 'billable' }>,
  ) => Promise<ValidatorOutcome>;
}

export interface RunPlanInput {
  readonly identity: JobLeaseIdentity;
  readonly plan: {
    readonly schemaVersion: 1;
    readonly workflowKind: string;
    readonly stages: readonly WorkflowPlanStage[];
  };
  /** Builds the stage request; called once per executed attempt. */
  readonly buildStageRequest: (
    stage: WorkflowPlanStage,
    profileIndex: number,
  ) => Omit<
    OrchestratorStageRequest,
    | 'stage'
    | 'providerId'
    | 'requestedModelId'
    | 'profileIndex'
    | 'structuredOutput'
    | 'timeoutMs'
    | 'maxInputTokens'
    | 'maxOutputTokens'
    | 'dataClass'
  >;
  /** Optional CPU parse gate; a parse failure triggers `on_parse_failure` stages. */
  readonly parseGate?: (
    stage: WorkflowPlanStage,
    outcome: Extract<ExecutorOutcome, { kind: 'billable' }>,
  ) => { readonly parseFailed: boolean };
  /** Fenced publish callback for the final stage (writes product rows). */
  readonly publish: (context: {
    readonly stageOutputs: Readonly<Record<string, JsonObject>>;
    readonly appendSentinel: (input: {
      readonly aggregateType: string;
      readonly aggregateId: string;
      readonly eventType: string;
      readonly dedupeKey: string;
      readonly schemaVersion?: number;
      readonly payload: JsonObject;
    }) => Promise<void>;
    readonly publishM4ProductOutput?: M4ProductOutputPort['publish'];
  }) => Promise<void>;
}

export type RunPlanResult =
  | { readonly kind: 'published'; readonly stageOutcomes: readonly StageOutcomeRecord[] }
  | { readonly kind: 'recoverable'; readonly errorCode: string; readonly stageKey: string }
  | { readonly kind: 'plan_failed'; readonly errorCode: string; readonly stageKey: string }
  | { readonly kind: 'ownership_lost'; readonly phase: 'begin' | 'finalize' | 'finish' }
  | { readonly kind: 'publish_denied'; readonly outcome: string };

/** Deterministic invocation identity: one invocation per (job, stage). */
function invocationIdFor(jobId: string, stageKey: string): string {
  return `wf-inv:${jobId}:${stageKey}`;
}

function newAttemptId(jobId: string, stageKey: string, allocate: () => string): string {
  return `wf-att:${jobId}:${stageKey}:${allocate()}`;
}

/** Explicit route selection across cumulative per-profile ceilings. */
function profileIndexForAttempt(stage: WorkflowPlanStage, usedAttempts: number): number {
  let remaining = usedAttempts;
  for (let index = 0; index < stage.routing.length; index += 1) {
    const profile = stage.routing[index]!;
    if (remaining < profile.maxInvocations) return index;
    remaining -= profile.maxInvocations;
  }
  throw new Error(`workflow stage '${stage.stageKey}' invocation ceiling exhausted`);
}

export function createAttemptOrchestrator(deps: AttemptOrchestratorDeps) {
  let allocate: () => string = () => globalThis.crypto.randomUUID();

  return {
    /** Composition hook so workers can reuse the port's id allocator. */
    withIdAllocator(next: () => string): void {
      allocate = next;
    },

    async runPlan(input: RunPlanInput): Promise<RunPlanResult> {
      const { identity, plan } = input;
      const failOwnedPlan = async (errorCode: string, stageKey: string): Promise<RunPlanResult> => {
        const finished = await deps.jobs.finish({ ...identity, status: 'failed' });
        if (
          finished.kind === 'terminalized' ||
          finished.kind === 'already_terminal' ||
          (finished.kind === 'funding_model_violation' && 'job' in finished)
        ) {
          return { kind: 'plan_failed', errorCode, stageKey };
        }
        return { kind: 'ownership_lost', phase: 'finish' };
      };

      // Recovery first (PM Decision 2): any `started` attempt in this job was
      // left by a dead worker — close it durably before anything new runs.
      // Abandoned attempts keep counting against the stage invocation cap.
      const outcomes: StageOutcomeRecord[] = [];
      const stageOutputs: Record<string, JsonObject> = {};
      const attemptsByStage: Record<string, number> = {};
      if (deps.attemptRecovery) {
        await deps.attemptRecovery.closeOrphanedStartedAttempts({
          projectId: identity.projectId,
          jobId: identity.jobId,
          errorCode: ORPHAN_ATTEMPT_ERROR_CODE,
        });
        const winners = await deps.attemptRecovery.loadStageWinners({
          projectId: identity.projectId,
          jobId: identity.jobId,
        });
        const planStageKeys = new Set(plan.stages.map((stage) => stage.stageKey));
        for (const winner of winners) {
          const stage = plan.stages.find((candidate) => candidate.stageKey === winner.stageKey);
          if (!stage || !planStageKeys.has(winner.stageKey)) {
            throw new Error(`recovered winner has unknown stage '${winner.stageKey}'`);
          }
          const recoveredOutcome: Extract<ExecutorOutcome, { kind: 'billable' }> = {
            kind: 'billable',
            status: winner.status,
            providerRequestId: null,
            resultHash: null,
            schemaVersion: winner.schemaVersion,
            payload: winner.payload,
            usage: {
              priceSnapshotId: stage.routing[0]!.priceSnapshotId,
              inputTokens: 0,
              outputTokens: 0,
              providerCostMicroIdr: 0n,
            },
          };
          const parseFailed = winner.payload.parseFailed === true;
          const validation =
            winner.payload.validationFailed === true
              ? ({
                  kind: 'invalid',
                  errorCode:
                    typeof winner.payload.validationErrorCode === 'string'
                      ? winner.payload.validationErrorCode
                      : 'stage_validation_failed',
                } as const)
              : deps.validateStage
                ? await deps.validateStage(stage, recoveredOutcome)
                : ({ kind: 'valid' } as const);
          const stageFailed =
            winner.status === 'failed' || parseFailed || validation.kind === 'invalid';
          outcomes.push({
            stageKey: winner.stageKey,
            status: stageFailed ? 'failed' : 'succeeded',
            parseFailed,
            judgeVerdictFailed:
              validation.kind === 'invalid' && validation.errorCode === 'judge_verdict_failed',
            ...(validation.kind === 'invalid' ? { errorCode: validation.errorCode } : {}),
          });
          if (!stageFailed) {
            const parsedOutput = winner.payload.output ?? winner.payload.value;
            if (
              typeof parsedOutput !== 'object' ||
              parsedOutput === null ||
              Array.isArray(parsedOutput)
            ) {
              throw new Error(`recovered winner output missing for stage '${winner.stageKey}'`);
            }
            stageOutputs[winner.stageKey] = parsedOutput as JsonObject;
          }
        }
        for (const stage of plan.stages) {
          attemptsByStage[stage.stageKey] = await deps.attemptRecovery.countStageAttempts({
            projectId: identity.projectId,
            jobId: identity.jobId,
            stageKey: stage.stageKey,
          });
        }
      }

      for (;;) {
        const attemptsForDecision = { ...attemptsByStage };
        const next = decideNextAction(plan, outcomes, attemptsForDecision);

        if (next.kind === 'plan_complete') {
          const published = await deps.jobs.withFencedPublish(
            identity,
            (context) => input.publish({ ...context, stageOutputs }),
            { settleUsableOutput: true },
          );
          if (published.kind === 'published') {
            return { kind: 'published', stageOutcomes: outcomes };
          }
          return { kind: 'publish_denied', outcome: published.kind };
        }
        if (next.kind === 'terminal_failed') {
          return failOwnedPlan(next.errorCode, next.stageKey);
        }

        const stage = next.stage;
        const usedAttempts = attemptsByStage[stage.stageKey] ?? 0;
        const profileIndex = profileIndexForAttempt(stage, usedAttempts);
        const profile = stage.routing[profileIndex]!;

        const invocationId = invocationIdFor(identity.jobId, stage.stageKey);
        const attemptId = newAttemptId(identity.jobId, stage.stageKey, allocate);

        // Tx A: begin (own transaction, commits before the provider call).
        const begun = await deps.workflow.beginAttempt({
          ...identity,
          invocationId,
          attemptId,
          stageKey: stage.stageKey,
          schemaVersion: 1,
          payload: {
            providerId: profile.providerId,
            requestedModelId: profile.requestedModelId,
            resolvedModelId: profile.resolvedModelId,
            profileIndex,
          },
        });
        if (begun.kind !== 'started') {
          // We no longer own the job (stale lease, cancellation requested,
          // tombstone): do NOT finish-fail it — the legitimate owner or the
          // reclaim sweeper decides its fate. M3 refuses new attempts on a
          // cancel-requested job, which surfaces here.
          return { kind: 'ownership_lost', phase: 'begin' };
        }
        // Every durable begin consumes capacity, including provider uncertainty.
        attemptsByStage[stage.stageKey] = usedAttempts + 1;

        // Provider call OUTSIDE any transaction.
        let executed: ExecutorOutcome;
        try {
          executed = await deps.executeStage({
            stage,
            providerId: profile.providerId,
            requestedModelId: profile.requestedModelId,
            profileIndex,
            structuredOutput: profile.structuredOutput,
            timeoutMs: profile.timeoutMs,
            maxInputTokens: profile.maxInputTokens,
            maxOutputTokens: profile.maxOutputTokens,
            dataClass: stage.dataClass,
            ...input.buildStageRequest(stage, profileIndex),
          });
        } catch {
          return {
            kind: 'recoverable',
            errorCode: 'executor_threw',
            stageKey: stage.stageKey,
          };
        }

        if (executed.kind === 'recoverable_no_response') {
          // The attempt stays `started` (W3.2 contract): usage is uncertain,
          // the lease will expire, and the next run closes the orphan.
          return {
            kind: 'recoverable',
            errorCode: executed.errorCode,
            stageKey: stage.stageKey,
          };
        }

        // CPU validation runs before Tx B so unusable output is durably failed and
        // can never become the invocation winner. Provider usage and payload still
        // finalize in Tx B, preserving billing evidence and attempt history.
        const parseFailed = input.parseGate
          ? input.parseGate(stage, executed).parseFailed
          : executed.payload.parseFailed === true;
        const validation: ValidatorOutcome =
          executed.status === 'failed'
            ? {
                kind: 'invalid',
                errorCode: (executed.payload.errorCode as string) ?? 'stage_failed',
              }
            : await (deps.validateStage
                ? deps.validateStage(stage, executed)
                : Promise.resolve({ kind: 'valid' as const }));
        const stageFailed =
          executed.status !== 'succeeded' || validation.kind === 'invalid' || parseFailed;

        // Tx B: finalize + usage inside the M3 service transaction. Unusable
        // provider responses are billable failed attempts, never durable winners.
        // Validation marker lets restart recovery reconstruct repair triggers.
        const durablePayload: JsonObject =
          validation.kind === 'invalid' && executed.status === 'succeeded'
            ? {
                ...executed.payload,
                validationFailed: true,
                validationErrorCode: validation.errorCode,
              }
            : executed.payload;
        const finalized = await deps.workflow.finalizeAttempt({
          ...identity,
          invocationId,
          attemptId,
          status: stageFailed ? 'failed' : 'succeeded',
          providerRequestId: executed.providerRequestId,
          resultHash: executed.resultHash,
          schemaVersion: executed.schemaVersion,
          payload: durablePayload,
          usage: executed.usage,
        });
        if (finalized.kind === 'not_authorized') {
          return { kind: 'ownership_lost', phase: 'finalize' };
        }
        if (finalized.kind !== 'finalized' && finalized.kind !== 'replayed') {
          return failOwnedPlan(`finalize_${finalized.kind}`, stage.stageKey);
        }
        if (executed.payload.errorCode === 'model_policy_violation') {
          return failOwnedPlan('model_policy_violation', stage.stageKey);
        }
        const errorCode = stageFailed
          ? validation.kind === 'invalid'
            ? validation.errorCode
            : ((executed.payload.errorCode as string | undefined) ?? 'stage_failed')
          : undefined;
        const outcome: StageOutcomeRecord = {
          stageKey: stage.stageKey,
          status: stageFailed ? 'failed' : 'succeeded',
          parseFailed,
          judgeVerdictFailed:
            validation.kind === 'invalid' && validation.errorCode === 'judge_verdict_failed',
          ...(errorCode === undefined ? {} : { errorCode }),
        };
        outcomes.push(outcome);
        if (!stageFailed) {
          const parsedOutput = executed.payload.output ?? executed.payload.value;
          if (
            typeof parsedOutput !== 'object' ||
            parsedOutput === null ||
            Array.isArray(parsedOutput)
          ) {
            return failOwnedPlan('successful_stage_output_missing', stage.stageKey);
          }
          stageOutputs[stage.stageKey] = parsedOutput as JsonObject;
        }
      }
    },
  };
}

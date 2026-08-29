import type { JobLeaseIdentity, JsonObject } from '../ports/types.js';
import type { JobService } from '../jobs/job-service.js';
import type { WorkflowInvocationService } from '../workflows/workflow-invocation-service.js';
import type { ExecutorOutcome, ValidatorOutcome } from '../workflows/three-phase-attempt.js';
import { ai } from '@narraza/core';
const { decideNextAction } = ai;
type WorkflowPlanStage = ai.WorkflowPlanStage;
type StageOutcomeRecord = ai.StageOutcomeRecord;
import { ORPHAN_ATTEMPT_ERROR_CODE } from './attempt-recovery-port.js';

/** UoW-backed recovery service (see createAttemptRecoveryService). */
interface AttemptRecoveryService {
  closeOrphanedStartedAttempts(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly errorCode: string;
  }): Promise<{ readonly closed: number }>;
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
  readonly structuredOutput: boolean;
  readonly timeoutMs: number;
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
    'stage' | 'providerId' | 'requestedModelId' | 'structuredOutput' | 'timeoutMs' | 'dataClass'
  >;
  /** Optional CPU parse gate; a parse failure triggers `on_parse_failure` stages. */
  readonly parseGate?: (
    stage: WorkflowPlanStage,
    outcome: Extract<ExecutorOutcome, { kind: 'billable' }>,
  ) => { readonly parseFailed: boolean };
  /** Fenced publish callback for the final stage (writes product rows). */
  readonly publish: (context: {
    readonly appendSentinel: (input: {
      readonly aggregateType: string;
      readonly aggregateId: string;
      readonly eventType: string;
      readonly dedupeKey: string;
      readonly schemaVersion?: number;
      readonly payload: JsonObject;
    }) => Promise<void>;
  }) => Promise<void>;
}

export type RunPlanResult =
  | { readonly kind: 'published'; readonly stageOutcomes: readonly StageOutcomeRecord[] }
  | { readonly kind: 'recoverable'; readonly errorCode: string; readonly stageKey: string }
  | { readonly kind: 'plan_failed'; readonly errorCode: string; readonly stageKey: string }
  | { readonly kind: 'publish_denied'; readonly outcome: string };

/** Deterministic invocation identity: one invocation per (job, stage). */
function invocationIdFor(jobId: string, stageKey: string): string {
  return `wf-inv:${jobId}:${stageKey}`;
}

function newAttemptId(jobId: string, stageKey: string, allocate: () => string): string {
  return `wf-att:${jobId}:${stageKey}:${allocate()}`;
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

      // Recovery first (PM Decision 2): any `started` attempt in this job was
      // left by a dead worker — close it durably before anything new runs.
      // Abandoned attempts keep counting against the stage invocation cap.
      const outcomes: StageOutcomeRecord[] = [];
      const attemptsByStage: Record<string, number> = {};
      if (deps.attemptRecovery) {
        await deps.attemptRecovery.closeOrphanedStartedAttempts({
          projectId: identity.projectId,
          jobId: identity.jobId,
          errorCode: ORPHAN_ATTEMPT_ERROR_CODE,
        });
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
          const published = await deps.jobs.withFencedPublish(identity, input.publish);
          if (published.kind === 'published') {
            return { kind: 'published', stageOutcomes: outcomes };
          }
          return { kind: 'publish_denied', outcome: published.kind };
        }
        if (next.kind === 'terminal_failed') {
          // We still own the lease here (the stage machine never began a new
          // attempt after the terminal decision), so failing the job is ours.
          await deps.jobs.finish({ ...identity, status: 'failed' });
          return {
            kind: 'plan_failed',
            errorCode: next.errorCode,
            stageKey: next.stageKey,
          };
        }

        const stage = next.stage;
        const profile = stage.routing[0]!;

        const invocationId = invocationIdFor(identity.jobId, stage.stageKey);
        const attemptId = newAttemptId(identity.jobId, stage.stageKey, allocate);

        // Tx A: begin (own transaction, commits before the provider call).
        const begun = await deps.workflow.beginAttempt({
          ...identity,
          invocationId,
          attemptId,
          stageKey: stage.stageKey,
          schemaVersion: 1,
          payload: { providerId: profile.providerId, requestedModelId: profile.requestedModelId },
        });
        if (begun.kind !== 'started') {
          // We no longer own the job (stale lease, cancellation requested,
          // tombstone): do NOT finish-fail it — the legitimate owner or the
          // reclaim sweeper decides its fate. M3 refuses new attempts on a
          // cancel-requested job, which surfaces here.
          return {
            kind: 'plan_failed',
            errorCode: `begin_denied:${begun.kind}`,
            stageKey: stage.stageKey,
          };
        }

        // Provider call OUTSIDE any transaction.
        let executed: ExecutorOutcome;
        try {
          executed = await deps.executeStage({
            stage,
            providerId: profile.providerId,
            requestedModelId: profile.requestedModelId,
            structuredOutput: profile.structuredOutput,
            timeoutMs: profile.timeoutMs,
            dataClass: stage.dataClass,
            ...input.buildStageRequest(stage, 0),
          });
        } catch (error) {
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

        // Tx B: finalize + usage inside the M3 service transaction.
        const finalized = await deps.workflow.finalizeAttempt({
          ...identity,
          invocationId,
          attemptId,
          status: executed.status,
          providerRequestId: executed.providerRequestId,
          resultHash: executed.resultHash,
          schemaVersion: executed.schemaVersion,
          payload: executed.payload,
          usage: executed.usage,
        });
        if (finalized.kind !== 'finalized' && finalized.kind !== 'replayed') {
          return {
            kind: 'plan_failed',
            errorCode: `finalize_${finalized.kind}`,
            stageKey: stage.stageKey,
          };
        }

        // CPU validation outside any transaction. A structured-output stage
        // whose body failed strict parsing is flagged either by the injected
        // gate or by the executor adapter's `parseFailed` payload marker.
        const parseFailed =
          executed.status === 'succeeded' &&
          (input.parseGate
            ? input.parseGate(stage, executed).parseFailed
            : executed.payload.parseFailed === true);
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
      }
    },
  };
}

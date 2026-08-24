import type { JobService, FencedPublishResult } from '../jobs/job-service.js';
import type { UsageMetrics } from '../ports/ai-usage-port.js';
import type {
  BeginAttemptInput,
  FinalizableAttemptStatus,
  FinalizeAttemptResult,
} from '../ports/workflow-invocation-port.js';
import type { JsonObject } from '../ports/types.js';
import type { WorkflowInvocationService } from './workflow-invocation-service.js';

export type ExecutorOutcome =
  | {
      readonly kind: 'billable';
      readonly status: FinalizableAttemptStatus;
      readonly providerRequestId: string | null;
      readonly resultHash: string | null;
      readonly schemaVersion: number;
      readonly payload: JsonObject;
      readonly usage: UsageMetrics;
    }
  | {
      readonly kind: 'recoverable_no_response';
      readonly reason: 'rejected' | 'aborted' | 'threw';
      readonly errorCode: string;
    };

export type ValidatorOutcome =
  { readonly kind: 'valid' } | { readonly kind: 'invalid'; readonly errorCode: string };

export type ThreePhaseEvent =
  | 'tx-a:begin'
  | 'tx-a:commit'
  | 'executor:begin'
  | 'executor:end'
  | 'tx-b:begin'
  | 'tx-b:commit'
  | 'validator:begin'
  | 'validator:end'
  | 'tx-c:begin'
  | 'sentinel:append'
  | 'job:terminalize'
  | 'tx-c:commit';

export type ThreePhaseAttemptResult =
  | { readonly kind: 'already_started' }
  | { readonly kind: 'begin_denied'; readonly outcome: 'conflict' | 'not_authorized' }
  | Extract<ExecutorOutcome, { readonly kind: 'recoverable_no_response' }>
  | {
      readonly kind: 'finalize_denied';
      readonly outcome: 'conflict' | 'not_authorized' | 'reconciliation_conflict';
    }
  | {
      readonly kind: 'finalized_without_publish';
      readonly winner: Extract<
        FinalizeAttemptResult,
        { readonly kind: 'finalized' | 'replayed' }
      >['winner'];
    }
  | { readonly kind: 'validation_failed'; readonly errorCode: string }
  | ({ readonly kind: 'published' } & Pick<
      Extract<FencedPublishResult, { readonly kind: 'published' }>,
      'job'
    >)
  | {
      readonly kind: 'publish_denied';
      readonly outcome: Exclude<FencedPublishResult['kind'], 'published'>;
    };

export interface ThreePhaseAttemptDependencies {
  readonly workflow: WorkflowInvocationService;
  readonly jobs: JobService;
  readonly executor: (input: BeginAttemptInput) => Promise<ExecutorOutcome>;
  readonly validator: (
    outcome: Extract<ExecutorOutcome, { readonly kind: 'billable' }>,
  ) => Promise<ValidatorOutcome>;
  readonly instrument?: (event: ThreePhaseEvent) => void;
}

export interface ThreePhaseAttemptHarness {
  run(input: BeginAttemptInput): Promise<ThreePhaseAttemptResult>;
}

export function createThreePhaseAttemptHarness(
  deps: ThreePhaseAttemptDependencies,
): ThreePhaseAttemptHarness {
  const emit = (event: ThreePhaseEvent) => deps.instrument?.(event);
  return {
    async run(input) {
      emit('tx-a:begin');
      const begun = await deps.workflow.beginAttempt(input);
      emit('tx-a:commit');
      if (begun.kind === 'already_started') return { kind: 'already_started' };
      if (begun.kind !== 'started') return { kind: 'begin_denied', outcome: begun.kind };

      let executed: ExecutorOutcome;
      emit('executor:begin');
      try {
        executed = await deps.executor(input);
      } catch (error) {
        emit('executor:end');
        const aborted = error instanceof Error && error.name === 'AbortError';
        return {
          kind: 'recoverable_no_response',
          reason: aborted ? 'aborted' : 'threw',
          errorCode: aborted ? 'aborted' : 'executor_threw',
        };
      }
      emit('executor:end');
      if (executed.kind === 'recoverable_no_response') return executed;

      emit('tx-b:begin');
      const finalized = await deps.workflow.finalizeAttempt({
        projectId: input.projectId,
        jobId: input.jobId,
        leaseToken: input.leaseToken,
        fenceVersion: input.fenceVersion,
        invocationId: input.invocationId,
        attemptId: input.attemptId,
        status: executed.status,
        providerRequestId: executed.providerRequestId,
        resultHash: executed.resultHash,
        schemaVersion: executed.schemaVersion,
        payload: executed.payload,
        usage: executed.usage,
      });
      emit('tx-b:commit');
      if (
        finalized.kind === 'conflict' ||
        finalized.kind === 'not_authorized' ||
        finalized.kind === 'reconciliation_conflict'
      )
        return { kind: 'finalize_denied', outcome: finalized.kind };
      if (finalized.kind !== 'finalized' || finalized.winner !== 'selected')
        return { kind: 'finalized_without_publish', winner: finalized.winner };

      emit('validator:begin');
      const validation = await deps.validator(executed);
      emit('validator:end');
      if (validation.kind === 'invalid')
        return { kind: 'validation_failed', errorCode: validation.errorCode };

      emit('tx-c:begin');
      const published = await deps.jobs.withFencedPublish(input, async (context) => {
        emit('sentinel:append');
        await context.appendSentinel({
          aggregateType: 'workflow_invocation',
          aggregateId: input.invocationId,
          eventType: 'workflow_attempt_validated',
          dedupeKey: `workflow-attempt-validated:${input.invocationId}:${input.attemptId}`,
          schemaVersion: 1,
          payload: {
            projectId: input.projectId,
            jobId: input.jobId,
            invocationId: input.invocationId,
            attemptId: input.attemptId,
            stageKey: input.stageKey,
            resultHash: executed.resultHash,
          },
        });
        emit('job:terminalize');
      });
      emit('tx-c:commit');
      return published.kind === 'published'
        ? { kind: 'published', job: published.job }
        : { kind: 'publish_denied', outcome: published.kind };
    },
  };
}

import type { AiWorkflowPlanSpec, WorkflowPlanStage } from './workflow-plan.js';
import { validateWorkflowPlanSpec } from './workflow-plan.js';

/**
 * Stage progression policy for the Block C attempt orchestrator (S5.1
 * `decideNextAction`). Pure over the frozen plan and the recorded stage
 * outcomes — the orchestrator owns persistence; this file owns the decision.
 *
 * Conditional stages run exactly when their run policy is triggered by the
 * immediately preceding executed stage:
 *   - `on_parse_failure`: the previous stage produced unparseable output;
 *   - `on_judge_fail`: the previous judge stage failed its verdict;
 *   - `on_repairable_failure`: the previous stage failed with a repairable
 *     error code.
 * A conditional stage never runs twice in a row on the same trigger.
 */

export interface StageOutcomeRecord {
  readonly stageKey: string;
  readonly status: 'succeeded' | 'failed';
  readonly parseFailed?: boolean;
  readonly judgeVerdictFailed?: boolean;
  readonly errorCode?: string;
}

export type DecideNextActionOutcome =
  | { readonly kind: 'run_stage'; readonly stage: WorkflowPlanStage }
  | { readonly kind: 'plan_complete'; readonly lastStageKey: string }
  | { readonly kind: 'terminal_failed'; readonly errorCode: string; readonly stageKey: string };

/** Repairable error codes a repair stage may answer. */
const REPAIRABLE = new Set([
  'provider_timeout',
  'provider_unavailable',
  'context_length',
  'generation_quality',
] as const);

function previousOutcome(
  stages: readonly WorkflowPlanStage[],
  index: number,
  outcomes: readonly StageOutcomeRecord[],
): StageOutcomeRecord | undefined {
  // The triggering stage is the nearest preceding stage in plan order that has
  // an outcome (skipping already-run conditional stages).
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const found = outcomes.find((outcome) => outcome.stageKey === stages[cursor]!.stageKey);
    if (found) return found;
  }
  return undefined;
}

function stageExhausted(
  stage: WorkflowPlanStage,
  attemptsByStage: Readonly<Record<string, number>>,
): boolean {
  const used = attemptsByStage[stage.stageKey] ?? 0;
  const capacity = stage.routing.reduce((sum, profile) => sum + profile.maxInvocations, 0);
  return used >= capacity;
}

export function decideNextAction(
  spec: AiWorkflowPlanSpec,
  outcomes: readonly StageOutcomeRecord[],
  attemptsByStage: Readonly<Record<string, number>>,
): DecideNextActionOutcome {
  validateWorkflowPlanSpec(spec);

  const ordered = spec.stages;
  const outcomeOf = (stageKey: string): StageOutcomeRecord | undefined =>
    outcomes.find((record) => record.stageKey === stageKey);

  const triggersFor = (stage: WorkflowPlanStage, index: number): boolean => {
    const trigger = previousOutcome(ordered, index, outcomes);
    if (!trigger) return false;
    return (
      (stage.runPolicy === 'on_parse_failure' && trigger.parseFailed === true) ||
      (stage.runPolicy === 'on_judge_fail' && trigger.judgeVerdictFailed === true) ||
      (stage.runPolicy === 'on_repairable_failure' &&
        trigger.status === 'failed' &&
        trigger.errorCode !== undefined &&
        REPAIRABLE.has(trigger.errorCode as 'provider_timeout'))
    );
  };

  // Walk the plan in order; the first runnable, not-yet-executed stage wins.
  for (let index = 0; index < ordered.length; index += 1) {
    const stage = ordered[index]!;
    const outcome = outcomeOf(stage.stageKey);

    if (stage.runPolicy === 'always') {
      if (outcome) continue; // executed: failure handling happens below
      // A failed execution blocks further always-stages unless it triggers a
      // still-pending conditional repair later in the plan.
      const lastExecuted = outcomes[outcomes.length - 1];
      if (lastExecuted && lastExecuted.status === 'failed') {
        const failedIndex = ordered.findIndex((row) => row.stageKey === lastExecuted.stageKey);
        const hasPendingTrigger = ordered.some(
          (later, laterIndex) =>
            laterIndex > failedIndex &&
            later.runPolicy !== 'always' &&
            !outcomeOf(later.stageKey) &&
            triggersFor(later, laterIndex),
        );
        if (!hasPendingTrigger) {
          return {
            kind: 'terminal_failed',
            errorCode: lastExecuted.errorCode ?? 'stage_failed',
            stageKey: lastExecuted.stageKey,
          };
        }
      }
      if (stageExhausted(stage, attemptsByStage)) {
        return {
          kind: 'terminal_failed',
          errorCode: 'invocations_exhausted',
          stageKey: stage.stageKey,
        };
      }
      return { kind: 'run_stage', stage };
    }

    // Conditional stage: only reachable while its trigger outcome exists.
    if (outcome) continue;
    if (!triggersFor(stage, index)) continue;
    if (stageExhausted(stage, attemptsByStage)) {
      return {
        kind: 'terminal_failed',
        errorCode: 'invocations_exhausted',
        stageKey: stage.stageKey,
      };
    }
    return { kind: 'run_stage', stage };
  }

  // Nothing left to run: the plan completes when its FINAL stage succeeded —
  // an earlier failure that a repair stage already answered does not poison
  // the plan — otherwise it terminates on the most recent failure.
  const last = ordered[ordered.length - 1]!;
  const lastOutcome = outcomeOf(last.stageKey);
  const mostRecent = outcomes[outcomes.length - 1];
  if (
    (lastOutcome && lastOutcome.status === 'succeeded') ||
    (last.runPolicy !== 'always' && mostRecent?.status === 'succeeded')
  ) {
    return { kind: 'plan_complete', lastStageKey: mostRecent?.stageKey ?? last.stageKey };
  }
  const failures = outcomes.filter((record) => record.status === 'failed');
  const lastFailure = failures[failures.length - 1];
  if (lastFailure) {
    return {
      kind: 'terminal_failed',
      errorCode: lastFailure.errorCode ?? 'stage_failed',
      stageKey: lastFailure.stageKey,
    };
  }
  return { kind: 'terminal_failed', errorCode: 'plan_incomplete', stageKey: last.stageKey };
}

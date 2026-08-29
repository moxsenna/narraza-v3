import { describe, expect, it } from 'vitest';
import {
  decideNextAction,
  type AiWorkflowPlanSpec,
  type StageOutcomeRecord,
} from './next-action.js';
import type { AiWorkflowPlanSpec as Spec } from './workflow-plan.js';

/**
 * M4 Block C stage-progression policy — pure unit. Conditional repair stages
 * run only on their trigger, invocation caps terminate the plan, and a
 * plan is complete only when its final stage succeeded.
 */

const PLAN: Spec = {
  schemaVersion: 1,
  workflowKind: 'beat_write_judge',
  stages: [
    {
      stageKey: 'writer',
      purpose: 'generate',
      packetKind: 'writer',
      dataClass: 'writer_safe',
      runPolicy: 'always',
      routing: [
        {
          providerId: 'mock',
          requestedModelId: 'mock/narra-writer-v1',
          resolvedModelId: 'mock/narra-writer-v1',
          structuredOutput: true,
          timeoutMs: 1_000,
          maxInputTokens: 100,
          maxOutputTokens: 100,
          priceSnapshotId: 'price-a',
          maxInvocations: 2,
        },
      ],
    },
    {
      stageKey: 'parse_repair',
      purpose: 'parse_repair',
      packetKind: 'writer',
      dataClass: 'writer_safe',
      runPolicy: 'on_parse_failure',
      routing: [
        {
          providerId: 'mock',
          requestedModelId: 'mock/narra-writer-v1',
          resolvedModelId: 'mock/narra-writer-v1',
          structuredOutput: true,
          timeoutMs: 1_000,
          maxInputTokens: 100,
          maxOutputTokens: 100,
          priceSnapshotId: 'price-a',
          maxInvocations: 1,
        },
      ],
    },
    {
      stageKey: 'judge',
      purpose: 'judge',
      packetKind: 'validator',
      dataClass: 'author_private',
      runPolicy: 'always',
      routing: [
        {
          providerId: 'mock',
          requestedModelId: 'mock/narra-judge-v1',
          resolvedModelId: 'mock/narra-judge-v1',
          structuredOutput: true,
          timeoutMs: 1_000,
          maxInputTokens: 100,
          maxOutputTokens: 100,
          priceSnapshotId: 'price-a',
          maxInvocations: 1,
        },
      ],
    },
  ],
};

describe('decideNextAction', () => {
  it('runs always-stages in order and completes after the last success', () => {
    const first = decideNextAction(PLAN, [], {});
    expect(first).toMatchObject({ kind: 'run_stage', stage: { stageKey: 'writer' } });

    const writerOk: StageOutcomeRecord = { stageKey: 'writer', status: 'succeeded' };
    const second = decideNextAction(PLAN, [writerOk], { writer: 1 });
    expect(second).toMatchObject({ kind: 'run_stage', stage: { stageKey: 'judge' } });

    const judgeOk: StageOutcomeRecord = { stageKey: 'judge', status: 'succeeded' };
    const done = decideNextAction(PLAN, [writerOk, judgeOk], { writer: 1, judge: 1 });
    expect(done).toMatchObject({ kind: 'plan_complete', lastStageKey: 'judge' });
  });

  it('routes parse failures into the parse-repair stage', () => {
    const writerParseFailed: StageOutcomeRecord = {
      stageKey: 'writer',
      status: 'failed',
      parseFailed: true,
      errorCode: 'schema_violation',
    };
    const next = decideNextAction(PLAN, [writerParseFailed], { writer: 1 });
    expect(next).toMatchObject({ kind: 'run_stage', stage: { stageKey: 'parse_repair' } });

    const repaired: StageOutcomeRecord = { stageKey: 'parse_repair', status: 'succeeded' };
    const afterRepair = decideNextAction(PLAN, [writerParseFailed, repaired], {
      writer: 1,
      parse_repair: 1,
    });
    expect(afterRepair).toMatchObject({ kind: 'run_stage', stage: { stageKey: 'judge' } });
  });

  it('terminates when a repair stage is exhausted or fails', () => {
    const writerParseFailed: StageOutcomeRecord = {
      stageKey: 'writer',
      status: 'failed',
      parseFailed: true,
      errorCode: 'schema_violation',
    };
    // parse_repair capacity is 1 and it was already consumed by an earlier run.
    const exhausted = decideNextAction(PLAN, [writerParseFailed], { writer: 1, parse_repair: 1 });
    expect(exhausted).toMatchObject({
      kind: 'terminal_failed',
      errorCode: 'invocations_exhausted',
      stageKey: 'parse_repair',
    });

    const repairFailed: StageOutcomeRecord = {
      stageKey: 'parse_repair',
      status: 'failed',
      errorCode: 'schema_violation',
    };
    const failedRepair = decideNextAction(PLAN, [writerParseFailed, repairFailed], {
      writer: 1,
      parse_repair: 1,
    });
    expect(failedRepair).toMatchObject({ kind: 'terminal_failed', stageKey: 'parse_repair' });
  });

  it('terminates an always-stage whose invocation cap is consumed', () => {
    const exhausted = decideNextAction(PLAN, [], { writer: 2 });
    expect(exhausted).toMatchObject({
      kind: 'terminal_failed',
      errorCode: 'invocations_exhausted',
      stageKey: 'writer',
    });
  });

  it('fails the plan when an always-stage fails without a repair trigger', () => {
    const judgeFailed: StageOutcomeRecord = {
      stageKey: 'judge',
      status: 'failed',
      errorCode: 'generation_quality',
    };
    const outcome = decideNextAction(
      PLAN,
      [{ stageKey: 'writer', status: 'succeeded' }, judgeFailed],
      { writer: 1, judge: 1 },
    );
    expect(outcome).toMatchObject({
      kind: 'terminal_failed',
      errorCode: 'generation_quality',
      stageKey: 'judge',
    });
  });
});

// Type-level guard: the plan spec type is shared with the frozen plan domain.
type _Same = AiWorkflowPlanSpec extends Spec ? true : false;

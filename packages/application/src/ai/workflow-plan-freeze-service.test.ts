import { describe, expect, it } from 'vitest';
import { buildWorkflowPlan } from './workflow-plan-freeze-service.js';

const profile = {
  providerId: 'mock',
  requestedModelId: 'mock/model',
  resolvedModelId: 'mock/model',
  structuredOutput: true,
  timeoutMs: 1_000,
  maxInputTokens: 100,
  maxOutputTokens: 100,
  priceSnapshotId: 'price-1',
  maxInvocations: 4,
} as const;
const priceSnapshots = [
  {
    id: 'price-1',
    providerId: 'mock',
    requestedModelId: 'mock/model',
    resolvedModelId: 'mock/model',
    inputRateMicroIdr: 1n,
    outputRateMicroIdr: 1n,
  },
];

describe('M4 workflow hard stage caps', () => {
  it('caps parse-repair, judge, and judge-repair at one invocation', () => {
    const built = buildWorkflowPlan({
      projectId: 'project-1',
      workflowKind: 'beat_write_judge',
      profile,
      priceSnapshots,
    });
    expect(built.kind).toBe('built');
    if (built.kind !== 'built') throw new Error('expected built plan');

    const caps = Object.fromEntries(
      built.plan.spec.stages.map((stage) => [stage.stageKey, stage.routing[0]!.maxInvocations]),
    );
    expect(caps).toEqual({
      writer: 4,
      writer_parse_repair: 1,
      judge: 1,
      judge_parse_repair: 1,
      judge_repair: 1,
    });
  });
});

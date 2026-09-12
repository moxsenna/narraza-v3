import { expect } from 'vitest';
import { describe, it } from 'vitest';
import {
  canonicalPlanHash,
  worstCaseBudgetMicroIdr,
  WorkflowPlanError,
  type AiWorkflowPlanSpec,
  type PriceSnapshotLike,
} from './workflow-plan.js';

/**
 * M4 Block B `plan-budget-worst-case` — pure unit.
 *
 * The plan hash is canonical: key order cannot change it, stage order is
 * material. The worst-case budget is the exact ceiling over every routing
 * candidate's token ceilings priced at its immutable snapshot, times the
 * invocation cap.
 */

const PRICE_A: PriceSnapshotLike = {
  id: 'price-a',
  inputRateMicroIdr: 20n,
  outputRateMicroIdr: 60n,
};
const PRICE_B: PriceSnapshotLike = {
  id: 'price-b',
  inputRateMicroIdr: 10n,
  outputRateMicroIdr: 30n,
};

const BASE_SPEC: AiWorkflowPlanSpec = {
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
          timeoutMs: 30_000,
          maxInputTokens: 500,
          maxOutputTokens: 200,
          priceSnapshotId: 'price-a',
          maxInvocations: 2,
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
          timeoutMs: 20_000,
          maxInputTokens: 400,
          maxOutputTokens: 100,
          priceSnapshotId: 'price-b',
          maxInvocations: 1,
        },
      ],
    },
  ],
};

describe('plan-budget-worst-case', () => {
  it('computes the exact ceiling over stages, routing and invocation caps', () => {
    // writer: (500*20 + 200*60) = 22_000 per call x 2 invocations = 44_000
    // judge:  (400*10 + 100*30) = 19_000 per call x 1 invocation  = 19_000
    expect(worstCaseBudgetMicroIdr(BASE_SPEC, [PRICE_A, PRICE_B])).toBe(51_000n);
  });

  it('charges every routing candidate, not only the primary', () => {
    const withFallback: AiWorkflowPlanSpec = {
      ...BASE_SPEC,
      stages: [
        {
          ...BASE_SPEC.stages[0]!,
          routing: [
            ...BASE_SPEC.stages[0]!.routing,
            {
              providerId: 'mock',
              requestedModelId: 'mock/narra-writer-v1',
              resolvedModelId: 'mock/narra-writer-v1',
              structuredOutput: false,
              timeoutMs: 10_000,
              maxInputTokens: 100,
              maxOutputTokens: 100,
              priceSnapshotId: 'price-b',
              maxInvocations: 1,
            },
          ],
        },
        BASE_SPEC.stages[1]!,
      ],
    };
    // extra candidate: (100*10 + 100*30) = 4_000
    expect(worstCaseBudgetMicroIdr(withFallback, [PRICE_A, PRICE_B])).toBe(55_000n);
  });

  it('fails closed on an unknown price snapshot and negative rates', () => {
    expect(() => worstCaseBudgetMicroIdr(BASE_SPEC, [PRICE_A])).toThrow(WorkflowPlanError);
    expect(() =>
      worstCaseBudgetMicroIdr(BASE_SPEC, [
        { id: 'price-a', inputRateMicroIdr: -1n, outputRateMicroIdr: 1n },
        PRICE_B,
      ]),
    ).toThrow(WorkflowPlanError);
  });
});

describe('canonicalPlanHash', () => {
  it('is stable under object key reorder and identical across replays', () => {
    const reordered: AiWorkflowPlanSpec = {
      stages: [
        {
          routing: [
            {
              structuredOutput: true,
              maxOutputTokens: 200,
              maxInputTokens: 500,
              timeoutMs: 30_000,
              resolvedModelId: 'mock/narra-writer-v1',
              requestedModelId: 'mock/narra-writer-v1',
              providerId: 'mock',
              priceSnapshotId: 'price-a',
              maxInvocations: 2,
            },
          ],
          runPolicy: 'always',
          dataClass: 'writer_safe',
          packetKind: 'writer',
          purpose: 'generate',
          stageKey: 'writer',
        },
        BASE_SPEC.stages[1]!,
      ],
      workflowKind: 'beat_write_judge',
      schemaVersion: 1,
    };
    const hashInput = (spec: AiWorkflowPlanSpec) => ({
      spec,
      input: { dependencyHash: 'd'.repeat(64), bundleHash: 'b'.repeat(64) },
    });
    expect(canonicalPlanHash(hashInput(reordered))).toBe(canonicalPlanHash(hashInput(BASE_SPEC)));
    expect(canonicalPlanHash(hashInput(BASE_SPEC))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when routing, budget-relevant or stage material changes', () => {
    const profileChange: AiWorkflowPlanSpec = {
      ...BASE_SPEC,
      stages: [
        {
          ...BASE_SPEC.stages[0]!,
          routing: [{ ...BASE_SPEC.stages[0]!.routing[0]!, timeoutMs: 31_000 }],
        },
        BASE_SPEC.stages[1]!,
      ],
    };
    const stageOrderChange: AiWorkflowPlanSpec = {
      ...BASE_SPEC,
      stages: [BASE_SPEC.stages[1]!, BASE_SPEC.stages[0]!],
    };
    const plain = (spec: AiWorkflowPlanSpec) => ({
      spec,
      input: { dependencyHash: 'd'.repeat(64), bundleHash: 'b'.repeat(64) },
    });
    expect(canonicalPlanHash(plain(profileChange))).not.toBe(canonicalPlanHash(plain(BASE_SPEC)));
    expect(canonicalPlanHash(plain(stageOrderChange))).not.toBe(
      canonicalPlanHash(plain(BASE_SPEC)),
    );
  });

  it('fails closed on unknown purposes, duplicate stage keys and empty routing', () => {
    const hashInput = (spec: AiWorkflowPlanSpec) => ({
      spec,
      input: { dependencyHash: 'd'.repeat(64), bundleHash: 'b'.repeat(64) },
    });
    const bad = {
      ...BASE_SPEC,
      stages: [
        {
          ...BASE_SPEC.stages[0]!,
          purpose: 'vibes' as unknown as AiWorkflowPlanSpec['stages'][number]['purpose'],
        },
      ],
    };
    expect(() => canonicalPlanHash(hashInput(bad as AiWorkflowPlanSpec))).toThrow(
      WorkflowPlanError,
    );
    expect(() =>
      canonicalPlanHash(
        hashInput({ ...BASE_SPEC, stages: [BASE_SPEC.stages[0]!, BASE_SPEC.stages[0]!] }),
      ),
    ).toThrow(WorkflowPlanError);
    expect(() =>
      canonicalPlanHash(
        hashInput({ ...BASE_SPEC, stages: [{ ...BASE_SPEC.stages[0]!, routing: [] }] }),
      ),
    ).toThrow(WorkflowPlanError);
  });
});

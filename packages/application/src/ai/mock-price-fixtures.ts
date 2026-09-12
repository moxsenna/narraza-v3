import type { ModelPriceSnapshotSeedInput } from './model-price-port.js';

/**
 * The single authoritative mock/dev pricing fixture (PM Decision 4, frozen).
 *
 * These rates are deterministic test/dev pricing for the deterministic mock
 * provider only. They claim NO real provider pricing: M7 owns calibration
 * against real price snapshots. Every seeded row is immutable, non-zero, and
 * explicitly marked as mock pricing in its payload. Tests must consume this
 * fixture — never restate rates locally.
 */

export const MOCK_PRICE_SNAPSHOT_ID = 'price-snapshot-mock-v1' as const;
export const MOCK_PROVIDER_ID = 'mock' as const;
export const MOCK_WRITER_MODEL_ID = 'mock/narra-writer-v1' as const;
export const MOCK_JUDGE_MODEL_ID = 'mock/narra-judge-v1' as const;

/** micro-IDR per token, frozen fixture values. */
const MOCK_INPUT_RATE_MICRO_IDR = 20n;
const MOCK_OUTPUT_RATE_MICRO_IDR = 60n;

const MOCK_PRICING_MARKER = Object.freeze({
  pricing: 'mock-deterministic',
  note: 'Fixture pricing for dev/test/CI only. Real pricing calibration is owned by M7 (D6/D14). Never use as a real provider price claim.',
} as const);

/** Fixed epoch so the seeded row is byte-stable across environments. */
export const MOCK_PRICE_EFFECTIVE_AT = new Date('2026-01-01T00:00:00.000Z');

function mockSnapshot(id: string, requestedModelId: string): ModelPriceSnapshotSeedInput {
  return {
    id,
    providerId: MOCK_PROVIDER_ID,
    requestedModelId,
    resolvedModelId: requestedModelId,
    inputRateMicroIdr: MOCK_INPUT_RATE_MICRO_IDR,
    outputRateMicroIdr: MOCK_OUTPUT_RATE_MICRO_IDR,
    currency: 'IDR',
    effectiveAt: MOCK_PRICE_EFFECTIVE_AT,
    payload: { marker: MOCK_PRICING_MARKER },
  };
}

/**
 * Frozen seed list. One entry per mock model the M4 plans may route to.
 * Extend ONLY with new mock models; real providers must never appear here.
 */
export const MOCK_PRICE_SNAPSHOT_FIXTURES: readonly ModelPriceSnapshotSeedInput[] = Object.freeze([
  mockSnapshot(`${MOCK_PRICE_SNAPSHOT_ID}-writer`, MOCK_WRITER_MODEL_ID),
  mockSnapshot(`${MOCK_PRICE_SNAPSHOT_ID}-judge`, MOCK_JUDGE_MODEL_ID),
]);

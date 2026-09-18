import {
  MOCK_PRICE_SNAPSHOT_FIXTURES,
  MOCK_PRICE_SNAPSHOT_ID,
  MOCK_PROVIDER_ID,
  MOCK_WRITER_MODEL_ID,
} from '@narraza/application';

/**
 * Shared mock paid-execution profile (dev/CI/E2E only, never production).
 * Sync by nature and imported by client-reachable graphs, so it lives
 * outside 'use server' modules — Next.js allows only async exports there.
 */
export const CONCEPT_GENERATION_JOB_KIND = 'concept_generation';
export const BEAT_WRITE_JOB_KIND = 'beat_write_judge';
export const REPAIR_JOB_KIND = 'safe_repair';
export const PUBLISH_JOB_KIND = 'publish_package';
export const MOCK_PAID_PROFILE = {
  providerId: MOCK_PROVIDER_ID,
  requestedModelId: MOCK_WRITER_MODEL_ID,
  resolvedModelId: MOCK_WRITER_MODEL_ID,
  structuredOutput: true,
  timeoutMs: 30_000,
  maxInputTokens: 4_000,
  maxOutputTokens: 1_000,
  priceSnapshotId: `${MOCK_PRICE_SNAPSHOT_ID}-writer`,
  maxInvocations: 2,
} as const;

export function mockPriceSnapshots() {
  return MOCK_PRICE_SNAPSHOT_FIXTURES.map((fixture) => ({
    id: fixture.id,
    inputRateMicroIdr: fixture.inputRateMicroIdr,
    outputRateMicroIdr: fixture.outputRateMicroIdr,
  }));
}

export function mockProfileAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

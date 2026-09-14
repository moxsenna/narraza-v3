import { NINE_ROUTER_PRICE_SNAPSHOT_ID } from './nine-router-price-fixtures.js';

/**
 * Production routing profile for nine-router (R1 sell-ready). Frozen into
 * every real plan built outside the M4 mock harness: same ceilings as the
 * certification profile, real provider/model/snapshot binding.
 */
export const NINE_ROUTER_PRODUCTION_PROFILE = {
  providerId: 'nine-router',
  requestedModelId: 'gweb/gemini-3.8-flash',
  resolvedModelId: 'gweb/gemini-3.8-flash',
  structuredOutput: true,
  // Real gateway round-trips get a wider attempt budget than the harness.
  timeoutMs: 60_000,
  maxInputTokens: 4_000,
  maxOutputTokens: 1_000,
  priceSnapshotId: NINE_ROUTER_PRICE_SNAPSHOT_ID,
  maxInvocations: 2,
} as const;

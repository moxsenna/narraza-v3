import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ModelPriceSnapshotSeedInput } from './model-price-port.js';

/**
 * Nine-router production pricing (D6/D14, M7 calibration track).
 *
 * Owner-supplied rate card 2026-09-14 for `gweb/gemini-3.8-flash`:
 * USD 0.75 / 1M input tokens, USD 3.75 / 1M output tokens, converted at a
 * conservative Rp17.700/USD (BI jual Rp17.699, 2026-09-14; rounded UP so
 * quotes never underestimate cost). Per-token micro-IDR, exact integers:
 * input 0.75*17700 = 13275, output 3.75*17700 = 66375.
 *
 * PROVISIONAL: M7 recalibrates against measured provider invoices
 * (>=95% quote>=actual rule, D6). Nothing here claims a locked tariff.
 */

export const NINE_ROUTER_PROVIDER_ID = 'nine-router' as const;
export const NINE_ROUTER_WRITER_MODEL_ID = 'gweb/gemini-3.8-flash' as const;
export const NINE_ROUTER_PRICE_SNAPSHOT_ID =
  'price-snapshot-nine-router-gweb-gemini-3-8-flash-v1' as const;

export const NINE_ROUTER_INPUT_RATE_MICRO_IDR = 13_275n;
export const NINE_ROUTER_OUTPUT_RATE_MICRO_IDR = 66_375n;
export const NINE_ROUTER_PRICE_EFFECTIVE_AT = new Date('2026-09-14T00:00:00.000Z');

const NINE_ROUTER_PRICING_MARKER = Object.freeze({
  pricing: 'nine-router-rate-card',
  usdPer1MInput: 0.75,
  usdPer1MOutput: 3.75,
  usdIdrRate: 17700,
  rateSource: 'BI kurs jual 2026-09-14 (17699.06), rounded up',
  note: 'Provisional owner-supplied rate card. M7 recalibrates against measured invoices (D6).',
} as const);

export const NINE_ROUTER_PRICE_SNAPSHOT_FIXTURE: ModelPriceSnapshotSeedInput = {
  id: NINE_ROUTER_PRICE_SNAPSHOT_ID,
  providerId: NINE_ROUTER_PROVIDER_ID,
  requestedModelId: NINE_ROUTER_WRITER_MODEL_ID,
  resolvedModelId: NINE_ROUTER_WRITER_MODEL_ID,
  inputRateMicroIdr: NINE_ROUTER_INPUT_RATE_MICRO_IDR,
  outputRateMicroIdr: NINE_ROUTER_OUTPUT_RATE_MICRO_IDR,
  currency: 'IDR',
  effectiveAt: NINE_ROUTER_PRICE_EFFECTIVE_AT,
  payload: { ...NINE_ROUTER_PRICING_MARKER },
};

/**
 * Seed the nine-router production snapshot through the authoritative port.
 * Idempotent via seedIfAbsent (immutable rows; a rate change ships a NEW
 * snapshot id, never an update).
 */
export async function seedNineRouterPriceSnapshots(
  unitOfWork: UnitOfWork,
): Promise<{ kind: 'seeded' | 'replayed' }> {
  return unitOfWork.execute(async (ports) => {
    const modelPrice = ports.modelPrice;
    if (!modelPrice) {
      throw new Error('nine-router price seed: modelPrice port not configured');
    }
    const result = await modelPrice.seedIfAbsent(NINE_ROUTER_PRICE_SNAPSHOT_FIXTURE);
    return { kind: result.kind };
  });
}

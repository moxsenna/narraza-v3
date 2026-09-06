import type { UnitOfWork } from '../ports/unit-of-work.js';
import { MOCK_PRICE_SNAPSHOT_FIXTURES } from './mock-price-fixtures.js';

/**
 * Seed the frozen mock/dev price fixtures through the authoritative port.
 *
 * Idempotent: every seed call converges on the same immutable rows, so test
 * setup and future dev bootstrap can call this unconditionally. This is the
 * ONLY sanctioned seeding path — tests must not restate rates locally
 * (PM Decision 4: one fixture source).
 */
export async function seedMockPriceSnapshots(
  unitOfWork: UnitOfWork,
): Promise<{ kind: 'seeded' | 'replayed'; count: number }> {
  return unitOfWork.execute(async (ports) => {
    const modelPrice = ports.modelPrice;
    if (!modelPrice) {
      throw new Error('mock price seed: modelPrice port not configured');
    }
    let seeded = 0;
    for (const fixture of MOCK_PRICE_SNAPSHOT_FIXTURES) {
      const result = await modelPrice.seedIfAbsent(fixture);
      if (result.kind === 'seeded') seeded += 1;
    }
    return { kind: seeded > 0 ? ('seeded' as const) : ('replayed' as const), count: seeded };
  });
}

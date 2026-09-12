import {
  MOCK_PRICE_EFFECTIVE_AT,
  MOCK_PRICE_SNAPSHOT_FIXTURES,
  seedMockPriceSnapshots,
} from '@narraza/application';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

/**
 * M4 Block A `model-price-seed` — real PostgreSQL.
 *
 * One authoritative frozen fixture seeds deterministic, clearly-marked mock
 * pricing. Seeding is idempotent and the rows are immutable: a second seed
 * never duplicates or rewrites, and no row claims real provider pricing.
 */

const schema = createSchemaTestSuite();

schema.test('model-price-seed', async ({ client, databaseUrl }) => {
  const prisma = createPrismaForUrl(databaseUrl);
  const unitOfWork = createUnitOfWork(prisma);

  try {
    const first = await seedMockPriceSnapshots(unitOfWork);
    expect(first.kind).toBe('seeded');
    expect(first.count).toBe(MOCK_PRICE_SNAPSHOT_FIXTURES.length);

    // Replay: seeding again is a no-op, not a duplicate or a rewrite.
    const second = await seedMockPriceSnapshots(unitOfWork);
    expect(second).toEqual({ kind: 'replayed', count: 0 });

    const rows = (
      await client.query(
        `SELECT id, provider_id, requested_model_id, resolved_model_id,
                input_rate_micro_idr, output_rate_micro_idr, currency,
                effective_at, payload, schema_version
           FROM model_price_snapshots
          ORDER BY id`,
      )
    ).rows;
    expect(rows).toHaveLength(MOCK_PRICE_SNAPSHOT_FIXTURES.length);

    for (const fixture of MOCK_PRICE_SNAPSHOT_FIXTURES) {
      const row = rows.find((candidate) => candidate.id === fixture.id);
      expect(row).toBeDefined();
      expect(row.provider_id).toBe('mock');
      expect(row.resolved_model_id).toBe(fixture.resolvedModelId);
      expect(BigInt(row.input_rate_micro_idr) > 0n).toBe(true);
      expect(BigInt(row.output_rate_micro_idr) > 0n).toBe(true);
      expect(row.currency).toBe('IDR');
      expect(new Date(row.effective_at).toISOString()).toBe(MOCK_PRICE_EFFECTIVE_AT.toISOString());
      expect(row.schema_version).toBe(1);
      // Clearly marked as mock/dev pricing; no real provider price claim.
      expect(row.payload).toMatchObject({
        marker: { pricing: 'mock-deterministic' },
      });
    }

    // Immutability through the port: only seed-if-absent and lookup exist;
    // a replay returns byte-identical values.
    const lookup = await unitOfWork.execute(async (ports) => {
      const port = ports.modelPrice!;
      const one = await port.findById(MOCK_PRICE_SNAPSHOT_FIXTURES[0]!.id);
      await port.seedIfAbsent(MOCK_PRICE_SNAPSHOT_FIXTURES[0]!);
      const again = await port.findById(MOCK_PRICE_SNAPSHOT_FIXTURES[0]!.id);
      return { one, again };
    });
    expect(lookup.again).toEqual(lookup.one);
  } finally {
    await prisma.$disconnect();
  }
});

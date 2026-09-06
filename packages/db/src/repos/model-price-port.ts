import type {
  ModelPriceSnapshotPort,
  ModelPriceSnapshotRecord,
  ModelPriceSnapshotSeedInput,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * `ModelPriceSnapshotPort` adapter over `model_price_snapshots` (Block A).
 *
 * Price snapshots are immutable: only seed-if-absent and lookup exist. The
 * `(provider_id, resolved_model_id, effective_at)` unique key is the replay
 * guard, so seeding the same fixture twice converges on one row.
 */
export function createModelPricePort(tx: TxClient): ModelPriceSnapshotPort {
  return {
    async findById(id: string) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id, provider_id, requested_model_id, resolved_model_id,
                input_rate_micro_idr, output_rate_micro_idr, currency,
                effective_at, payload
           FROM model_price_snapshots
          WHERE id = $1
          LIMIT 1`,
        id,
      )) as Array<{
        id: string;
        provider_id: string;
        requested_model_id: string;
        resolved_model_id: string;
        input_rate_micro_idr: string | bigint;
        output_rate_micro_idr: string | bigint;
        currency: string;
        effective_at: Date;
        payload: unknown;
      }>;
      const row = rows[0];
      if (!row) return null;
      const record: ModelPriceSnapshotRecord = {
        id: row.id,
        providerId: row.provider_id,
        requestedModelId: row.requested_model_id,
        resolvedModelId: row.resolved_model_id,
        inputRateMicroIdr: BigInt(row.input_rate_micro_idr),
        outputRateMicroIdr: BigInt(row.output_rate_micro_idr),
        currency: row.currency,
        effectiveAt: row.effective_at,
        payload: row.payload as ModelPriceSnapshotRecord['payload'],
      };
      return record;
    },

    async seedIfAbsent(
      input: ModelPriceSnapshotSeedInput,
    ): Promise<{ kind: 'seeded' } | { kind: 'replayed' }> {
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO model_price_snapshots
           (id, provider_id, requested_model_id, resolved_model_id,
            input_rate_micro_idr, output_rate_micro_idr, currency, effective_at,
            schema_version, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, now())
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        input.id,
        input.providerId,
        input.requestedModelId,
        input.resolvedModelId,
        input.inputRateMicroIdr,
        input.outputRateMicroIdr,
        input.currency ?? 'IDR',
        input.effectiveAt,
        JSON.stringify(input.payload),
      )) as Array<{ id: string }>;
      return inserted[0] ? { kind: 'seeded' } : { kind: 'replayed' };
    },
  };
}

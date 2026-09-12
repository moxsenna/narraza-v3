import type { JsonObject } from '../ports/types.js';

/**
 * Persistence contract for immutable `ModelPriceSnapshot` rows (S5.4).
 *
 * Price snapshots are append-only; nothing may update a stored snapshot. The
 * seeder exists so dev/test/CI always price against one deterministic frozen
 * fixture — M7 owns real pricing calibration, so no seed may claim real
 * provider pricing.
 */
export interface ModelPriceSnapshotRecord {
  readonly id: string;
  readonly providerId: string;
  readonly requestedModelId: string;
  readonly resolvedModelId: string;
  readonly inputRateMicroIdr: bigint;
  readonly outputRateMicroIdr: bigint;
  readonly currency: string;
  readonly effectiveAt: Date;
  readonly payload: JsonObject;
}

export interface ModelPriceSnapshotPort {
  findById(id: string): Promise<ModelPriceSnapshotRecord | null>;
  seedIfAbsent(
    input: ModelPriceSnapshotSeedInput,
  ): Promise<{ kind: 'seeded' } | { kind: 'replayed' }>;
}

export interface ModelPriceSnapshotSeedInput {
  readonly id: string;
  readonly providerId: string;
  readonly requestedModelId: string;
  readonly resolvedModelId: string;
  readonly inputRateMicroIdr: bigint;
  readonly outputRateMicroIdr: bigint;
  readonly currency?: string;
  readonly effectiveAt: Date;
  readonly payload: JsonObject;
}

import type {
  ContextBundleCreateInput,
  ContextBundlePort,
  ContextBundleRecord,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * `ContextBundlePort` adapter over `generation_context_bundles` (Block A).
 *
 * Bundles are append-only: the adapter exposes create-and-lookup only, never
 * update or delete. Retention expiry is stamped here from the PostgreSQL clock
 * (D12: unused bundles older than 24h are swept; snapshots/bundle evidence
 * survive per the schema-retention invariant). A concurrent identical freeze
 * loses the `(project_id, bundle_hash)` race harmlessly.
 */
export function createContextBundlePort(tx: TxClient): ContextBundlePort {
  return {
    async createBundle(input: ContextBundleCreateInput): Promise<void> {
      await tx.$executeRawUnsafe(
        `INSERT INTO generation_context_bundles
           (id, project_id, snapshot_id, dependency_hash, bundle_hash, expires_at,
            consumed_at, schema_version, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '24 hours', NULL, $6, $7, now())`,
        input.id,
        input.projectId,
        input.snapshotId,
        input.dependencyHash,
        input.bundleHash,
        input.schemaVersion ?? 1,
        JSON.stringify(input.payload),
      );
    },

    async findBundleByHash(projectId: string, bundleHash: string) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id, project_id, bundle_hash, dependency_hash, schema_version,
                payload, expires_at, consumed_at
           FROM generation_context_bundles
          WHERE project_id = $1 AND bundle_hash = $2
          LIMIT 1`,
        projectId,
        bundleHash,
      )) as Array<{
        id: string;
        project_id: string;
        bundle_hash: string;
        dependency_hash: string;
        schema_version: number;
        payload: unknown;
        expires_at: Date;
        consumed_at: Date | null;
      }>;
      const row = rows[0];
      if (!row) return null;
      const record: ContextBundleRecord = {
        id: row.id,
        projectId: row.project_id,
        bundleHash: row.bundle_hash,
        dependencyHash: row.dependency_hash,
        schemaVersion: row.schema_version,
        payload: row.payload as ContextBundleRecord['payload'],
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
      };
      return record;
    },
  };
}

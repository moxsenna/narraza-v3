import type { JsonObject } from '../ports/types.js';

/**
 * Persistence contract for the frozen generation-context bundle (S5, Block A).
 *
 * A bundle is the immutable unit a paid generation request quotes against: it
 * pins one dependency manifest and the exact context snapshots built from it.
 * Both the bundle and its snapshots are append-only; nothing may rewrite a
 * frozen bundle. Replay is keyed by `(projectId, bundleHash)` — the same
 * semantic input always resolves to the same bundle row.
 *
 * Operational time (retention expiry) is owned by the adapter: it stamps
 * `expires_at` from the PostgreSQL clock, never from a Node `Date`.
 */

/** Column-level classification on `context_snapshots`/`generation_context_bundles`. */
export type StoredDataClass = 'restricted' | 'writer_safe' | 'review_safe';

/**
 * The core packet layer distinguishes `author_private` from
 * `service_restricted`; the schema stores both server-restricted families as
 * the single `restricted` data class.
 */
export function toStoredDataClass(dataClass: string): StoredDataClass {
  switch (dataClass) {
    case 'writer_safe':
      return 'writer_safe';
    case 'review_safe':
      return 'review_safe';
    case 'author_private':
    case 'service_restricted':
      return 'restricted';
    default:
      throw new Error(`context bundle: unknown data class '${dataClass}'`);
  }
}

export interface ContextBundleSnapshot {
  readonly id: string;
  readonly packetKind: string;
  readonly storedDataClass: StoredDataClass;
  readonly contentHash: string;
}

export interface FrozenContextPacketRecord {
  readonly packetKind: string;
  readonly dataClass: StoredDataClass;
  readonly dependencyHash: string;
  readonly contentHash: string;
  readonly payload: JsonObject;
}

export interface ContextBundleRecord {
  readonly id: string;
  readonly projectId: string;
  readonly bundleHash: string;
  readonly dependencyHash: string;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface ContextBundleCreateInput {
  readonly id: string;
  readonly projectId: string;
  readonly snapshotId: string;
  readonly dependencyHash: string;
  readonly bundleHash: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface ContextBundlePort {
  createBundle(input: ContextBundleCreateInput): Promise<void>;
  findBundleByHash(projectId: string, bundleHash: string): Promise<ContextBundleRecord | null>;
  findBundleById(projectId: string, bundleId: string): Promise<ContextBundleRecord | null>;
  findPacketByKind(
    projectId: string,
    bundleId: string,
    packetKind: string,
  ): Promise<FrozenContextPacketRecord | null>;
}

import { dependency } from '@narraza/core';
const { buildDependencyManifest, canonicalSha256, dependencyManifestHash } = dependency;
type DependencyEntry = Awaited<ReturnType<typeof buildDependencyManifest>>[number];
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { JsonObject } from '../ports/types.js';
import type { SnapshotAppendInput } from '../ports/snapshot-port.js';
import {
  toStoredDataClass,
  type ContextBundlePort,
  type ContextBundleSnapshot,
} from './context-bundle-port.js';

/**
 * Block A: freezes the context side of a paid generation request (S5).
 *
 * One freeze = one immutable `GenerationContextBundle` plus its immutable
 * `ContextSnapshot` rows, all derived deterministically from the caller-built
 * core packets and the canonical dependency manifest. Determinism contract:
 *
 *   - the dependency hash is `dependencyManifestHash` over the sorted manifest,
 *     so manifest entry order cannot change it;
 *   - every snapshot content hash is `canonicalSha256` over the packet, so key
 *     order cannot change it;
 *   - the bundle hash covers `workflowKind`, `dependencyHash` and the
 *     kind-ordered snapshot hashes, so any material input change yields a new
 *     bundle while a semantic replay yields the SAME bundle row.
 *
 * This service never builds packets itself: packet construction (and its
 * security policy) stays in `packages/core`. The caller hands in the already
 * built packets; this layer verifies the set against the frozen per-workflow
 * packet policy, hashes, and persists atomically.
 */

export interface ContextPacketLike {
  readonly kind: string;
  readonly dataClass: string;
  readonly metadata: {
    readonly projectId: string;
    readonly dependencyHash: string;
    readonly schemaVersion: number;
  };
}

/** Frozen packet-set policy: which packet kinds each workflow kind freezes.
 *
 * Every M4 plan template carries `*_parse_repair` (and `judge_repair`) stages
 * with packetKind 'repair', and the M4 processor pre-validates the frozen
 * binding of EVERY plan stage before its first provider call. The parse-repair
 * recovery packet therefore belongs to the frozen bundle itself: freezing
 * without it would only fail later on the worker, which is exactly the kind of
 * late failure the freeze contract exists to prevent. For safe_repair the
 * product packet IS the 'repair' packet, so one entry covers both. */
const WORKFLOW_PACKET_POLICY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  chat_intake: ['extraction'],
  chat_intake_reply: ['extraction', 'repair'],
  intake_reply: ['extraction'],
  concept_generation: ['planner', 'repair'],
  create_concepts: ['planner'],
  foundation_generation: ['planner', 'repair'],
  character_generation: ['planner', 'repair'],
  outline_generation: ['planner', 'repair'],
  scene_generation: ['writer', 'validator'],
  beat_write_judge: ['writer', 'validator', 'repair'],
  safe_repair: ['repair'],
  publish_package: ['extraction', 'repair'],
} as const);

export type FreezeBundleErrorCode =
  | 'unknown_workflow_kind'
  | 'missing_required_packet'
  | 'unexpected_packet'
  | 'packet_project_mismatch'
  | 'packet_dependency_mismatch'
  | 'duplicate_packet_kind'
  | 'dependency_manifest_invalid';

export interface FreezeBundleInput {
  readonly projectId: string;
  readonly workflowKind: string;
  /** Caller-allocated, stable before the freeze UoW (PM Decision 1 convention). */
  readonly bundleId: string;
  readonly dependencyEntries: readonly DependencyEntry[];
  readonly packets: readonly ContextPacketLike[];
}

export interface FrozenBundle {
  readonly bundleId: string;
  readonly bundleHash: string;
  readonly dependencyHash: string;
  readonly snapshots: readonly ContextBundleSnapshot[];
}

export type FreezeBundleResult =
  | { readonly kind: 'frozen'; readonly bundle: FrozenBundle }
  | { readonly kind: 'replayed'; readonly bundle: FrozenBundle }
  | { readonly kind: 'invalid'; readonly errorCode: FreezeBundleErrorCode };

const BUNDLE_SCHEMA_VERSION = 1;

/** Bundle hash envelope — versioned so the derivation itself is pinned. */
function computeBundleHash(input: {
  workflowKind: string;
  dependencyHash: string;
  snapshots: readonly { packetKind: string; contentHash: string }[];
}): string {
  return canonicalSha256({
    bundleHashVersion: 1,
    workflowKind: input.workflowKind,
    dependencyHash: input.dependencyHash,
    snapshots: [...input.snapshots].sort((left, right) =>
      left.packetKind < right.packetKind ? -1 : left.packetKind > right.packetKind ? 1 : 0,
    ),
  });
}

export function createContextBundleFreezeService(deps: { unitOfWork: UnitOfWork }) {
  return {
    async freezeBundle(input: FreezeBundleInput): Promise<FreezeBundleResult> {
      // 1. Deterministic dependency hash from the validated, sorted manifest.
      let dependencyHash: string;
      try {
        const manifest = buildDependencyManifest(input.dependencyEntries);
        dependencyHash = dependencyManifestHash(manifest);
      } catch {
        return { kind: 'invalid', errorCode: 'dependency_manifest_invalid' };
      }

      // 2. Frozen packet-set policy, fail closed.
      const required = WORKFLOW_PACKET_POLICY[input.workflowKind];
      if (!required) return { kind: 'invalid', errorCode: 'unknown_workflow_kind' };
      const seen = new Set<string>();
      for (const packet of input.packets) {
        if (seen.has(packet.kind)) {
          return { kind: 'invalid', errorCode: 'duplicate_packet_kind' };
        }
        seen.add(packet.kind);
        if (packet.metadata.projectId !== input.projectId) {
          return { kind: 'invalid', errorCode: 'packet_project_mismatch' };
        }
        if (packet.metadata.dependencyHash !== dependencyHash) {
          return { kind: 'invalid', errorCode: 'packet_dependency_mismatch' };
        }
      }
      for (const kind of required) {
        if (!seen.has(kind)) return { kind: 'invalid', errorCode: 'missing_required_packet' };
      }
      if (seen.size > required.length) {
        return { kind: 'invalid', errorCode: 'unexpected_packet' };
      }

      // 3. Deterministic snapshot hashes, kind-ordered.
      const snapshots = input.packets
        .map((packet) => ({
          id: `${input.bundleId}:${packet.kind}`,
          packetKind: packet.kind,
          storedDataClass: toStoredDataClass(packet.dataClass),
          contentHash: canonicalSha256(packet),
        }))
        .sort((left, right) =>
          left.packetKind < right.packetKind ? -1 : left.packetKind > right.packetKind ? 1 : 0,
        );
      const bundleHash = computeBundleHash({
        workflowKind: input.workflowKind,
        dependencyHash,
        // Project to the hash-relevant fields: bundle/snapshot ids must never
        // enter the hash, or a semantic replay under a new caller id would
        // fork into a second bundle.
        snapshots: snapshots.map((row) => ({
          packetKind: row.packetKind,
          contentHash: row.contentHash,
        })),
      });

      // 4. Atomic freeze; a concurrent identical freeze collapses into a replay.
      return deps.unitOfWork.execute<FreezeBundleResult>(async (ports) => {
        const contextBundle = ports.contextBundle;
        if (!contextBundle) {
          throw new Error('context bundle freeze: contextBundle port not configured');
        }
        const existing = await contextBundle.findBundleByHash(input.projectId, bundleHash);
        if (existing) {
          return { kind: 'replayed', bundle: toFrozen(existing) };
        }

        for (const packet of input.packets) {
          const snapshot: SnapshotAppendInput = {
            id: `${input.bundleId}:${packet.kind}`,
            projectId: input.projectId,
            packetKind: packet.kind,
            dataClass: toStoredDataClass(packet.dataClass),
            dependencyHash,
            contentHash: snapshots.find((row) => row.packetKind === packet.kind)!.contentHash,
            schemaVersion: BUNDLE_SCHEMA_VERSION,
            payload: packet as unknown as JsonObject,
          };
          await ports.snapshot.append(snapshot);
        }

        const payload: JsonObject = {
          schemaVersion: BUNDLE_SCHEMA_VERSION,
          workflowKind: input.workflowKind,
          dependencyHash,
          packetSet: [...seen].sort(),
          snapshots,
        };
        await contextBundle.createBundle({
          id: input.bundleId,
          projectId: input.projectId,
          snapshotId: `${input.bundleId}:${snapshots[0]?.packetKind ?? ''}`,
          dependencyHash,
          bundleHash,
          schemaVersion: BUNDLE_SCHEMA_VERSION,
          payload,
        });

        return {
          kind: 'frozen',
          bundle: {
            bundleId: input.bundleId,
            bundleHash,
            dependencyHash,
            snapshots,
          },
        };
      });
    },
  };
}

function toFrozen(
  record: NonNullable<Awaited<ReturnType<ContextBundlePort['findBundleByHash']>>>,
): FrozenBundle {
  const payloadSnapshots = (record.payload as { snapshots?: ContextBundleSnapshot[] }).snapshots;
  return {
    bundleId: record.id,
    bundleHash: record.bundleHash,
    dependencyHash: record.dependencyHash,
    snapshots: payloadSnapshots ?? [],
  };
}

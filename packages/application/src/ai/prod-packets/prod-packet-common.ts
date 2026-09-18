import { context, dependency } from '@narraza/core';
import type { ContextPacketLike } from '../context-bundle-freeze-service.js';

/**
 * Shared frozen-packet helpers for PROD paid flows (no preview imports, no
 * fixtures, no placeholders). Mirrors the web intake-packet helpers so both
 * surfaces freeze identical metadata/entries shapes.
 */
export function prodPacketMetadata(
  projectId: string,
  dependencyHash: string,
): context.PacketMetadata {
  return {
    schemaVersion: context.PACKET_SCHEMA_VERSION,
    projectId,
    dependencyHash,
    policyVersion: context.PACKET_POLICY_VERSION,
  };
}

export function prodDependencyEntries(
  outline: readonly { entityType: string; id: string; revision: number; deletedAt: unknown }[],
): dependency.DependencyEntry[] {
  return outline
    .filter((node) => node.deletedAt === null)
    .map((node) => ({
      entityType: node.entityType,
      entityId: node.id,
      revision: node.revision,
      deleted: false,
    }));
}

export function prodDependencyHash(entries: readonly dependency.DependencyEntry[]): string {
  return dependency.dependencyManifestHash(dependency.buildDependencyManifest(entries));
}

/**
 * Parse-repair recovery envelope for the frozen bundle. Every plan template
 * carries a parse-repair stage whose packetKind is 'repair', and the worker
 * pre-validates every stage's frozen binding — so the bundle must contain
 * this packet up front. Recovery-context marker, not product data.
 */
export function prodRecoveryPacket(
  projectId: string,
  dependencyHash: string,
  workflowKind: string,
): ContextPacketLike {
  const envelope: ContextPacketLike = {
    kind: 'repair',
    dataClass: 'writer_safe',
    metadata: prodPacketMetadata(projectId, dependencyHash),
  };
  const withContent = { ...envelope, content: { recoveryFor: workflowKind } };
  return withContent as ContextPacketLike;
}

import { type ContextPacketLike } from '@narraza/application';
import { context, dependency } from '@narraza/core';

/**
 * Shared frozen-packet helpers for intake flows (product + M4 harness).
 * Sync by nature, so they live outside 'use server' modules — Next.js
 * requires every export of a server-actions module to be async.
 */
export function packetMetadata(projectId: string, dependencyHash: string): context.PacketMetadata {
  return {
    schemaVersion: context.PACKET_SCHEMA_VERSION,
    projectId,
    dependencyHash,
    policyVersion: context.PACKET_POLICY_VERSION,
  };
}

export function dependencyEntries(
  outline: readonly { entityType: string; id: string; revision: number; deletedAt: Date | null }[],
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

export function computeDependencyHash(entries: readonly dependency.DependencyEntry[]): string {
  return dependency.dependencyManifestHash(dependency.buildDependencyManifest(entries));
}

/**
 * Parse-repair recovery envelope for the frozen bundle. Every M4 plan template
 * carries a parse-repair stage whose packetKind is 'repair', and the worker
 * pre-validates every stage's frozen binding before its first provider call —
 * so the bundle must contain this packet up front. It is a recovery-context
 * marker, not product data (the safe_repair PRODUCT workflow builds its own
 * real repair packet through the core builder instead).
 */
export function recoveryPacket(
  projectId: string,
  dependencyHash: string,
  workflowKind: string,
): ContextPacketLike {
  const envelope: ContextPacketLike = {
    kind: 'repair',
    dataClass: 'writer_safe',
    metadata: packetMetadata(projectId, dependencyHash),
  };
  const withContent = { ...envelope, content: { recoveryFor: workflowKind } };
  return withContent;
}

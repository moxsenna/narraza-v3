import { context } from '@narraza/core';
import type { ContextPacketLike } from '../context-bundle-freeze-service.js';
import { toRepairDirective } from '../../use-cases/prose-repair.js';
import type { ValidationFindingRecord } from '../../ports/validation-repo.js';
import { prodPacketMetadata } from './prod-packet-common.js';

export interface RepairPacketState {
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly beatTitle: string;
  readonly proseContent: string;
  /** Blocking findings from the current deterministic report. */
  readonly findings: readonly ValidationFindingRecord[];
}

export type RepairPacketResult =
  | { readonly kind: 'ok'; readonly packet: ContextPacketLike }
  | { readonly kind: 'error'; readonly error: 'prerequisite' | 'invalid' };

/**
 * Repair packet for safe_repair from REAL prod validation state. Directives
 * are sanitized projections (findingKey + public code + instruction) —
 * never restricted detail. Empty directives fail prerequisite: a repair
 * without blockers to fix is not a repair.
 */
export function buildRepairPacket(state: RepairPacketState): RepairPacketResult {
  if (!state.projectId || !state.dependencyHash || !state.proseVersionId || !state.beatId) {
    return { kind: 'error', error: 'invalid' };
  }
  const title = state.beatTitle.trim();
  if (!title || !state.proseContent.trim() || state.findings.length === 0) {
    return { kind: 'error', error: 'prerequisite' };
  }
  try {
    const packet = context.buildRepairPacket({
      kind: 'repair',
      dataClass: 'writer_safe',
      metadata: prodPacketMetadata(state.projectId, state.dependencyHash),
      repairableProse: {
        proseVersionId: state.proseVersionId,
        beatId: state.beatId,
        content: state.proseContent,
      },
      directives: state.findings.map((finding) => toRepairDirective(finding)),
      beatContract: {
        beatId: state.beatId,
        purpose: title,
        sceneGoal: `Perbaiki adegan: ${title}`,
        directives: [],
      },
      revealGuidance: [],
    });
    return { kind: 'ok', packet };
  } catch {
    return { kind: 'error', error: 'invalid' };
  }
}

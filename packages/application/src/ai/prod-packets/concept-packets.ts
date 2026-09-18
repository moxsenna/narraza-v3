import { context } from '@narraza/core';
import type { ContextPacketLike } from '../context-bundle-freeze-service.js';
import { prodPacketMetadata } from './prod-packet-common.js';

export interface ConceptPacketState {
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly lastUserContent: string;
}

export type ConceptPacketResult =
  | { readonly kind: 'ok'; readonly packet: ContextPacketLike }
  | { readonly kind: 'error'; readonly error: 'prerequisite' | 'invalid' };

/**
 * Planner packet for concept_generation from REAL prod intake state. The
 * last user message seeds the core concept; every other draft field keeps
 * its explicit not-yet-determined marker (never fabricated). author_private
 * by design — D14 routes it to allowlisted providers only.
 */
export function buildConceptPlannerPacket(state: ConceptPacketState): ConceptPacketResult {
  if (!state.projectId || !state.dependencyHash) return { kind: 'error', error: 'invalid' };
  const content = state.lastUserContent.trim();
  if (!content) return { kind: 'error', error: 'prerequisite' };
  try {
    const packet = context.buildPlannerPacket({
      kind: 'planner',
      dataClass: 'author_private',
      metadata: prodPacketMetadata(state.projectId, state.dependencyHash),
      foundation: {
        coreConcept: content,
        conflict: '(belum ditentukan)',
        endingDirection: '(belum ditentukan)',
        readerPromise: '(belum ditentukan)',
      },
      characters: [],
      facts: [],
      reveals: [],
      futureOutline: [],
    });
    return { kind: 'ok', packet };
  } catch {
    return { kind: 'error', error: 'invalid' };
  }
}

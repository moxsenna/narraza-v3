import { context } from '@narraza/core';
import type { ContextPacketLike } from '../context-bundle-freeze-service.js';
import { prodPacketMetadata } from './prod-packet-common.js';

export interface BeatPacketState {
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly beatId: string;
  readonly beatTitle: string;
}

export interface BeatValidatorState extends BeatPacketState {
  /** Reference prose context (draft content when present, else empty). */
  readonly proseVersionId: string;
  readonly proseBeatId: string;
  readonly proseContent: string;
}

export type BeatPacketResult =
  | { readonly kind: 'ok'; readonly packet: ContextPacketLike }
  | { readonly kind: 'error'; readonly error: 'prerequisite' | 'invalid' };

function validBase(state: BeatPacketState): boolean {
  return !!state.projectId && !!state.dependencyHash && !!state.beatId;
}

/**
 * Writer packet for beat_write_judge from REAL prod outline state. The beat
 * contract carries purpose + scene goal only — no character/fact/reveal
 * content is fabricated (empty allowlists). writer_safe by design.
 */
export function buildBeatWriterPacket(state: BeatPacketState): BeatPacketResult {
  if (!validBase(state)) return { kind: 'error', error: 'invalid' };
  const title = state.beatTitle.trim();
  if (!title) return { kind: 'error', error: 'prerequisite' };
  try {
    const packet = context.buildWriterPacket({
      kind: 'writer',
      dataClass: 'writer_safe',
      metadata: prodPacketMetadata(state.projectId, state.dependencyHash),
      beatContract: {
        beatId: state.beatId,
        purpose: title,
        sceneGoal: `Selesaikan adegan: ${title}`,
        directives: [],
      },
      characterDirectives: [],
      establishedFacts: [],
      revealGuidance: [],
      acceptedProseContext: [],
    });
    return { kind: 'ok', packet };
  } catch {
    return { kind: 'error', error: 'invalid' };
  }
}

/**
 * Validator packet bound to the same beat contract. Prose is reference
 * context for the judge (draft content when present); the worker judges the
 * writer stage output, never this packet, for acceptance.
 */
export function buildBeatValidatorPacket(state: BeatValidatorState): BeatPacketResult {
  if (!validBase(state)) return { kind: 'error', error: 'invalid' };
  const title = state.beatTitle.trim();
  if (!title || !state.proseVersionId) return { kind: 'error', error: 'prerequisite' };
  try {
    const packet = context.buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata: prodPacketMetadata(state.projectId, state.dependencyHash),
      prose: {
        proseVersionId: state.proseVersionId,
        beatId: state.proseBeatId,
        content: state.proseContent,
      },
      beatContract: {
        beatId: state.beatId,
        purpose: title,
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
      },
      restrictedGuardSets: [],
      continuityRules: [],
    });
    return { kind: 'ok', packet };
  } catch {
    return { kind: 'error', error: 'invalid' };
  }
}

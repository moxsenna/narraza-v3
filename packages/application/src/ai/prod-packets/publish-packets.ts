import { context } from '@narraza/core';
import type { ContextPacketLike } from '../context-bundle-freeze-service.js';
import { prodPacketMetadata } from './prod-packet-common.js';

export interface PublishPacketState {
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly proseVersionId: string;
  readonly proseContent: string;
}

export type PublishPacketResult =
  | { readonly kind: 'ok'; readonly packet: ContextPacketLike }
  | { readonly kind: 'error'; readonly error: 'prerequisite' | 'invalid' };

/**
 * Extraction packet for publish_package from the ACCEPTED prose version.
 * review_safe by design: only public structure is extracted, never
 * restricted author context.
 */
export function buildPublishPacket(state: PublishPacketState): PublishPacketResult {
  if (!state.projectId || !state.dependencyHash || !state.proseVersionId) {
    return { kind: 'error', error: 'invalid' };
  }
  if (!state.proseContent.trim()) return { kind: 'error', error: 'prerequisite' };
  try {
    const packet = context.buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata: prodPacketMetadata(state.projectId, state.dependencyHash),
      useCase: 'prose_public_structure',
      prose: { proseVersionId: state.proseVersionId, content: state.proseContent },
    });
    return { kind: 'ok', packet };
  } catch {
    return { kind: 'error', error: 'invalid' };
  }
}

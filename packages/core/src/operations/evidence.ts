import type { CanonicalEntitySnapshot, ResolutionContext } from './entities.js';
import { OperationDomainError } from './errors.js';
import type { CanonicalProseEvidenceBinding, ProseEvidenceBinding } from './payloads.js';
import { requireLiveSnapshot } from './snapshot.js';

export interface TemporaryProse {
  readonly id: string;
  readonly beatId: string;
  readonly content: string;
  readonly contentHash: string;
}

export function resolveProseEvidence(
  binding: ProseEvidenceBinding,
  index: ReadonlyMap<string, CanonicalEntitySnapshot>,
  temporaryProse: ReadonlyMap<string, TemporaryProse>,
  context: ResolutionContext,
): CanonicalProseEvidenceBinding {
  const resolved =
    binding.proseVersionRef.kind === 'existing'
      ? (() => {
          const s = requireLiveSnapshot(
            index,
            'prose_version',
            binding.proseVersionRef.entityId,
          );
          if (
            s.candidateId !== context.candidateId ||
            s.extractionRunId !== context.extractionRunId ||
            s.content === undefined ||
            s.contentHash === undefined
          ) {
            throw new OperationDomainError(
              'INVALID_PROSE_EVIDENCE_BINDING',
              'prose provenance mismatch',
              {
                reason: 'provenance',
                proseVersionId: s.entityId,
                actualCandidateId: s.candidateId,
                actualExtractionRunId: s.extractionRunId,
              },
            );
          }
          return {
            id: s.entityId,
            content: s.content,
            contentHash: s.contentHash,
          };
        })()
      : (() => {
          const p = temporaryProse.get(binding.proseVersionRef.tempRef);
          if (!p) {
            throw new OperationDomainError('UNRESOLVED_TEMP_REF', 'missing prose producer', {
              tempRef: binding.proseVersionRef.tempRef,
            });
          }
          return p;
        })();

  if (
    resolved.contentHash !== binding.proseContentHash ||
    !Number.isSafeInteger(binding.startUtf16) ||
    !Number.isSafeInteger(binding.endUtf16) ||
    binding.startUtf16 < 0 ||
    binding.endUtf16 < binding.startUtf16 ||
    binding.endUtf16 > resolved.content.length
  ) {
    throw new OperationDomainError(
      'INVALID_PROSE_EVIDENCE_BINDING',
      'hash or UTF-16 range mismatch',
    );
  }

  return {
    proseVersionId: resolved.id,
    proseContentHash: binding.proseContentHash,
    startUtf16: binding.startUtf16,
    endUtf16: binding.endUtf16,
  };
}

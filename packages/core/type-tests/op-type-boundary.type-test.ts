import type { CanonicalChangeOperation } from '../src/operations/canonical.js';
import type { ModelSuggestionDraft } from '../src/operations/suggestion.js';
import type { NormalizedOperationDraft } from '../src/operations/normalized.js';

declare const model: ModelSuggestionDraft;
declare const normalized: NormalizedOperationDraft;
declare const canonical: CanonicalChangeOperation;

// @ts-expect-error model suggestion lacks normalized target and payload
const modelAsNormalized: NormalizedOperationDraft = model;
// @ts-expect-error normalized draft lacks canonical IDs, revision, risk, ordinal, and brand
const normalizedAsCanonical: CanonicalChangeOperation = normalized;
// @ts-expect-error canonical operation is not model output
const canonicalAsModel: ModelSuggestionDraft = canonical;
// @ts-expect-error model cannot construct internal canonical brand
const forged: CanonicalChangeOperation = {
  schemaVersion: 1,
  operationId: 'op-1',
  ordinal: 0,
  operationType: 'foundation.update',
  targetEntityType: 'foundation',
  targetId: 'foundation-1',
  expectedRevision: 0,
  risk: 'medium',
  payload: { kind: 'foundation.update', changes: { conflict: 'x' } },
};

void [modelAsNormalized, normalizedAsCanonical, canonicalAsModel, forged];

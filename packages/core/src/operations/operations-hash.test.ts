import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../dependency/canonical-json.js';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { hashCanonicalOperations } from './operations-hash.js';
import { resolveOperations } from './resolver.js';
import { context } from './test-fixtures.js';

const drafts = [
  n({
    schemaVersion: 1,
    tempRef: 'prose',
    operationType: 'prose.version.create',
    input: { beat: { existingId: 'beat-1' }, content: 'A' },
  }),
  n({
    schemaVersion: 1,
    tempRef: 'accept',
    operationType: 'prose.accept',
    input: {
      target: { existingId: 'beat-1' },
      proseVersion: { tempRef: 'prose' },
    },
  }),
];

describe('operations hash', () => {
  it('hashes prefix plus canonical JSON exact fields', () => {
    const operations = resolveOperations(drafts, context()).operations;
    const material = operations.map(
      ({
        schemaVersion,
        ordinal,
        operationType,
        targetEntityType,
        targetId,
        expectedRevision,
        risk,
        payload,
      }) => ({
        schemaVersion,
        ordinal,
        operationType,
        targetEntityType,
        targetId,
        expectedRevision,
        risk,
        payload,
      }),
    );
    expect(hashCanonicalOperations(operations)).toBe(
      sha256Hex(`narraza-canonical-operations:v1\n${canonicalJson(material)}`),
    );
  });

  it('excludes operationId and rejects broken ordinal', () => {
    const operations = resolveOperations(drafts, context()).operations;
    expect(
      hashCanonicalOperations(operations.map((o, i) => ({ ...o, operationId: `retry-${i}` }))),
    ).toBe(hashCanonicalOperations(operations));
    expect(() =>
      hashCanonicalOperations(operations.map((o) => ({ ...o, ordinal: o.ordinal + 1 }))),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });
});

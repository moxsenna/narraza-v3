import { describe, expect, it } from 'vitest';
import * as operations from './index.js';
import { parseModelSuggestion } from './suggestion.js';

describe('runtime model boundary', () => {
  it.each(['operationId', 'targetId', 'expectedRevision', 'risk', 'ordinal', 'hash'])(
    'rejects injected %s',
    (key) => {
      expect(() =>
        parseModelSuggestion({
          schemaVersion: 1,
          tempRef: 'x',
          operationType: 'fact.create',
          input: {},
          [key]: 'bad',
        }),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    },
  );

  it('exports public API without canonical internals', () => {
    expect(operations).toHaveProperty('parseModelSuggestion');
    expect(operations).toHaveProperty('normalizeSuggestion');
    expect(operations).toHaveProperty('resolveOperations');
    expect(operations).toHaveProperty('hashCanonicalOperations');
    expect(operations).not.toHaveProperty('CANONICAL_OPERATION');
    expect(operations).not.toHaveProperty('brandCanonicalOperation');
  });
});


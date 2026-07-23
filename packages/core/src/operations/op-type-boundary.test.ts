import { describe, expect, it } from 'vitest';
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
});

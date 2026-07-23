import { expect, it } from 'vitest';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { resolveOperations } from './resolver.js';
import { context, HASH_A } from './test-fixtures.js';

const suggestions = [
  n({
    schemaVersion: 1,
    tempRef: 'accept',
    operationType: 'prose.accept',
    input: {
      target: { existingId: 'beat-1' },
      proseVersion: { tempRef: 'prose' },
    },
  }),
  n({
    schemaVersion: 1,
    tempRef: 'prose',
    operationType: 'prose.version.create',
    input: { beat: { existingId: 'beat-1' }, content: 'A' },
  }),
  n({
    schemaVersion: 1,
    tempRef: 'fact',
    operationType: 'fact.create',
    input: {
      statement: 'X',
      canonStatus: 'draft',
      visibility: 'writer_safe',
      source: {
        kind: 'prose',
        evidence: {
          proseVersionRef: { tempRef: 'prose' },
          proseContentHash: HASH_A,
          startUtf16: 0,
          endUtf16: 1,
        },
      },
    },
  }),
];

it.each(['beat.write', 'repair'] as const)('%s keeps sole accept last', (contract) =>
  expect(
    resolveOperations(
      [...suggestions].reverse(),
      context(contract, {
        repairBinding:
          contract === 'repair'
            ? {
                sourceProseVersionId: 'old',
                repairedProseVersionId: 'prose_version-prose',
                extractionSourceProseVersionId: 'prose_version-prose',
              }
            : undefined,
      }),
    ).operations.at(-1)?.operationType,
  ).toBe('prose.accept'),
);

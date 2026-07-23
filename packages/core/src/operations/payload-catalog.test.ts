import { describe, expect, it } from 'vitest';
import { parseAndNormalizeSuggestion } from './normalized.js';

const h = 'a'.repeat(64);
const ref = (existingId: string) => ({ existingId });
const evidence = {
  proseVersionRef: ref('pv-1'),
  proseContentHash: h,
  startUtf16: 0,
  endUtf16: 1,
};
const character = {
  displayName: 'Mira',
  role: 'main',
  identity: null,
  goal: null,
  motivation: null,
  address: null,
  speechStyle: null,
} as const;
const fact = {
  statement: 'Pintu terkunci.',
  canonStatus: 'established',
  visibility: 'writer_safe',
  source: { kind: 'foundation' },
} as const;
const cases = [
  [
    'foundation.update',
    { target: ref('foundation-1'), changes: { conflict: 'Konflik' } },
    ['existing', 'foundation', 'foundation-1'],
  ],
  ['character.create', character, ['temporary', 'character', 'op2']],
  [
    'character.update',
    { target: ref('char-1'), ...character },
    ['existing', 'character', 'char-1'],
  ],
  ['fact.create', fact, ['temporary', 'fact', 'op4']],
  [
    'fact.update',
    { target: ref('fact-1'), ...fact },
    ['existing', 'fact', 'fact-1'],
  ],
  [
    'state.append',
    { target: ref('char-1'), stateKey: 'place', value: 'arsip', evidence },
    ['existing', 'character', 'char-1'],
  ],
  [
    'belief.append',
    { target: ref('char-1'), fact: ref('fact-1'), level: 'known', evidence },
    ['existing', 'character', 'char-1'],
  ],
  [
    'disclosure.append',
    {
      target: { tempRef: 'factMaker' },
      event: { kind: 'disclose', result: 'known' },
      evidence,
    },
    ['temporary', 'fact', 'factMaker'],
  ],
  [
    'reveal.create',
    {
      fact: ref('fact-1'),
      position: { chapter: ref('chapter-1') },
      safeDirectives: [],
    },
    ['temporary', 'reveal', 'op9'],
  ],
  [
    'reveal.update',
    {
      target: ref('reveal-1'),
      fact: ref('fact-1'),
      position: { chapter: ref('chapter-1') },
      safeDirectives: ['Tahan.'],
    },
    ['existing', 'reveal', 'reveal-1'],
  ],
  [
    'breadcrumb.create',
    {
      reveal: ref('reveal-1'),
      position: { chapter: ref('chapter-1') },
      safeDirective: 'Kunci tampak.',
    },
    ['temporary', 'reveal_breadcrumb', 'op11'],
  ],
  [
    'outline.create',
    {
      node: {
        kind: 'beat',
        parent: ref('chapter-1'),
        title: 'Pintu',
        purpose: 'Masuk',
      },
    },
    ['temporary', 'beat', 'op12'],
  ],
  [
    'outline.update',
    {
      target: ref('chapter-1'),
      node: { kind: 'chapter', parent: ref('arc-1'), title: 'Arsip' },
    },
    ['existing', 'chapter', 'chapter-1'],
  ],
  [
    'prose.version.create',
    { beat: ref('beat-1'), content: 'A' },
    ['temporary', 'prose_version', 'op14'],
  ],
  [
    'prose.accept',
    { target: ref('beat-1'), proseVersion: { tempRef: 'op14' } },
    ['existing', 'beat', 'beat-1'],
  ],
] as const;

describe('15 operation model mappings', () => {
  it.each(cases)('%s maps exact target and payload', (operationType, input, expectedTarget) => {
    const index = cases.findIndex((entry) => entry[0] === operationType) + 1;
    const result = parseAndNormalizeSuggestion({
      schemaVersion: 1,
      tempRef: `op${index}`,
      operationType,
      input,
    });
    expect([
      result.target.kind,
      result.target.entityType,
      result.target.kind === 'existing' ? result.target.entityId : result.target.tempRef,
    ]).toEqual(expectedTarget);
    expect(result.payload.kind).toBe(operationType);
    expect(result.dependsOn).toEqual([]);
  });

  it.each(cases)('%s rejects unknown and wrong-typed input keys', (operationType, input) => {
    expect(() =>
      parseAndNormalizeSuggestion({
        schemaVersion: 1,
        tempRef: 'x',
        operationType,
        input: { ...input, injected: true },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() =>
      parseAndNormalizeSuggestion({
        schemaVersion: 1,
        tempRef: 'x',
        operationType,
        input: null,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });

  it('rejects unknown nested keys and alias collisions', () => {
    expect(() =>
      parseAndNormalizeSuggestion({
        schemaVersion: 1,
        tempRef: 'x',
        operationType: 'fact.create',
        input: { ...fact, source: { kind: 'foundation', leak: true } },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() =>
      parseAndNormalizeSuggestion({
        schemaVersion: 1,
        temp_id: 'x',
        tempRef: 'y',
        op: 'fact.create',
        input: fact,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() =>
      parseAndNormalizeSuggestion({
        schemaVersion: 1,
        tempRef: 'x',
        operationType: 'fact.create',
        input: { ...fact, fact_text: 'alias' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });
});

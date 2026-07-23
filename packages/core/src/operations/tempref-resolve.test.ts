import { describe, expect, it } from 'vitest';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { resolveOperationValues } from './resolver.js';
import { context, HASH_A } from './test-fixtures.js';

const e = {
  proseVersionRef: { existingId: 'pv-1' },
  proseContentHash: HASH_A,
  startUtf16: 0,
  endUtf16: 1,
};
const raw = [
  {
    schemaVersion: 1,
    tempRef: 'foundation',
    operationType: 'foundation.update',
    input: { target: { existingId: 'foundation-1' }, changes: { conflict: 'x' } },
  },
  {
    schemaVersion: 1,
    tempRef: 'charNew',
    operationType: 'character.create',
    input: {
      displayName: 'N',
      role: 'supporting',
      identity: null,
      goal: null,
      motivation: null,
      address: null,
      speechStyle: null,
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'charUpdate',
    operationType: 'character.update',
    input: {
      target: { existingId: 'char-1' },
      displayName: 'M',
      role: 'main',
      identity: null,
      goal: null,
      motivation: null,
      address: null,
      speechStyle: null,
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'factNew',
    operationType: 'fact.create',
    input: {
      statement: 'X',
      canonStatus: 'draft',
      visibility: 'writer_safe',
      source: { kind: 'foundation' },
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'factUpdate',
    operationType: 'fact.update',
    input: {
      target: { existingId: 'fact-1' },
      statement: 'Y',
      canonStatus: 'established',
      visibility: 'writer_safe',
      source: { kind: 'foundation' },
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'state',
    operationType: 'state.append',
    input: {
      target: { existingId: 'char-1' },
      stateKey: 'place',
      value: 'arsip',
      evidence: e,
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'belief',
    operationType: 'belief.append',
    input: {
      target: { existingId: 'char-1' },
      fact: { existingId: 'fact-1' },
      level: 'known',
      evidence: e,
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'disclosure',
    operationType: 'disclosure.append',
    input: {
      target: { existingId: 'fact-1' },
      event: { kind: 'disclose', result: 'known' },
      evidence: e,
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'revealNew',
    operationType: 'reveal.create',
    input: {
      fact: { existingId: 'fact-1' },
      position: { chapter: { existingId: 'chapter-1' } },
      safeDirectives: [],
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'revealUpdate',
    operationType: 'reveal.update',
    input: {
      target: { existingId: 'reveal-1' },
      fact: { existingId: 'fact-1' },
      position: {
        chapter: { existingId: 'chapter-1' },
        beat: { existingId: 'beat-1' },
      },
      safeDirectives: [],
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'crumb',
    operationType: 'breadcrumb.create',
    input: {
      reveal: { existingId: 'reveal-1' },
      position: { chapter: { existingId: 'chapter-1' } },
      safeDirective: 'Kunci',
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'roadmap',
    operationType: 'outline.create',
    input: { node: { kind: 'roadmap', title: 'Road' } },
  },
  {
    schemaVersion: 1,
    tempRef: 'chapterUpdate',
    operationType: 'outline.update',
    input: {
      target: { existingId: 'chapter-1' },
      node: { kind: 'chapter', parent: { existingId: 'arc-1' }, title: 'Bab' },
    },
  },
  {
    schemaVersion: 1,
    tempRef: 'prose',
    operationType: 'prose.version.create',
    input: { beat: { existingId: 'beat-1' }, content: 'A' },
  },
  {
    schemaVersion: 1,
    tempRef: 'accept',
    operationType: 'prose.accept',
    input: {
      target: { existingId: 'beat-1' },
      proseVersion: { tempRef: 'prose' },
    },
  },
] as const;

describe('temp ref resolution', () => {
  it('resolves all 15 payload branches through contract-compatible candidates', () => {
    const groups = [
      ['intake', [0]],
      ['foundation', [1, 2, 3, 4, 8, 9]],
      ['outline', [10, 11, 12]],
      ['beat.write', [5, 6, 7, 13, 14]],
    ] as const;
    const nodes = groups.flatMap(([contract, indexes]) =>
      resolveOperationValues(
        indexes.map((index) => n(raw[index]!)),
        context(contract),
      ).nodes,
    );
    expect(new Set(nodes.map((x) => x.operationType))).toEqual(
      new Set(raw.map((x) => x.operationType)),
    );
    expect(nodes.find((x) => x.operationType === 'fact.create')?.payload).toMatchObject({
      factKey: 'FK-factNew',
    });
    expect(nodes.find((x) => x.operationType === 'outline.update')?.payload).toMatchObject({
      node: { parentId: 'arc-1', ordinal: 1, narrativeSequence: 10 },
    });
  });

  it('rejects invalid allocator output before canonical construction', () => {
    expect(() =>
      resolveOperationValues([n(raw[1])], context('foundation', { allocateId: () => '' })),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() =>
      resolveOperationValues(
        [n(raw[1]), n({ ...raw[1], tempRef: 'charOther' })],
        context('foundation', { allocateId: () => 'duplicate' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() =>
      resolveOperationValues(
        [n(raw[3])],
        context('foundation', { allocateFactKey: () => '' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() =>
      resolveOperationValues(
        [n(raw[1])],
        context('foundation', { allocateOperationId: () => '' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });

  it('rejects missing, deleted, unresolved, and duplicate identities', () => {
    expect(() =>
      resolveOperationValues(
        [
          n({
            ...raw[2],
            input: { ...raw[2].input, target: { existingId: 'missing' } },
          }),
        ],
        context('foundation'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'ENTITY_NOT_FOUND' }));
    expect(() =>
      resolveOperationValues(
        [
          n(raw[13]),
          n({
            ...raw[6],
            input: { ...raw[6].input, fact: { tempRef: 'missing' } },
          }),
          n(raw[14]),
        ],
        context(),
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNRESOLVED_TEMP_REF' }));
    expect(() =>
      resolveOperationValues(
        [n(raw[1]), n({ ...raw[1], operationType: 'character.create' })],
        context('foundation'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_TEMP_REF' }));
  });

  it('rejects revision, parent, chronology, retraction, and beat mismatches', () => {
    const noRevision = context('foundation', {
      snapshots: context().snapshots.map((s) =>
        s.entityType === 'character' && s.entityId === 'char-1'
          ? { ...s, revision: null }
          : s,
      ),
    });
    expect(() => resolveOperationValues([n(raw[2])], noRevision)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SNAPSHOT' }),
    );
    expect(() =>
      resolveOperationValues(
        [
          n({
            ...raw[12],
            input: {
              target: { existingId: 'chapter-1' },
              node: {
                kind: 'chapter',
                parent: { existingId: 'roadmap-1' },
                title: 'Bad',
              },
            },
          }),
        ],
        context('outline'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'ENTITY_NOT_FOUND' }));
    const late = context('outline', {
      snapshots: context().snapshots.map((s) =>
        s.entityType === 'reveal' ? { ...s, targetSequence: 10 } : s,
      ),
    });
    expect(() => resolveOperationValues([n(raw[10])], late)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SUGGESTION' }),
    );
    expect(() =>
      resolveOperationValues(
        [
          n(raw[13]),
          n({
            ...raw[7],
            input: {
              ...raw[7].input,
              event: { kind: 'retract', disclosure: { existingId: 'missing' } },
            },
          }),
          n(raw[14]),
        ],
        context(),
      ),
    ).toThrowError(expect.objectContaining({ code: 'ENTITY_NOT_FOUND' }));
    expect(() =>
      resolveOperationValues(
        [
          n(raw[13]),
          n({
            ...raw[14],
            input: {
              target: { existingId: 'beat-1' },
              proseVersion: { existingId: 'pv-other' },
            },
          }),
        ],
        context(),
      ),
    ).toThrowError(expect.objectContaining({ code: 'PROSE_ACCEPT_REQUIRED' }));
  });

  it('resolves temporary roadmap to arc to chapter to beat and allocates siblings in semantic localRef order', () => {
    const outline = [
      n({
        schemaVersion: 1,
        tempRef: 'beatB',
        operationType: 'outline.create',
        input: {
          node: {
            kind: 'beat',
            parent: { tempRef: 'chapter' },
            title: 'B',
            purpose: 'B',
          },
        },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'road',
        operationType: 'outline.create',
        input: { node: { kind: 'roadmap', title: 'Road' } },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'chapter',
        operationType: 'outline.create',
        input: {
          node: { kind: 'chapter', parent: { tempRef: 'arc' }, title: 'Chapter' },
        },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'beatA',
        operationType: 'outline.create',
        input: {
          node: {
            kind: 'beat',
            parent: { tempRef: 'chapter' },
            title: 'A',
            purpose: 'A',
          },
        },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'arc',
        operationType: 'outline.create',
        input: {
          node: { kind: 'arc', parent: { tempRef: 'road' }, title: 'Arc' },
        },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'chapterExisting',
        operationType: 'outline.create',
        input: {
          node: {
            kind: 'chapter',
            parent: { existingId: 'arc-1' },
            title: 'Existing sibling',
          },
        },
      }),
    ] as const;
    const project = (input: readonly (typeof outline)[number][]) =>
      resolveOperationValues(input, context('outline')).nodes.map((x) => [
        x.localRef,
        x.payload,
      ]);
    const expected = project(outline);
    expect(project([...outline].reverse())).toEqual(expected);
    expect(expected).toEqual(
      expect.arrayContaining([
        [
          'arc',
          expect.objectContaining({
            node: expect.objectContaining({ parentId: 'roadmap-road', ordinal: 0 }),
          }),
        ],
        [
          'chapter',
          expect.objectContaining({
            node: expect.objectContaining({
              parentId: 'arc-arc',
              ordinal: 0,
              narrativeSequence: 0,
            }),
          }),
        ],
        [
          'beatA',
          expect.objectContaining({
            node: expect.objectContaining({
              parentId: 'chapter-chapter',
              ordinal: 0,
              narrativeSequence: 0,
            }),
          }),
        ],
        [
          'beatB',
          expect.objectContaining({
            node: expect.objectContaining({
              parentId: 'chapter-chapter',
              ordinal: 1,
              narrativeSequence: 1,
            }),
          }),
        ],
        [
          'chapterExisting',
          expect.objectContaining({
            node: expect.objectContaining({
              parentId: 'arc-1',
              ordinal: 2,
              narrativeSequence: 10,
            }),
          }),
        ],
      ]),
    );
  });

  it('preserves outline.update target ordinal instead of parent nextOrdinal', () => {
    const updated = resolveOperationValues([n(raw[12])], context('outline')).nodes[0]!;
    expect(updated.payload).toMatchObject({
      node: { parentId: 'arc-1', ordinal: 1, narrativeSequence: 10 },
    });
  });

  it('allocates each temporary factKey once, reuses it, and stays permutation-stable', () => {
    const calls: string[] = [];
    const drafts = [
      n({
        schemaVersion: 1,
        tempRef: 'factA',
        operationType: 'fact.create',
        input: {
          statement: 'A',
          canonStatus: 'draft',
          visibility: 'writer_safe',
          source: { kind: 'foundation' },
        },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'beliefA',
        operationType: 'belief.append',
        input: {
          target: { existingId: 'char-1' },
          fact: { tempRef: 'factA' },
          level: 'known',
          evidence: e,
        },
      }),
    ] as const;
    const candidate = [...drafts, n(raw[13]), n(raw[14])];
    const run = (input: readonly (typeof candidate)[number][]) =>
      resolveOperationValues(
        input,
        context('beat.write', {
          allocateFactKey: (ref) => {
            calls.push(ref);
            return `FK-${ref}`;
          },
        }),
      ).nodes.map((x) => x.payload);
    const first = run(candidate);
    expect(calls).toEqual(['factA']);
    calls.length = 0;
    expect(run([...candidate].reverse())).toEqual(first);
    expect(calls).toEqual(['factA']);
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'fact.create', factKey: 'FK-factA' }),
        expect.objectContaining({ kind: 'belief.append', beliefKey: 'FK-factA' }),
      ]),
    );
  });

  it('rejects duplicate precomputed factKeys before payload resolution', () => {
    const facts = [n(raw[3]), n({ ...raw[3], tempRef: 'factOther' })];
    let calls = 0;
    expect(() =>
      resolveOperationValues(
        facts,
        context('foundation', {
          allocateFactKey: () => {
            calls += 1;
            return 'duplicate';
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(calls).toBe(2);
    expect(() =>
      resolveOperationValues(
        [n(raw[3])],
        context('foundation', { allocateFactKey: () => 'FK-1' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });

  it('uses temporary chapter and beat metadata for reveal and breadcrumb positions across permutations', () => {
    const outline = [
      n({
        schemaVersion: 1,
        tempRef: 'chapterTemp',
        operationType: 'outline.create',
        input: {
          node: {
            kind: 'chapter',
            parent: { existingId: 'arc-1' },
            title: 'Temp chapter',
          },
        },
      }),
      n({
        schemaVersion: 1,
        tempRef: 'beatTemp',
        operationType: 'outline.create',
        input: {
          node: {
            kind: 'beat',
            parent: { tempRef: 'chapterTemp' },
            title: 'Temp beat',
            purpose: 'Position',
          },
        },
      }),
    ] as const;
    const reveal = n({
      schemaVersion: 1,
      tempRef: 'revealTemp',
      operationType: 'reveal.create',
      input: {
        fact: { existingId: 'fact-1' },
        position: {
          chapter: { tempRef: 'chapterTemp' },
          beat: { tempRef: 'beatTemp' },
        },
        safeDirectives: [],
      },
    });
    const breadcrumb = n({
      schemaVersion: 1,
      tempRef: 'crumbTemp',
      operationType: 'breadcrumb.create',
      input: {
        reveal: { existingId: 'reveal-1' },
        position: {
          chapter: { tempRef: 'chapterTemp' },
          beat: { tempRef: 'beatTemp' },
        },
        safeDirective: 'Earlier',
      },
    });
    const chapterReveal = n({
      schemaVersion: 1,
      tempRef: 'chapterReveal',
      operationType: 'reveal.create',
      input: {
        fact: { existingId: 'fact-1' },
        position: { chapter: { tempRef: 'chapterTemp' } },
        safeDirectives: [],
      },
    });
    const candidate = [...outline, reveal, breadcrumb, chapterReveal];
    const project = (input: readonly (typeof candidate)[number][]) =>
      resolveOperationValues(input, context('outline'))
        .nodes.filter((x) =>
          ['revealTemp', 'crumbTemp', 'chapterReveal'].includes(x.localRef),
        )
        .map((x) => [x.localRef, x.payload]);
    const expected = project(candidate);
    expect(project([...candidate].reverse())).toEqual(expected);
    expect(expected).toEqual(
      expect.arrayContaining([
        [
          'revealTemp',
          expect.objectContaining({
            chapterId: 'chapter-chapterTemp',
            beatId: 'beat-beatTemp',
            targetSequence: 0,
          }),
        ],
        [
          'crumbTemp',
          expect.objectContaining({
            chapterId: 'chapter-chapterTemp',
            beatId: 'beat-beatTemp',
            sequence: 0,
          }),
        ],
        [
          'chapterReveal',
          expect.objectContaining({
            chapterId: 'chapter-chapterTemp',
            targetSequence: 10,
          }),
        ],
      ]),
    );
  });

  it('seeds create collision identities from live and tombstone snapshots while allowing same raw ID across entity types', () => {
    const tombstone = {
      entityType: 'character' as const,
      entityId: 'reserved',
      exists: false,
      deleted: true,
      revision: null,
      parentId: null,
    };
    expect(() =>
      resolveOperationValues(
        [n(raw[1])],
        context('foundation', {
          snapshots: [...context().snapshots, tombstone],
          allocateId: () => 'reserved',
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_SUGGESTION',
        details: expect.objectContaining({
          entityType: 'character',
          entityId: 'reserved',
        }),
      }),
    );
    expect(() =>
      resolveOperationValues(
        [n(raw[1])],
        context('foundation', { allocateId: () => 'char-1' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    const crossType = resolveOperationValues(
      [n(raw[1])],
      context('foundation', { allocateId: () => 'fact-1' }),
    );
    expect(crossType.nodes[0]).toMatchObject({
      targetEntityType: 'character',
      targetId: 'fact-1',
    });
  });
});

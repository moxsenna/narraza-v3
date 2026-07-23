import { describe, expect, it } from 'vitest';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { resolveOperations } from './resolver.js';
import { context, HASH_A } from './test-fixtures.js';

const base = [
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

const binding = {
  sourceProseVersionId: 'old',
  repairedProseVersionId: 'prose_version-prose',
  extractionSourceProseVersionId: 'prose_version-prose',
} as const;

const extractionOperationInputs = {
  'fact.update': {
    target: { existingId: 'fact-1' },
    statement: 'Y',
    canonStatus: 'established',
    visibility: 'writer_safe',
    source: {
      kind: 'prose',
      evidence: {
        proseVersionRef: { existingId: 'pv-1' },
        proseContentHash: HASH_A,
        startUtf16: 0,
        endUtf16: 1,
      },
    },
  },
  'state.append': {
    target: { existingId: 'char-1' },
    stateKey: 'place',
    value: 'arsip',
    evidence: {
      proseVersionRef: { existingId: 'pv-1' },
      proseContentHash: HASH_A,
      startUtf16: 0,
      endUtf16: 1,
    },
  },
  'belief.append': {
    target: { existingId: 'char-1' },
    fact: { existingId: 'fact-1' },
    level: 'known',
    evidence: {
      proseVersionRef: { existingId: 'pv-1' },
      proseContentHash: HASH_A,
      startUtf16: 0,
      endUtf16: 1,
    },
  },
  'disclosure.append': {
    target: { existingId: 'fact-1' },
    event: { kind: 'disclose', result: 'known' },
    evidence: {
      proseVersionRef: { existingId: 'pv-1' },
      proseContentHash: HASH_A,
      startUtf16: 0,
      endUtf16: 1,
    },
  },
} as const;

describe('repair re-extraction', () => {
  it('accepts full re-extraction from repaired candidate prose', () => {
    const result = resolveOperations(base, context('repair', { repairBinding: binding }));
    expect(result.operations.at(-1)?.payload).toEqual({
      kind: 'prose.accept',
      proseVersionId: 'prose_version-prose',
    });
    expect(result.operations.find((o) => o.operationType === 'fact.create')?.payload).toMatchObject(
      {
        source: {
          kind: 'prose',
          evidence: { proseVersionId: 'prose_version-prose' },
        },
      },
    );
  });

  it.each([
    undefined,
    { ...binding, repairedProseVersionId: 'old' },
    { ...binding, extractionSourceProseVersionId: 'old' },
    { ...binding, repairedProseVersionId: 'wrong' },
  ])('rejects invalid binding %#', (repairBinding) =>
    expect(() =>
      resolveOperations(base, context('repair', { repairBinding })),
    ).toThrowError(expect.objectContaining({ code: 'REPAIR_REEXTRACTION_REQUIRED' })),
  );

  it('rejects planner_only fact before allocation', () => {
    const bad = base.map((d) =>
      d.operationType === 'fact.create' && d.payload.kind === 'fact.create'
        ? { ...d, payload: { ...d.payload, visibility: 'planner_only' as const } }
        : d,
    );
    expect(() =>
      resolveOperations(
        bad,
        context('repair', {
          repairBinding: binding,
          allocateId: () => {
            throw new Error('allocator must not run');
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'OPERATION_NOT_ALLOWED' }));
  });

  it.each(['fact.create', 'fact.update'] as const)(
    '%s requires prose source with exactly repaired prose evidence',
    (operationType) => {
      const target = operationType === 'fact.update' ? { target: { existingId: 'fact-1' } } : {};
      const foundationFact = n({
        schemaVersion: 1,
        tempRef: 'factCheck',
        operationType,
        input: {
          ...target,
          statement: 'X',
          canonStatus: 'draft',
          visibility: 'writer_safe',
          source: { kind: 'foundation' },
        },
      });
      const mismatchedFact = n({
        schemaVersion: 1,
        tempRef: 'factCheck',
        operationType,
        input: {
          ...target,
          statement: 'X',
          canonStatus: 'draft',
          visibility: 'writer_safe',
          source: {
            kind: 'prose',
            evidence: {
              proseVersionRef: { existingId: 'pv-1' },
              proseContentHash: HASH_A,
              startUtf16: 0,
              endUtf16: 1,
            },
          },
        },
      });
      expect(() =>
        resolveOperations(
          [base[0]!, foundationFact, base[2]!],
          context('repair', { repairBinding: binding }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'REPAIR_REEXTRACTION_REQUIRED',
          details: expect.objectContaining({ reason: 'fact_source_not_repaired_prose' }),
        }),
      );
      expect(() =>
        resolveOperations(
          [base[0]!, mismatchedFact, base[2]!],
          context('repair', { repairBinding: binding }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'REPAIR_REEXTRACTION_REQUIRED',
          details: expect.objectContaining({ reason: 'fact_source_not_repaired_prose' }),
        }),
      );
    },
  );

  it('requires at least one re-extracted fact', () =>
    expect(() =>
      resolveOperations([base[0]!, base[2]!], context('repair', { repairBinding: binding })),
    ).toThrowError(
      expect.objectContaining({
        code: 'REPAIR_REEXTRACTION_REQUIRED',
        details: expect.objectContaining({ reason: 'missing_fact_reextraction' }),
      }),
    ));

  it.each(Object.entries(extractionOperationInputs))(
    '%s rejects source prose evidence during repair',
    (operationType, input) => {
      const candidate = [
        base[0]!,
        n({
          schemaVersion: 1,
          tempRef: 'extract',
          operationType: operationType as keyof typeof extractionOperationInputs,
          input,
        }),
        base[2]!,
      ];
      expect(() =>
        resolveOperations(candidate, context('repair', { repairBinding: binding })),
      ).toThrowError(expect.objectContaining({ code: 'REPAIR_REEXTRACTION_REQUIRED' }));
    },
  );

  it('rejects old run, other candidate, old accept, and unproduced repaired ID', () => {
    const oldRun = context('repair', {
      repairBinding: binding,
      snapshots: context().snapshots.map((s) =>
        s.entityType === 'prose_version' ? { ...s, extractionRunId: 'old-run' } : s,
      ),
    });
    expect(() => resolveOperations(base, oldRun)).toThrowError(
      expect.objectContaining({ code: 'REPAIR_REEXTRACTION_REQUIRED' }),
    );
    const otherCandidate = context('repair', {
      repairBinding: binding,
      snapshots: context().snapshots.map((s) =>
        s.entityType === 'prose_version' ? { ...s, candidateId: 'other' } : s,
      ),
    });
    expect(() => resolveOperations(base, otherCandidate)).toThrowError(
      expect.objectContaining({ code: 'REPAIR_REEXTRACTION_REQUIRED' }),
    );
    const oldAccept = [
      base[0]!,
      base[1]!,
      n({
        schemaVersion: 1,
        tempRef: 'accept',
        operationType: 'prose.accept',
        input: {
          target: { existingId: 'beat-1' },
          proseVersion: { existingId: 'pv-1' },
        },
      }),
    ];
    expect(() =>
      resolveOperations(oldAccept, context('repair', { repairBinding: binding })),
    ).toThrowError(expect.objectContaining({ code: 'PROSE_ACCEPT_REQUIRED' }));
    expect(() =>
      resolveOperations(
        base,
        context('repair', {
          repairBinding: {
            ...binding,
            repairedProseVersionId: 'not-produced',
            extractionSourceProseVersionId: 'not-produced',
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'REPAIR_REEXTRACTION_REQUIRED' }));
  });

  it.each([
    ['candidateId', 'old-candidate'],
    ['extractionRunId', 'old-run'],
  ] as const)(
    'maps consumed existing evidence with old %s to re-extraction required',
    (field, value) => {
      const consumed = n({
        schemaVersion: 1,
        tempRef: 'factUpdate',
        operationType: 'fact.update',
        input: extractionOperationInputs['fact.update'],
      });
      const candidate = [base[0]!, consumed, base[2]!];
      const snapshots = context().snapshots.map((s) =>
        s.entityType === 'prose_version' && s.entityId === 'pv-1'
          ? { ...s, [field]: value }
          : s,
      );
      expect(() =>
        resolveOperations(
          candidate,
          context('repair', { repairBinding: binding, snapshots }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'REPAIR_REEXTRACTION_REQUIRED' }));
    },
  );

  it.each([
    { proseContentHash: 'b'.repeat(64), startUtf16: 0, endUtf16: 1 },
    { proseContentHash: HASH_A, startUtf16: 0, endUtf16: 2 },
  ] as const)(
    'keeps consumed evidence hash/range failures typed INVALID_PROSE_EVIDENCE_BINDING',
    (evidence) => {
      const input = {
        ...extractionOperationInputs['fact.update'],
        source: {
          kind: 'prose' as const,
          evidence: {
            ...extractionOperationInputs['fact.update'].source.evidence,
            ...evidence,
          },
        },
      };
      const candidate = [
        base[0]!,
        n({
          schemaVersion: 1,
          tempRef: 'factUpdate',
          operationType: 'fact.update',
          input,
        }),
        base[2]!,
      ];
      expect(() =>
        resolveOperations(candidate, context('repair', { repairBinding: binding })),
      ).toThrowError(
        expect.objectContaining({ code: 'INVALID_PROSE_EVIDENCE_BINDING' }),
      );
    },
  );
});

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveProseEvidence } from './evidence.js';
import { buildSnapshotIndex } from './snapshot.js';
import { context, existing, temporary } from './test-fixtures.js';

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const prose = 'A😀B';
const ctx = context('beat.write', {
  snapshots: [
    {
      entityType: 'prose_version',
      entityId: 'pv',
      exists: true,
      deleted: false,
      revision: 0,
      parentId: null,
      candidateId: 'candidate-1',
      extractionRunId: 'run-1',
      content: prose,
      contentHash: hash(prose),
      beatId: 'beat-1',
    },
  ],
});

describe('prose evidence binding', () => {
  it('binds exact UTF-16 range', () =>
    expect(
      resolveProseEvidence(
        {
          proseVersionRef: existing('prose_version', 'pv'),
          proseContentHash: hash(prose),
          startUtf16: 1,
          endUtf16: 3,
        },
        buildSnapshotIndex(ctx.snapshots),
        new Map(),
        ctx,
      ),
    ).toEqual({
      proseVersionId: 'pv',
      proseContentHash: hash(prose),
      startUtf16: 1,
      endUtf16: 3,
    }));

  it.each([
    [-1, 1],
    [2, 1],
    [0, 5],
    [0, 1.5],
  ])('rejects range %s..%s', (startUtf16, endUtf16) =>
    expect(() =>
      resolveProseEvidence(
        {
          proseVersionRef: existing('prose_version', 'pv'),
          proseContentHash: hash(prose),
          startUtf16,
          endUtf16,
        },
        buildSnapshotIndex(ctx.snapshots),
        new Map(),
        ctx,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PROSE_EVIDENCE_BINDING' })),
  );

  it('resolves same-candidate temporary producer', () =>
    expect(
      resolveProseEvidence(
        {
          proseVersionRef: temporary('prose_version', 'make'),
          proseContentHash: hash('A'),
          startUtf16: 0,
          endUtf16: 1,
        },
        buildSnapshotIndex([]),
        new Map([
          [
            'make',
            {
              id: 'prose_version-make',
              beatId: 'beat-1',
              content: 'A',
              contentHash: hash('A'),
            },
          ],
        ]),
        context(),
      ),
    ).toMatchObject({ proseVersionId: 'prose_version-make' }));
});

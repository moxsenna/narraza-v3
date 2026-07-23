import { describe, expect, it } from 'vitest';
import { buildSnapshotIndex } from './snapshot.js';

const base = {
  entityType: 'character',
  entityId: 'c1',
  exists: true,
  deleted: false,
  revision: 0,
  parentId: null,
} as const;

describe('snapshot validation', () => {
  it('rejects duplicate entity identity', () =>
    expect(() => buildSnapshotIndex([base, { ...base, revision: 1 }])).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_SNAPSHOT' }),
    ));
  it.each([
    null,
    7,
    'snapshot',
    { ...base, exists: false, deleted: false, revision: 0 },
    { ...base, exists: true, deleted: true, revision: 0 },
    { ...base, entityType: 'mystery' },
    { entityType: 'character', entityId: 'c1', exists: true, deleted: false, parentId: null },
    {
      ...base,
      entityType: 'prose_version',
      content: 'A',
      contentHash: 'a'.repeat(64),
      candidateId: 'c',
      extractionRunId: 'r',
    },
    { ...base, entityType: 'roadmap' },
    { ...base, entityType: 'arc', parentId: 'roadmap-1', ordinal: 0, nextOrdinal: 0 },
    {
      ...base,
      entityType: 'chapter',
      parentId: 'arc-1',
      ordinal: 0,
      narrativeSequence: 1,
      nextOrdinal: 0,
    },
    { ...base, entityType: 'beat', parentId: 'chapter-1', narrativeSequence: 1 },
    { ...base, entityType: 'fact' },
  ])('rejects malformed, unknown, or entity-incomplete snapshot %# before resolution', (snapshot) =>
    expect(() => buildSnapshotIndex([snapshot] as never)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SNAPSHOT' }),
    ),
  );
  it('requires every live outline counter and node ordinal', () => {
    expect(() =>
      buildSnapshotIndex([
        {
          entityType: 'roadmap',
          entityId: 'r',
          exists: true,
          deleted: false,
          revision: 0,
          parentId: null,
          nextOrdinal: 0,
          nextNarrativeSequence: 0,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      buildSnapshotIndex([
        {
          entityType: 'arc',
          entityId: 'a',
          exists: true,
          deleted: false,
          revision: 0,
          parentId: 'r',
          ordinal: 0,
          nextOrdinal: 0,
          nextNarrativeSequence: 0,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      buildSnapshotIndex([
        {
          entityType: 'chapter',
          entityId: 'c',
          exists: true,
          deleted: false,
          revision: 0,
          parentId: 'a',
          ordinal: 0,
          narrativeSequence: 0,
          nextOrdinal: 0,
          nextNarrativeSequence: 0,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      buildSnapshotIndex([
        {
          entityType: 'beat',
          entityId: 'b',
          exists: true,
          deleted: false,
          revision: 0,
          parentId: 'c',
          ordinal: 0,
          narrativeSequence: 0,
        },
      ]),
    ).not.toThrow();
  });
  it('accepts explicit missing/deleted tombstone only without live fields', () =>
    expect(
      buildSnapshotIndex([
        {
          entityType: 'fact',
          entityId: 'gone',
          exists: false,
          deleted: true,
          revision: null,
          parentId: null,
        },
      ]).size,
    ).toBe(1));
});

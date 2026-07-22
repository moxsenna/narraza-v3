import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildDependencyManifest,
  dependencyKey,
  dependencyManifestHash,
  DependencyManifestError,
  type DependencyEntry,
} from './dependency-manifest.js';

const HASH_A = 'a'.repeat(64);
const entries: DependencyEntry[] = [
  { entityType: 'fact', entityId: 'fact-1', revision: 7, contentHash: HASH_A, deleted: true },
  { entityType: 'beat', entityId: 'beat-2', revision: 3, deleted: false },
];

const expectManifestError = (action: () => unknown, code = 'INVALID_DEPENDENCY') => {
  expect(action).toThrow(DependencyManifestError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ name: 'DependencyManifestError', code });
  }
};

const blocked = (): never => {
  throw new Error('blocked');
};

describe('dependency manifest', () => {
  it('validates entries and sorts by entityType then entityId using code-unit order', () => {
    const input = [
      { entityType: '\ue000', entityId: 'z', revision: 0, deleted: false },
      { entityType: 'fact', entityId: '𐐷', revision: 2, deleted: false },
      { entityType: 'fact', entityId: 'z', revision: 1, deleted: true },
      { entityType: 'beat', entityId: 'b', revision: Number.MAX_SAFE_INTEGER, deleted: false },
    ];

    expect(buildDependencyManifest(input)).toEqual([
      { entityType: 'beat', entityId: 'b', revision: Number.MAX_SAFE_INTEGER, deleted: false },
      { entityType: 'fact', entityId: 'z', revision: 1, deleted: true },
      { entityType: 'fact', entityId: '𐐷', revision: 2, deleted: false },
      { entityType: '\ue000', entityId: 'z', revision: 0, deleted: false },
    ]);
  });

  it('rejects duplicate entityType/entityId tuples regardless of other fields', () => {
    expectManifestError(
      () =>
        buildDependencyManifest([
          { entityType: 'fact', entityId: '1', revision: 0, deleted: false },
          { entityType: 'fact', entityId: '1', revision: 9, contentHash: HASH_A, deleted: true },
        ]),
      'DUPLICATE_DEPENDENCY',
    );
  });

  it('returns a frozen defensive manifest with frozen owned entries', () => {
    const input = [{ entityType: 'fact', entityId: '1', revision: 0, deleted: false }];
    const manifest = buildDependencyManifest(input);
    input[0]!.entityId = 'changed';

    expect(manifest).toEqual([{ entityType: 'fact', entityId: '1', revision: 0, deleted: false }]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest[0])).toBe(true);
    expect(manifest[0]).not.toBe(input[0]);
    expect(() => (manifest as DependencyEntry[]).push(entries[0]!)).toThrow(TypeError);
    expect(() => ((manifest[0] as { revision: number }).revision = 2)).toThrow(TypeError);
  });

  it.each([
    null,
    1,
    Array(1),
    Object.assign([...entries], { extra: true }),
    [{ ...entries[0], extra: true }],
    [Object.defineProperty({ ...entries[0] }, 'revision', { get: () => 0, enumerable: true })],
    [{ ...entries[0], entityType: '' }],
    [{ ...entries[0], entityId: '' }],
    [{ ...entries[0], revision: '0' }],
    [{ ...entries[0], revision: -1 }],
    [{ ...entries[0], revision: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...entries[0], deleted: 0 }],
    [{ ...entries[0], contentHash: 'ABC' }],
    [{ ...entries[0], contentHash: 'a'.repeat(63) }],
  ])('rejects malformed manifest input %# with typed errors', (input) => {
    expectManifestError(() => buildDependencyManifest(input));
    expectManifestError(() => dependencyManifestHash(input));
  });

  it('rejects accessors without reading them', () => {
    let reads = 0;
    const entry = Object.defineProperty({ ...entries[0] }, 'revision', {
      get: () => {
        reads += 1;
        return 0;
      },
      enumerable: true,
    });

    expectManifestError(() => buildDependencyManifest([entry]));
    expectManifestError(() => dependencyManifestHash([entry]));
    expect(reads).toBe(0);
  });

  it.each([
    new Proxy([], { ownKeys: blocked }),
    [new Proxy({ ...entries[0] }, { ownKeys: blocked })],
    [new Proxy({ ...entries[0] }, { getOwnPropertyDescriptor: blocked })],
  ])('translates proxy reflection failures into DependencyManifestError %#', (input) => {
    expectManifestError(() => buildDependencyManifest(input));
    expectManifestError(() => dependencyManifestHash(input));
  });

  it('translates canonical serialization failures at manifest and hash boundaries', () => {
    const invalidUnicode = [
      { entityType: 'fact\ud800', entityId: '1', revision: 0, deleted: false },
    ];

    expectManifestError(() => buildDependencyManifest(invalidUnicode));
    expectManifestError(() => dependencyManifestHash(invalidUnicode));
  });
});

describe('dependencyKey', () => {
  it('is an exact public boundary with an unambiguous canonical tuple key', () => {
    expect(dependencyKey({ entityType: 'fact', entityId: 'fact-1' })).toBe('["fact","fact-1"]');
    expect(dependencyKey({ entityType: 'a:b', entityId: 'c' })).not.toBe(
      dependencyKey({ entityType: 'a', entityId: 'b:c' }),
    );
  });

  it.each([
    null,
    1,
    { entityType: 'fact', entityId: '1', extra: true },
    { entityType: 'fact', entityId: 3 },
    { entityType: '', entityId: '1' },
    { entityType: 'fact', entityId: '' },
    Object.defineProperty({ entityId: '1' }, 'entityType', {
      get: () => 'fact',
      enumerable: true,
    }),
    new Proxy({ entityType: 'fact', entityId: '1' }, { ownKeys: blocked }),
    { entityType: 'fact\ud800', entityId: '1' },
  ])('rejects malformed or hostile input %# with typed errors', (input) => {
    expectManifestError(() => dependencyKey(input));
  });
});

describe('dependency manifest hash', () => {
  it('hashes exact version prefix and canonical sorted entries as lowercase SHA-256', () => {
    const canonicalEntries =
      '[{"deleted":false,"entityId":"beat-2","entityType":"beat","revision":3},{"contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","deleted":true,"entityId":"fact-1","entityType":"fact","revision":7}]';
    const payload = `narraza-dependency-manifest:v1\n${canonicalEntries}`;

    expect(dependencyManifestHash(entries)).toBe(
      '7b817bf323bda8898bb164d614e7730a4b79ba8392bfbd1851264f25123f6b24',
    );
    expect(dependencyManifestHash(entries)).toBe(
      createHash('sha256').update(payload, 'utf8').digest('hex'),
    );
    expect(dependencyManifestHash(entries)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable under manifest permutation and excludes unrelated global version state', () => {
    const first = dependencyManifestHash(entries);
    const unrelatedGlobalCanonicalVersion = 99;
    const second = dependencyManifestHash([...entries].reverse());

    expect(unrelatedGlobalCanonicalVersion).toBe(99);
    expect(second).toBe(first);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { dependencyKey, type DependencyEntry } from './dependency-manifest.js';
import {
  evaluateDependencyStatus,
  StalePolicyError,
  type DependencyApplicability,
} from './stale-policy.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const factKey = dependencyKey({ entityType: 'fact', entityId: 'fact-1' });
const beatKey = dependencyKey({ entityType: 'beat', entityId: 'beat-1' });
const characterKey = dependencyKey({ entityType: 'character', entityId: 'character-1' });

const proposal: readonly DependencyEntry[] = [
  { entityType: 'fact', entityId: 'fact-1', revision: 1, contentHash: HASH_A, deleted: false },
  { entityType: 'beat', entityId: 'beat-1', revision: 2, deleted: false },
];
const valid: DependencyApplicability = {
  targetExists: true,
  targetDeleted: false,
  targetIdentityUnchanged: true,
  expectedRevisionMatches: true,
  relevantDependencyKeys: [factKey],
};

const expectStalePolicyError = (action: () => unknown) => {
  expect(action).toThrow(StalePolicyError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({
      name: 'StalePolicyError',
      code: 'INVALID_DEPENDENCY_APPLICABILITY',
    });
  }
};

const blocked = (): never => {
  throw new Error('blocked');
};

describe('evaluateDependencyStatus truth table', () => {
  it('returns current with an immutable result for identical manifests', () => {
    const result = evaluateDependencyStatus([...proposal].reverse(), proposal, valid);

    expect(result).toEqual({ status: 'current', changedDependencyKeys: [] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.changedDependencyKeys)).toBe(true);
    expect(() => (result.changedDependencyKeys as string[]).push(factKey)).toThrow(TypeError);
  });

  it.each([
    {
      label: 'missing target',
      applicability: {
        ...valid,
        targetExists: false,
        targetIdentityUnchanged: false,
        expectedRevisionMatches: false,
      },
    },
    {
      label: 'deleted target',
      applicability: { ...valid, targetDeleted: true, expectedRevisionMatches: false },
    },
    {
      label: 'changed target identity',
      applicability: { ...valid, targetIdentityUnchanged: false },
    },
    {
      label: 'target revision mismatch',
      applicability: { ...valid, expectedRevisionMatches: false },
    },
  ])('returns stale for $label', ({ applicability }) => {
    expect(evaluateDependencyStatus(proposal, proposal, applicability)).toEqual({
      status: 'stale',
      changedDependencyKeys: [],
    });
  });

  it.each([
    {
      label: 'revision changed',
      current: [{ ...proposal[0]!, revision: 2 }, proposal[1]!],
    },
    {
      label: 'content hash changed',
      current: [{ ...proposal[0]!, contentHash: HASH_B }, proposal[1]!],
    },
    {
      label: 'deleted flag changed',
      current: [{ ...proposal[0]!, deleted: true }, proposal[1]!],
    },
    {
      label: 'relevant dependency removed',
      current: [proposal[1]!],
    },
  ])('returns needs_revalidation when relevant dependency $label', ({ current }) => {
    expect(evaluateDependencyStatus(proposal, current, valid)).toEqual({
      status: 'needs_revalidation',
      changedDependencyKeys: [factKey],
    });
  });

  it('returns needs_revalidation when a newly added dependency is declared relevant', () => {
    const added = {
      entityType: 'character',
      entityId: 'character-1',
      revision: 0,
      deleted: false,
    };

    expect(
      evaluateDependencyStatus(proposal, [...proposal, added], {
        ...valid,
        relevantDependencyKeys: [characterKey],
      }),
    ).toEqual({ status: 'needs_revalidation', changedDependencyKeys: [characterKey] });
  });

  it('returns current when only irrelevant dependencies changed', () => {
    const current = [
      { ...proposal[0]!, revision: 2 },
      { ...proposal[1]!, revision: 3 },
    ];

    expect(
      evaluateDependencyStatus(proposal, current, {
        ...valid,
        relevantDependencyKeys: [],
      }),
    ).toEqual({ status: 'current', changedDependencyKeys: [beatKey, factKey] });
  });

  it('returns changed dependency tuple keys in stable code-unit order', () => {
    const before = [
      { entityType: '\ue000', entityId: '1', revision: 0, deleted: false },
      { entityType: '𐐷', entityId: '1', revision: 0, deleted: false },
      { entityType: 'a', entityId: '1', revision: 0, deleted: false },
    ];
    const current = before.map((entry) => ({ ...entry, revision: 1 })).reverse();
    const expected = before
      .map(({ entityType, entityId }) => dependencyKey({ entityType, entityId }))
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

    expect(
      evaluateDependencyStatus(before, current, {
        ...valid,
        relevantDependencyKeys: [],
      }).changedDependencyKeys,
    ).toEqual(expected);
  });

  it('does not accept or inspect a global canonical version argument', () => {
    expect(evaluateDependencyStatus(proposal, proposal, valid)).toEqual({
      status: 'current',
      changedDependencyKeys: [],
    });
    expect(evaluateDependencyStatus).toHaveLength(3);
  });
});

describe('evaluateDependencyStatus fail-closed boundaries', () => {
  it.each([
    null,
    1,
    { ...valid, extra: true },
    { ...valid, targetExists: 'yes' },
    { ...valid, targetDeleted: 0 },
    { ...valid, targetIdentityUnchanged: 1 },
    { ...valid, expectedRevisionMatches: null },
    { ...valid, relevantDependencyKeys: Array(1) },
    { ...valid, relevantDependencyKeys: [''] },
    { ...valid, relevantDependencyKeys: [1] },
    { ...valid, relevantDependencyKeys: Object.assign([factKey], { extra: true }) },
    Object.defineProperty({ ...valid }, 'targetExists', {
      get: () => true,
      enumerable: true,
    }),
    new Proxy({ ...valid }, { ownKeys: blocked }),
    { ...valid, relevantDependencyKeys: [new Proxy([], { ownKeys: blocked })] },
  ])('rejects hostile applicability %#', (applicability) => {
    expectStalePolicyError(() => evaluateDependencyStatus(proposal, proposal, applicability));
  });

  it.each([
    { ...valid, relevantDependencyKeys: [factKey, factKey] },
    { ...valid, relevantDependencyKeys: [characterKey] },
    { ...valid, relevantDependencyKeys: ['not-a-canonical-tuple'] },
  ])('rejects duplicate or unknown relevant keys %#', (applicability) => {
    expectStalePolicyError(() => evaluateDependencyStatus(proposal, proposal, applicability));
  });

  it.each([
    { ...valid, targetExists: false },
    {
      ...valid,
      targetExists: false,
      targetDeleted: true,
      targetIdentityUnchanged: false,
      expectedRevisionMatches: false,
    },
    { ...valid, targetDeleted: true },
  ])('rejects contradictory target metadata %#', (applicability) => {
    expectStalePolicyError(() => evaluateDependencyStatus(proposal, proposal, applicability));
  });

  it.each([
    null,
    1,
    Array(1),
    [{ entityType: 'fact', entityId: 'future', revision: '2', deleted: false }],
    [{ entityType: 'fact\ud800', entityId: 'future', revision: 2, deleted: false }],
    [
      { entityType: 'fact', entityId: 'duplicate', revision: 1, deleted: false },
      { entityType: 'fact', entityId: 'duplicate', revision: 2, deleted: false },
    ],
    new Proxy([], { ownKeys: blocked }),
  ])('translates bad proposal manifests %#', (manifest) => {
    expectStalePolicyError(() => evaluateDependencyStatus(manifest, proposal, valid));
  });

  it.each([
    null,
    1,
    Array(1),
    [{ entityType: 'fact', entityId: 'future', revision: '2', deleted: false }],
    [{ entityType: 'fact\ud800', entityId: 'future', revision: 2, deleted: false }],
    new Proxy([], { ownKeys: blocked }),
  ])('translates bad current manifests %#', (manifest) => {
    expectStalePolicyError(() => evaluateDependencyStatus(proposal, manifest, valid));
  });

  it('validates applicability before normalizing or comparing valid manifests', () => {
    const badApplicability = { ...valid, relevantDependencyKeys: ['valid', 3] };
    const sort = vi.spyOn(Array.prototype, 'sort');

    try {
      expect(() =>
        evaluateDependencyStatus([...proposal].reverse(), proposal, badApplicability),
      ).toThrowError('relevantDependencyKeys[1] must be a non-empty string');
      expect(sort).not.toHaveBeenCalled();
    } finally {
      sort.mockRestore();
    }
  });

  it('translates malformed manifests and applicability to owned errors before evaluation', () => {
    const badProposal = new Proxy([], { ownKeys: blocked });
    const badCurrent = new Proxy([], { ownKeys: blocked });
    const badApplicability = new Proxy({ ...valid }, { ownKeys: blocked });

    expectStalePolicyError(() =>
      evaluateDependencyStatus(badProposal, badCurrent, badApplicability),
    );
  });
});

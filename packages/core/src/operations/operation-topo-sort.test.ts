import { describe, expect, it } from 'vitest';
import { stableTopologicalSort } from './topo-sort.js';

const nodes = [
  {
    localRef: 'b',
    operationType: 'fact.create',
    targetEntityType: 'fact',
    targetId: '2',
  },
  {
    localRef: 'a',
    operationType: 'character.create',
    targetEntityType: 'character',
    targetId: '1',
  },
  {
    localRef: 'c',
    operationType: 'belief.append',
    targetEntityType: 'character',
    targetId: '1',
  },
] as const;

describe('stable topological sort', () => {
  it('sorts ready queue by operationType/entityType/targetId/localRef', () =>
    // belief.append < character.create < fact.create by code-unit order
    expect(stableTopologicalSort(nodes, []).map((x) => x.localRef)).toEqual(['c', 'a', 'b']));

  it('deduplicates edges and rejects missing/self/cycle stably', () => {
    expect(
      stableTopologicalSort(nodes, [
        { before: 'a', after: 'c' },
        { before: 'a', after: 'c' },
      ]).map((x) => x.localRef),
    ).toEqual(['a', 'c', 'b']);
    expect(() => stableTopologicalSort(nodes, [{ before: 'x', after: 'a' }])).toThrowError(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' }),
    );
    expect(() => stableTopologicalSort(nodes, [{ before: 'a', after: 'a' }])).toThrowError(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' }),
    );
    expect(() =>
      stableTopologicalSort(nodes, [
        { before: 'a', after: 'c' },
        { before: 'c', after: 'a' },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: 'DEPENDENCY_CYCLE',
        details: { cycleNodeIds: ['a', 'c'] },
      }),
    );
  });
});

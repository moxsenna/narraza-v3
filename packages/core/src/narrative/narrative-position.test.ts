import { describe, expect, it } from 'vitest';
import { hostileObjects } from '../validation/hostile-fixtures.test.js';
import {
  compareNarrativePositions,
  createNarrativePosition,
  NarrativePositionError,
  narrativePositionsEqual,
} from './position.js';

const valid = { chapterId: 'c1', sequence: 0 };

describe('narrative position', () => {
  it('orders chronology by sequence before chapter and beat identifiers', () => {
    expect(
      compareNarrativePositions(
        { chapterId: 'z', beatId: 'z', sequence: 1 },
        { chapterId: 'a', beatId: 'a', sequence: 2 },
      ),
    ).toBeLessThan(0);
    expect(
      compareNarrativePositions(
        { chapterId: 'a', beatId: 'z', sequence: 1 },
        { chapterId: 'b', beatId: 'a', sequence: 1 },
      ),
    ).toBeLessThan(0);
    expect(
      compareNarrativePositions(
        { chapterId: 'a', beatId: 'a', sequence: 1 },
        { chapterId: 'a', beatId: 'b', sequence: 1 },
      ),
    ).toBeLessThan(0);
  });

  it('compares equality across all position components', () => {
    expect(narrativePositionsEqual(valid, { ...valid })).toBe(true);
    expect(
      narrativePositionsEqual(
        { chapterId: 'c1', sequence: 0 },
        { chapterId: 'c1', beatId: 'b1', sequence: 0 },
      ),
    ).toBe(false);
    expect(
      narrativePositionsEqual(
        { chapterId: 'c1', beatId: 'b1', sequence: 0 },
        { chapterId: 'c1', beatId: 'b2', sequence: 0 },
      ),
    ).toBe(false);
    expect(narrativePositionsEqual(valid, { chapterId: 'c1', sequence: 1 })).toBe(false);
  });

  it('creates a validated immutable-shape position copy', () => {
    const input = { chapterId: 'c1', beatId: 'b1', sequence: 3 };

    expect(createNarrativePosition(input)).toEqual(input);
    expect(createNarrativePosition(input)).not.toBe(input);
  });

  it.each([
    ...hostileObjects({ chapterId: 'c1', sequence: 0 }).slice(0, -1),
    { chapterId: 'c1', sequence: -1 },
    { chapterId: 3, sequence: 0 },
    { chapterId: 'c1', beatId: '', sequence: 0 },
  ])('rejects hostile position %# with owned error', (input) => {
    expect(() => createNarrativePosition(input)).toThrow(NarrativePositionError);
    expect(() => createNarrativePosition(input)).not.toThrow(TypeError);
    expect(() => compareNarrativePositions(input, valid)).toThrow(NarrativePositionError);
    expect(() => narrativePositionsEqual(valid, input)).toThrow(NarrativePositionError);
  });
});

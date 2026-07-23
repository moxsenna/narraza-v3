import {
  exactObject,
  nonEmptyString,
  nonNegativeSafeInteger,
  type Fail,
} from '../validation/exact.js';

export interface NarrativePosition {
  readonly chapterId: string;
  readonly beatId?: string;
  readonly sequence: number;
}
export class NarrativePositionError extends Error {
  readonly code = 'INVALID_NARRATIVE_POSITION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'NarrativePositionError';
  }
}
const fail: Fail = (message) => {
  throw new NarrativePositionError(message);
};
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function parsePosition(input: unknown): NarrativePosition {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      return fail('position must be object');
    const keys = Reflect.ownKeys(input);
    const expected = keys.includes('beatId')
      ? ['chapterId', 'beatId', 'sequence']
      : ['chapterId', 'sequence'];
    const value = exactObject(input, expected, fail, 'position');
    const chapterId = nonEmptyString(value.chapterId, fail, 'chapterId');
    const sequence = nonNegativeSafeInteger(value.sequence, fail, 'sequence');
    if (!expected.includes('beatId')) return Object.freeze({ chapterId, sequence });
    return Object.freeze({
      chapterId,
      beatId: nonEmptyString(value.beatId, fail, 'beatId'),
      sequence,
    });
  } catch (error) {
    if (error instanceof NarrativePositionError) throw error;
    return fail('position reflection failed');
  }
}
function compareTyped(left: NarrativePosition, right: NarrativePosition): number {
  return (
    left.sequence - right.sequence ||
    compareText(left.chapterId, right.chapterId) ||
    compareText(left.beatId ?? '', right.beatId ?? '')
  );
}
export const createNarrativePosition = (input: unknown): NarrativePosition => parsePosition(input);
export function compareNarrativePositions(left: unknown, right: unknown): number {
  const parsedLeft = parsePosition(left);
  const parsedRight = parsePosition(right);
  return compareTyped(parsedLeft, parsedRight);
}
export function narrativePositionsEqual(left: unknown, right: unknown): boolean {
  const parsedLeft = parsePosition(left);
  const parsedRight = parsePosition(right);
  return compareTyped(parsedLeft, parsedRight) === 0;
}

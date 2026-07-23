import { denseArray, exactObject, nonEmptyString, type Fail } from '../validation/exact.js';
import { createNarrativePosition, type NarrativePosition } from './position.js';

export interface RevealBreadcrumb {
  readonly id: string;
  readonly position: NarrativePosition;
  readonly safeDirective: string;
}
export interface RevealPolicyInput {
  readonly targetPosition: NarrativePosition;
  readonly currentPosition: NarrativePosition;
  readonly breadcrumbs: readonly RevealBreadcrumb[];
  readonly safeDirectives: readonly string[];
  readonly restrictedGuardSet: {
    readonly prohibitedExact: readonly string[];
    readonly prohibitedAliases: readonly string[];
    readonly sensitiveTerms: readonly string[];
  };
}
export interface WriterRevealGuidance {
  readonly status: 'before_breadcrumb' | 'breadcrumb_due' | 'hold' | 'reveal_due' | 'revealed';
  readonly safeDirectives: readonly string[];
}
export interface RestrictedRevealGuardSet {
  readonly prohibitedExact: readonly string[];
  readonly prohibitedAliases: readonly string[];
  readonly sensitiveTerms: readonly string[];
  readonly targetPosition: NarrativePosition;
}
export interface RevealViews {
  readonly guidance: WriterRevealGuidance;
  readonly restrictedGuardSet: RestrictedRevealGuardSet;
}
export class RevealPolicyError extends Error {
  readonly code = 'INVALID_REVEAL_POLICY_INPUT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RevealPolicyError';
  }
}

const fail: Fail = (message) => {
  throw new RevealPolicyError(message);
};
const stringArray = (value: unknown, label: string): readonly string[] =>
  denseArray(value, fail, label).map((item, index) =>
    nonEmptyString(item, fail, `${label}[${index}]`),
  );
const position = (value: unknown, label: string): NarrativePosition => {
  try {
    return createNarrativePosition(value);
  } catch {
    return fail(`${label} is invalid`);
  }
};
const comparePosition = (left: NarrativePosition, right: NarrativePosition): number =>
  left.sequence - right.sequence ||
  (left.chapterId < right.chapterId ? -1 : left.chapterId > right.chapterId ? 1 : 0) ||
  ((left.beatId ?? '') < (right.beatId ?? '')
    ? -1
    : (left.beatId ?? '') > (right.beatId ?? '')
      ? 1
      : 0);

function parseReveal(input: unknown): RevealPolicyInput {
  try {
    const root = exactObject(
      input,
      ['targetPosition', 'currentPosition', 'breadcrumbs', 'safeDirectives', 'restrictedGuardSet'],
      fail,
      'reveal input',
    );
    const targetPosition = position(root.targetPosition, 'targetPosition');
    const currentPosition = position(root.currentPosition, 'currentPosition');
    const breadcrumbs = denseArray(root.breadcrumbs, fail, 'breadcrumbs').map((raw, index) => {
      const item = exactObject(
        raw,
        ['id', 'position', 'safeDirective'],
        fail,
        `breadcrumbs[${index}]`,
      );
      return {
        id: nonEmptyString(item.id, fail, `breadcrumbs[${index}].id`),
        position: position(item.position, `breadcrumbs[${index}].position`),
        safeDirective: nonEmptyString(
          item.safeDirective,
          fail,
          `breadcrumbs[${index}].safeDirective`,
        ),
      };
    });
    const guard = exactObject(
      root.restrictedGuardSet,
      ['prohibitedExact', 'prohibitedAliases', 'sensitiveTerms'],
      fail,
      'restrictedGuardSet',
    );
    const parsed: RevealPolicyInput = {
      targetPosition,
      currentPosition,
      breadcrumbs,
      safeDirectives: stringArray(root.safeDirectives, 'safeDirectives'),
      restrictedGuardSet: {
        prohibitedExact: stringArray(guard.prohibitedExact, 'prohibitedExact'),
        prohibitedAliases: stringArray(guard.prohibitedAliases, 'prohibitedAliases'),
        sensitiveTerms: stringArray(guard.sensitiveTerms, 'sensitiveTerms'),
      },
    };
    const ids = new Set<string>();
    const positions = new Set<string>();
    for (const breadcrumb of parsed.breadcrumbs) {
      const key = `${breadcrumb.position.sequence}\0${breadcrumb.position.chapterId}\0${breadcrumb.position.beatId ?? ''}`;
      if (
        ids.has(breadcrumb.id) ||
        positions.has(key) ||
        comparePosition(breadcrumb.position, parsed.targetPosition) >= 0
      ) {
        return fail('breadcrumbs must have unique IDs/positions before target');
      }
      ids.add(breadcrumb.id);
      positions.add(key);
    }
    return parsed;
  } catch (error) {
    if (error instanceof RevealPolicyError) throw error;
    return fail('reveal input reflection failed');
  }
}

function decideReveal(input: RevealPolicyInput): RevealViews {
  const breadcrumbs = [...input.breadcrumbs].sort(
    (left, right) =>
      comparePosition(left.position, right.position) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const due = breadcrumbs.find(
    (item) => comparePosition(item.position, input.currentPosition) === 0,
  );
  const targetOrder = comparePosition(input.currentPosition, input.targetPosition);
  const status: WriterRevealGuidance['status'] =
    targetOrder === 0
      ? 'reveal_due'
      : targetOrder > 0
        ? 'revealed'
        : due
          ? 'breadcrumb_due'
          : breadcrumbs[0] && comparePosition(input.currentPosition, breadcrumbs[0].position) < 0
            ? 'before_breadcrumb'
            : 'hold';
  return Object.freeze({
    guidance: Object.freeze({
      status,
      safeDirectives: Object.freeze(
        due ? [...input.safeDirectives, due.safeDirective] : [...input.safeDirectives],
      ),
    }),
    restrictedGuardSet: Object.freeze({
      prohibitedExact: Object.freeze([...input.restrictedGuardSet.prohibitedExact]),
      prohibitedAliases: Object.freeze([...input.restrictedGuardSet.prohibitedAliases]),
      sensitiveTerms: Object.freeze([...input.restrictedGuardSet.sensitiveTerms]),
      targetPosition: input.targetPosition,
    }),
  });
}

export const buildRevealViews = (input: unknown): RevealViews => decideReveal(parseReveal(input));

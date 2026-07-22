import { describe, expect, it } from 'vitest';
import { hostileObjects } from '../validation/hostile-fixtures.test.js';
import { buildRevealViews, RevealPolicyError } from './reveal-policy.js';

const position = (sequence: number, chapterId = `c${sequence}`, beatId?: string) =>
  beatId === undefined ? { chapterId, sequence } : { chapterId, beatId, sequence };

const validReveal = {
  targetPosition: position(10, 'target'),
  currentPosition: position(3),
  breadcrumbs: [
    { id: 'first', position: position(2), safeDirective: 'Notice the locked drawer.' },
    { id: 'second', position: position(6), safeDirective: 'Mention the missing key.' },
  ],
  safeDirectives: ['Keep the cause ambiguous.'],
  restrictedGuardSet: {
    prohibitedExact: ['The steward forged the will.'],
    prohibitedAliases: ['the forger'],
    sensitiveTerms: ['steward'],
  },
};

describe('reveal policy', () => {
  it.each([
    [position(1), 'before_breadcrumb'],
    [position(2), 'breadcrumb_due'],
    [position(3), 'hold'],
    [position(10, 'target'), 'reveal_due'],
    [position(11), 'revealed'],
  ] as const)('reports chronology at current position %#', (currentPosition, status) => {
    expect(buildRevealViews({ ...validReveal, currentPosition }).guidance.status).toBe(status);
  });

  it('adds only the due breadcrumb directive to writer-safe guidance', () => {
    const result = buildRevealViews({ ...validReveal, currentPosition: position(2) });

    expect(result.guidance.safeDirectives).toEqual([
      'Keep the cause ambiguous.',
      'Notice the locked drawer.',
    ]);
  });

  it('keeps restricted truth out of writer guidance and returns defensive arrays', () => {
    const result = buildRevealViews(validReveal);

    expect(JSON.stringify(result.guidance)).not.toContain('steward');
    expect(JSON.stringify(result.guidance)).not.toContain('forger');
    expect(result.restrictedGuardSet).toEqual({
      ...validReveal.restrictedGuardSet,
      targetPosition: validReveal.targetPosition,
    });
    expect(result.guidance.safeDirectives).not.toBe(validReveal.safeDirectives);
    expect(result.restrictedGuardSet.prohibitedExact).not.toBe(
      validReveal.restrictedGuardSet.prohibitedExact,
    );
    expect(result.restrictedGuardSet.prohibitedAliases).not.toBe(
      validReveal.restrictedGuardSet.prohibitedAliases,
    );
    expect(result.restrictedGuardSet.sensitiveTerms).not.toBe(
      validReveal.restrictedGuardSet.sensitiveTerms,
    );
  });

  it('deep-freezes both public reveal views', () => {
    const result = buildRevealViews(validReveal);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.guidance)).toBe(true);
    expect(Object.isFrozen(result.guidance.safeDirectives)).toBe(true);
    expect(Object.isFrozen(result.restrictedGuardSet)).toBe(true);
    expect(Object.isFrozen(result.restrictedGuardSet.prohibitedExact)).toBe(true);
    expect(Object.isFrozen(result.restrictedGuardSet.prohibitedAliases)).toBe(true);
    expect(Object.isFrozen(result.restrictedGuardSet.sensitiveTerms)).toBe(true);
    expect(Object.isFrozen(result.restrictedGuardSet.targetPosition)).toBe(true);
    expect(() => (result.guidance.safeDirectives as string[]).push('changed')).toThrow(TypeError);
    expect(
      () =>
        ((result.restrictedGuardSet.targetPosition as { chapterId: string }).chapterId = 'changed'),
    ).toThrow(TypeError);
  });

  it('is stable when breadcrumb input order changes', () => {
    const chronological = buildRevealViews({ ...validReveal, currentPosition: position(2) });
    const permuted = buildRevealViews({
      ...validReveal,
      currentPosition: position(2),
      breadcrumbs: [...validReveal.breadcrumbs].reverse(),
    });

    expect(permuted).toEqual(chronological);
  });

  it.each([
    [
      {
        ...validReveal,
        breadcrumbs: [validReveal.breadcrumbs[0], { ...validReveal.breadcrumbs[1], id: 'first' }],
      },
      'duplicate breadcrumb ID',
    ],
    [
      {
        ...validReveal,
        breadcrumbs: [
          validReveal.breadcrumbs[0],
          { ...validReveal.breadcrumbs[1], position: { ...validReveal.breadcrumbs[0].position } },
        ],
      },
      'duplicate breadcrumb position',
    ],
    [
      {
        ...validReveal,
        breadcrumbs: [
          ...validReveal.breadcrumbs,
          { id: 'at-target', position: validReveal.targetPosition, safeDirective: 'Too late.' },
        ],
      },
      'breadcrumb at target',
    ],
    [
      {
        ...validReveal,
        breadcrumbs: [
          ...validReveal.breadcrumbs,
          { id: 'after-target', position: position(11), safeDirective: 'Too late.' },
        ],
      },
      'breadcrumb after target',
    ],
  ])('rejects %s', (input) => {
    expect(() => buildRevealViews(input)).toThrow(RevealPolicyError);
  });

  it('parses every breadcrumb before checking uniqueness or chronology', () => {
    const malformedLaterBreadcrumb = {
      id: 'later',
      position: position(7),
      get safeDirective(): never {
        throw new Error('later breadcrumb inspected');
      },
    };

    expect(() =>
      buildRevealViews({
        ...validReveal,
        breadcrumbs: [
          validReveal.breadcrumbs[0],
          { ...validReveal.breadcrumbs[1], id: 'first' },
          malformedLaterBreadcrumb,
        ],
      }),
    ).toThrowError('breadcrumbs[2].safeDirective must be an enumerable data property');
  });

  it('parses directives and guards before checking breadcrumb invariants', () => {
    expect(() =>
      buildRevealViews({
        ...validReveal,
        breadcrumbs: [validReveal.breadcrumbs[0], { ...validReveal.breadcrumbs[1], id: 'first' }],
        restrictedGuardSet: { ...validReveal.restrictedGuardSet, sensitiveTerms: ['valid', 3] },
      }),
    ).toThrowError('sensitiveTerms[1] must be a non-empty string');
  });

  it('validates all input before making a revealed decision', () => {
    expect(() =>
      buildRevealViews({
        ...validReveal,
        currentPosition: position(11),
        safeDirectives: ['valid', 3],
      }),
    ).toThrow(RevealPolicyError);
  });

  it.each([
    ...hostileObjects(validReveal).slice(0, -1),
    { ...validReveal, targetPosition: { chapterId: 'target', sequence: 'future' } },
    { ...validReveal, currentPosition: { chapterId: '', sequence: 3 } },
    { ...validReveal, breadcrumbs: Array(1) },
    { ...validReveal, breadcrumbs: ['wrong'] },
    { ...validReveal, safeDirectives: ['ok', 1] },
    {
      ...validReveal,
      restrictedGuardSet: { ...validReveal.restrictedGuardSet, extra: true },
    },
    {
      ...validReveal,
      restrictedGuardSet: { ...validReveal.restrictedGuardSet, prohibitedExact: Array(1) },
    },
    {
      ...validReveal,
      breadcrumbs: [
        { id: 'x', position: { chapterId: 'c', sequence: 'future' }, safeDirective: 'x' },
      ],
    },
  ])('rejects hostile boundary %# with owned error', (input) => {
    expect(() => buildRevealViews(input)).toThrow(RevealPolicyError);
    expect(() => buildRevealViews(input)).not.toThrow(TypeError);
    try {
      buildRevealViews(input);
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_REVEAL_POLICY_INPUT' });
    }
  });
});

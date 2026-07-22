import { describe, expect, it } from 'vitest';
import { hostileObjects } from '../validation/hostile-fixtures.test.js';
import { decideExpression, ExpressionPolicyError } from './expression-policy.js';

const validExpression = {
  knowsFact: true,
  revealAllows: true,
  disclosureAllows: true,
  isPov: true,
  behavioralDirectives: ['Avoid eye contact.', 'Change the subject.'],
};

describe('expression policy', () => {
  it.each([
    [{ ...validExpression, knowsFact: false }, 'unknown', []],
    [{ ...validExpression, revealAllows: false }, 'must_conceal', []],
    [{ ...validExpression, disclosureAllows: false }, 'must_conceal', []],
    [{ ...validExpression, isPov: false }, 'behavior_only', validExpression.behavioralDirectives],
    [validExpression, 'may_state', []],
  ] as const)('applies precedence for decision %#', (input, permission, safeDirectives) => {
    expect(decideExpression(input)).toEqual({ permission, safeDirectives });
  });

  it('uses defensive behavioral directives only for non-POV behavior', () => {
    const result = decideExpression({ ...validExpression, isPov: false });

    expect(result.safeDirectives).toEqual(validExpression.behavioralDirectives);
    expect(result.safeDirectives).not.toBe(validExpression.behavioralDirectives);
  });

  it('validates decision-irrelevant fields before applying precedence', () => {
    expect(() =>
      decideExpression({
        ...validExpression,
        knowsFact: false,
        behavioralDirectives: [3],
      }),
    ).toThrow(ExpressionPolicyError);
  });

  it.each([
    ...hostileObjects(validExpression).slice(0, -1),
    { ...validExpression, behavioralDirectives: Array(1) },
    { ...validExpression, behavioralDirectives: ['ok', 1] },
    { ...validExpression, knowsFact: false, behavioralDirectives: [3] },
    { ...validExpression, knowsFact: 1 },
    { ...validExpression, revealAllows: 'yes' },
    { ...validExpression, disclosureAllows: null },
    { ...validExpression, isPov: undefined },
  ])('rejects hostile/decision-irrelevant input %# with owned error', (input) => {
    expect(() => decideExpression(input)).toThrow(ExpressionPolicyError);
    expect(() => decideExpression(input)).not.toThrow(TypeError);
    try {
      decideExpression(input);
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_EXPRESSION_POLICY_INPUT' });
    }
  });
});

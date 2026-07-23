import {
  booleanValue,
  denseArray,
  exactObject,
  nonEmptyString,
  type Fail,
} from '../validation/exact.js';

export type ExpressionPermission = 'may_state' | 'behavior_only' | 'must_conceal' | 'unknown';
export interface ExpressionPolicyInput {
  readonly knowsFact: boolean;
  readonly revealAllows: boolean;
  readonly disclosureAllows: boolean;
  readonly isPov: boolean;
  readonly behavioralDirectives: readonly string[];
}
export interface ExpressionDecision {
  readonly permission: ExpressionPermission;
  readonly safeDirectives: readonly string[];
}
export type ExpressionPolicyErrorCode = 'INVALID_EXPRESSION_POLICY_INPUT';
export class ExpressionPolicyError extends Error {
  constructor(
    readonly code: ExpressionPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExpressionPolicyError';
  }
}

const expressionFail: Fail = (message) => {
  throw new ExpressionPolicyError('INVALID_EXPRESSION_POLICY_INPUT', message);
};

function parseExpression(input: unknown): ExpressionPolicyInput {
  try {
    const value = exactObject(
      input,
      ['knowsFact', 'revealAllows', 'disclosureAllows', 'isPov', 'behavioralDirectives'],
      expressionFail,
      'expression input',
    );
    const behavioralDirectives = denseArray(
      value.behavioralDirectives,
      expressionFail,
      'behavioralDirectives',
    ).map((directive, index) =>
      nonEmptyString(directive, expressionFail, `behavioralDirectives[${index}]`),
    );
    return {
      knowsFact: booleanValue(value.knowsFact, expressionFail, 'knowsFact'),
      revealAllows: booleanValue(value.revealAllows, expressionFail, 'revealAllows'),
      disclosureAllows: booleanValue(value.disclosureAllows, expressionFail, 'disclosureAllows'),
      isPov: booleanValue(value.isPov, expressionFail, 'isPov'),
      behavioralDirectives,
    };
  } catch (error) {
    if (error instanceof ExpressionPolicyError) throw error;
    return expressionFail('expression reflection failed');
  }
}

function frozenDecision(
  permission: ExpressionPermission,
  safeDirectives: readonly string[] = [],
): ExpressionDecision {
  return Object.freeze({ permission, safeDirectives: Object.freeze([...safeDirectives]) });
}

function decideExpressionTyped(input: ExpressionPolicyInput): ExpressionDecision {
  if (!input.knowsFact) return frozenDecision('unknown');
  if (!input.revealAllows || !input.disclosureAllows) return frozenDecision('must_conceal');
  if (!input.isPov) return frozenDecision('behavior_only', input.behavioralDirectives);
  return frozenDecision('may_state');
}

export const decideExpression = (input: unknown): ExpressionDecision =>
  decideExpressionTyped(parseExpression(input));

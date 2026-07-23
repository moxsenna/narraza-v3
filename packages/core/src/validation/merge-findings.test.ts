import { describe, expect, it } from 'vitest';
import { createFinding, type InternalValidationFinding } from './finding.js';
import { mergeFindings } from './merge-findings.js';

const draft = (
  source: 'deterministic' | 'model',
  severity: 'info' | 'warning' | 'error' | 'blocking',
  ruleKey = 'rule.a',
) =>
  createFinding({
    source,
    severity,
    ruleKey,
    publicMessageCode: `message.${severity}`,
    location: { startUtf16: 2, endUtf16: 4 },
  });

describe('mergeFindings', () => {
  it('keeps deterministic finding unchanged on model collision', () => {
    const deterministic = draft('deterministic', 'blocking');
    const result = mergeFindings([deterministic], [draft('model', 'info')]);
    expect(result.findings).toEqual([deterministic]);
    expect(result.passed).toBe(false);
  });

  it('rejects duplicate deterministic finding keys as a policy bug', () => {
    const finding = draft('deterministic', 'error');
    expect(() => mergeFindings([finding, finding], [])).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_DETERMINISTIC_FINDING' }),
    );
  });

  it('keeps highest model severity then canonical-smallest value on ties', () => {
    const warning = draft('model', 'warning');
    const errorZ = { ...draft('model', 'error'), publicMessageCode: 'z' };
    const errorA = { ...errorZ, publicMessageCode: 'a' };
    expect(mergeFindings([], [warning, errorZ, errorA]).findings).toEqual([errorA]);
  });

  it('sorts severity descending, rule, numeric location, findingKey and is permutation-stable', () => {
    const values = [
      draft('model', 'warning', 'z'),
      draft('deterministic', 'blocking', 'b'),
      draft('model', 'blocking', 'a'),
    ];
    const first = mergeFindings(
      values.filter((f) => f.source === 'deterministic'),
      values.filter((f) => f.source === 'model'),
    );
    const second = mergeFindings(
      [...values].reverse().filter((f) => f.source === 'deterministic'),
      [...values].reverse().filter((f) => f.source === 'model'),
    );
    expect(first).toEqual(second);
    expect(first.findings.map((f) => f.ruleKey)).toEqual(['a', 'b', 'z']);

    const atTen = createFinding({
      source: 'model',
      severity: 'error',
      ruleKey: 'same',
      publicMessageCode: 'ten',
      location: { startUtf16: 10, endUtf16: 12 },
    });
    const atTwoLong = createFinding({
      source: 'model',
      severity: 'error',
      ruleKey: 'same',
      publicMessageCode: 'two-long',
      location: { startUtf16: 2, endUtf16: 9 },
    });
    const atTwoShort = createFinding({
      source: 'model',
      severity: 'error',
      ruleKey: 'same',
      publicMessageCode: 'two-short',
      location: { startUtf16: 2, endUtf16: 3 },
    });
    expect(
      mergeFindings([], [atTen, atTwoLong, atTwoShort]).findings.map((f) => f.publicMessageCode),
    ).toEqual(['two-short', 'two-long', 'ten']);
  });

  it('returns deep-copied frozen findings and frozen array', () => {
    const normalizedTerms = ['secret'];
    const original = createFinding({
      source: 'model',
      severity: 'warning',
      ruleKey: 'restricted.semantic_gap',
      publicMessageCode: 'semantic',
      restrictedDetail: {
        guardKey: 'g',
        status: 'requires_semantic_review',
        matchedText: null,
        normalizedTerms,
      },
    });
    const result = mergeFindings([], [original]);
    expect(result.findings[0]).not.toBe(original);
    expect(Object.isFrozen(result.findings)).toBe(true);
    expect(Object.isFrozen(result.findings[0]?.restrictedDetail?.normalizedTerms)).toBe(true);
    expect(() => (result.findings as InternalValidationFinding[]).push(original)).toThrow(
      TypeError,
    );
  });

  it('passes with info/warning/error and fails only with blocking', () => {
    expect(mergeFindings([], [draft('model', 'error')]).passed).toBe(true);
    expect(mergeFindings([draft('deterministic', 'blocking')], []).passed).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  VALIDATOR_POLICY_VERSION,
  ValidatorError,
  createFinding,
  findingIdentity,
  validateFinding,
  validateValidatorPolicyVersion,
} from './finding.js';

const base = {
  source: 'deterministic' as const,
  ruleKey: 'beat.prose.empty',
  severity: 'blocking' as const,
  publicMessageCode: 'validation.prose.empty',
};

describe('finding identity', () => {
  it('excludes source and severity', () => {
    const deterministic = createFinding(base);
    const model = createFinding({ ...base, source: 'model', severity: 'info' });
    expect(model.findingKey).toBe(deterministic.findingKey);
  });

  it('includes normalized location and evidence hash-or-null', () => {
    const noEvidence = findingIdentity('rule', { startUtf16: 1, endUtf16: 3 }, undefined);
    const evidence = findingIdentity('rule', { startUtf16: 1, endUtf16: 3 }, 'a'.repeat(64));
    expect(noEvidence).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence).not.toBe(noEvidence);
  });
});

describe('finding runtime boundary', () => {
  it.each([
    null,
    [],
    new Date(),
    { ...base },
    { ...createFinding(base), source: 'other' },
    { ...createFinding(base), severity: 'fatal' },
    { ...createFinding(base), unknown: true },
    { ...createFinding(base), location: null },
    { ...createFinding(base), location: { startUtf16: 0, endUtf16: 2, unknown: true } },
    { ...createFinding(base), location: { startUtf16: -1, endUtf16: 2 } },
    { ...createFinding(base), evidenceHash: 'ABC' },
    { ...createFinding(base), findingKey: '0'.repeat(64) },
    { ...createFinding(base), restrictedDetail: [] },
    {
      ...createFinding(base),
      restrictedDetail: {
        guardKey: '',
        status: 'matched',
        matchedText: null,
        normalizedTerms: [],
      },
    },
    {
      ...createFinding(base),
      restrictedDetail: {
        guardKey: 'g',
        status: 'other',
        matchedText: null,
        normalizedTerms: [],
      },
    },
    {
      ...createFinding(base),
      restrictedDetail: {
        guardKey: 'g',
        status: 'matched',
        matchedText: 1,
        normalizedTerms: [],
      },
    },
    {
      ...createFinding(base),
      restrictedDetail: {
        guardKey: 'g',
        status: 'matched',
        matchedText: null,
        normalizedTerms: [1],
      },
    },
  ])('rejects malformed unknown input without leaking native TypeError: %#', (value) => {
    let thrown: unknown;
    try {
      validateFinding(value);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidatorError);
    expect(thrown).toMatchObject({ code: 'INVALID_FINDING' });
  });

  it('deep-copies and freezes nested structures', () => {
    const location = { startUtf16: 1, endUtf16: 4 };
    const normalizedTerms = ['raw', 'truth'];
    const finding = createFinding({
      ...base,
      location,
      restrictedDetail: {
        guardKey: 'secret',
        status: 'matched',
        matchedText: 'raw truth',
        normalizedTerms,
      },
    });
    location.startUtf16 = 99;
    normalizedTerms.push('mutated');
    expect(finding.location).toEqual({ startUtf16: 1, endUtf16: 4 });
    expect(finding.restrictedDetail?.normalizedTerms).toEqual(['raw', 'truth']);
    expect(Object.isFrozen(finding)).toBe(true);
    expect(Object.isFrozen(finding.location)).toBe(true);
    expect(Object.isFrozen(finding.restrictedDetail)).toBe(true);
    expect(Object.isFrozen(finding.restrictedDetail?.normalizedTerms)).toBe(true);
    expect(() => (finding.restrictedDetail!.normalizedTerms as string[]).push('x')).toThrow(
      TypeError,
    );
  });

  it('rejects unsupported policy versions with typed error', () => {
    expect(validateValidatorPolicyVersion(VALIDATOR_POLICY_VERSION)).toBeUndefined();
    expect(() => validateValidatorPolicyVersion('validator:v2')).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_POLICY_VERSION' }),
    );
    expect(new ValidatorError('INVALID_FINDING', 'bad').name).toBe('ValidatorError');
  });
});

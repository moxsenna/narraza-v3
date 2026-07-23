import { describe, expect, it } from 'vitest';
import type { RestrictedGuard } from '../context/packet-types.js';
import { matchRestrictedRepresentations, normalizeRestrictedText } from './restricted-matcher.js';

const guard: RestrictedGuard = {
  guardKey: 'fact:killer',
  prohibitedExact: ['Raka adalah pembunuh'],
  prohibitedAliases: ['si algojo'],
  coOccurrenceGroups: [['Raka', 'pisau']],
  proximityGroups: [['ruang', 'rahasia']],
  semanticReviewRequired: true,
};

describe('restricted matcher', () => {
  it('normalizes NFKC, lowercase, punctuation/whitespace, and Unicode tokens', () => {
    expect(normalizeRestrictedText('  ＲＡＫＡ—Pembunuh!\n')).toEqual({
      text: 'raka pembunuh',
      tokens: ['raka', 'pembunuh'],
    });
  });

  it('matches exact and alias only on token boundaries with blocking severity', () => {
    const exact = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: 'Ternyata RAKA—ADALAH pembunuh.',
      guards: [guard],
    });
    expect(exact.some((f) => f.ruleKey === 'restricted.exact' && f.severity === 'blocking')).toBe(
      true,
    );
    const alias = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: 'Ia si algojo itu.',
      guards: [guard],
    });
    expect(alias.some((f) => f.ruleKey === 'restricted.alias' && f.severity === 'blocking')).toBe(
      true,
    );
    const boundary = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: 'Nama Rakana berbeda.',
      guards: [guard],
    });
    expect(boundary.some((f) => f.ruleKey === 'restricted.exact')).toBe(false);
  });

  it('keeps original UTF-16 location internally without exposing match in public fields', () => {
    const [finding] = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: '😀 si algojo.',
      guards: [guard],
    });
    expect(finding?.location).toEqual({ startUtf16: 3, endUtf16: 12 });
    expect(finding?.restrictedDetail?.matchedText).toBe('si algojo');
    expect(finding?.publicMessageCode).toBe('validation.restricted.alias');
  });

  it('maps whole-string NFKC matches across decomposed combining sequences', () => {
    const combiningGuard: RestrictedGuard = {
      ...guard,
      prohibitedExact: ['café'],
      prohibitedAliases: [],
      coOccurrenceGroups: [],
      proximityGroups: [],
      semanticReviewRequired: false,
    };
    const [finding] = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: 'cafe\u0301',
      guards: [combiningGuard],
    });
    expect(finding?.location).toEqual({ startUtf16: 0, endUtf16: 5 });
    expect(finding?.restrictedDetail?.matchedText).toBe('cafe\u0301');
  });

  it('maps compatibility expansion back to one original UTF-16 span', () => {
    const expansionGuard: RestrictedGuard = {
      ...guard,
      prohibitedExact: ['リットル'],
      prohibitedAliases: [],
      coOccurrenceGroups: [],
      proximityGroups: [],
      semanticReviewRequired: false,
    };
    const [finding] = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: '㍑',
      guards: [expansionGuard],
    });
    expect(finding?.location).toEqual({ startUtf16: 0, endUtf16: 1 });
    expect(finding?.restrictedDetail?.matchedText).toBe('㍑');
  });
});

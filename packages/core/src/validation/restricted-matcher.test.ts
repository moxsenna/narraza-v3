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

  it('marks co-occurrence in one sentence as suspected error', () => {
    const findings = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: 'Raka masuk. Pisau itu hilang. Raka menggenggam pisau.',
      guards: [guard],
    });
    expect(
      findings.some(
        (f) =>
          f.ruleKey === 'restricted.co_occurrence' &&
          f.severity === 'error' &&
          f.restrictedDetail?.status === 'suspected',
      ),
    ).toBe(true);
  });

  it('uses an inclusive maximum 20-token proximity window', () => {
    const within = `ruang ${Array.from({ length: 18 }, (_, i) => `kata${i}`).join(' ')} rahasia`;
    const outside = `ruang ${Array.from({ length: 19 }, (_, i) => `kata${i}`).join(' ')} rahasia`;
    expect(
      matchRestrictedRepresentations({
        policyVersion: 'validator:v1',
        prose: within,
        guards: [guard],
      }).some((f) => f.ruleKey === 'restricted.proximity'),
    ).toBe(true);
    expect(
      matchRestrictedRepresentations({
        policyVersion: 'validator:v1',
        prose: outside,
        guards: [guard],
      }).some((f) => f.ruleKey === 'restricted.proximity'),
    ).toBe(false);
  });

  it('finds a later valid proximity window after an early out-of-window occurrence, independent of term order', () => {
    const far = Array.from({ length: 19 }, (_, i) => `jauh${i}`).join(' ');
    const prose = `ruang ${far} rahasia lalu rahasia dekat ruang`;
    const findings = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose,
      guards: [guard],
    });
    const proximity = findings.find((finding) => finding.ruleKey === 'restricted.proximity');
    expect(proximity?.restrictedDetail?.matchedText).toBe('rahasia dekat ruang');
  });

  it('emits semantic-review warning only when no lexical evidence matched', () => {
    const findings = matchRestrictedRepresentations({
      policyVersion: 'validator:v1',
      prose: 'Tidak ada bukti leksikal.',
      guards: [guard],
    });
    expect(findings.map((f) => [f.ruleKey, f.severity, f.restrictedDetail?.status])).toEqual([
      ['restricted.semantic_gap', 'warning', 'requires_semantic_review'],
    ]);
  });

  it.each([
    null,
    [],
    new Date(),
    { policyVersion: 'validator:v1', prose: 'x', guards: [guard], unknown: true },
    { policyVersion: 'validator:v1', prose: 1, guards: [guard] },
    { policyVersion: 'validator:v1', prose: 'x', guards: [, guard] },
    { policyVersion: 'validator:v1', prose: 'x', guards: Object.assign([guard], { extra: true }) },
    { policyVersion: 'validator:v1', prose: 'x', guards: [null] },
    { policyVersion: 'validator:v1', prose: 'x', guards: [{ ...guard, unknown: true }] },
    { policyVersion: 'validator:v1', prose: 'x', guards: [{ ...guard, prohibitedExact: [' '] }] },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      guards: [{ ...guard, prohibitedExact: Object.assign(['secret'], { extra: true }) }],
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      guards: [{ ...guard, prohibitedExact: [, 'secret'] }],
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      guards: [
        {
          ...guard,
          prohibitedAliases: ['ＳＩ　ＡＬＧＯＪＯ'],
          prohibitedExact: ['si algojo'],
          coOccurrenceGroups: [],
          proximityGroups: [],
          semanticReviewRequired: false,
        },
      ],
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      guards: [{ ...guard, coOccurrenceGroups: [['only-one']] }],
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      guards: [{ ...guard, coOccurrenceGroups: [Object.assign(['a', 'b'], { extra: true })] }],
    },
    { policyVersion: 'validator:v1', prose: 'x', guards: [{ ...guard, proximityGroups: [null] }] },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      guards: [{ ...guard, semanticReviewRequired: 'yes' }],
    },
  ])(
    'rejects malformed unknown matcher input with typed error, never TypeError: %#',
    (malformed) => {
      let thrown: unknown;
      try {
        matchRestrictedRepresentations(malformed);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: 'INVALID_RESTRICTED_GUARD' });
      expect(thrown).not.toBeInstanceOf(TypeError);
    },
  );
});

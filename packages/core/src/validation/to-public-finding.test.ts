import { expect, it } from 'vitest';
import { createFinding } from './finding.js';
import { toPublicFinding } from './public-finding.js';

it('builds a fresh allowlisted object without restricted fields', () => {
  const internal = createFinding({
    source: 'deterministic',
    ruleKey: 'restricted.exact',
    severity: 'blocking',
    publicMessageCode: 'validation.restricted.exact',
    location: { startUtf16: 1, endUtf16: 4 },
    evidenceHash: 'a'.repeat(64),
    restrictedDetail: {
      guardKey: 'secret',
      status: 'matched',
      matchedText: 'raw truth',
      normalizedTerms: ['raw', 'truth'],
    },
  });
  const publicFinding = toPublicFinding(internal);
  expect(publicFinding).toEqual({
    findingKey: internal.findingKey,
    ruleKey: 'restricted.exact',
    severity: 'blocking',
    publicMessageCode: 'validation.restricted.exact',
    location: { startUtf16: 1, endUtf16: 4 },
  });
  expect(publicFinding).not.toBe(internal);
  expect(publicFinding.location).not.toBe(internal.location);
  expect(Object.isFrozen(publicFinding)).toBe(true);
  expect(Object.isFrozen(publicFinding.location)).toBe(true);
  expect(() => ((publicFinding.location as { startUtf16: number }).startUtf16 = 99)).toThrow(
    TypeError,
  );
  expect(JSON.stringify(publicFinding)).not.toMatch(
    /raw truth|evidenceHash|restrictedDetail|source/,
  );
});

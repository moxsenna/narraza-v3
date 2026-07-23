import type { RestrictedGuard } from '../context/packet-types.js';
import { canonicalSha256 } from '../dependency/canonical-json.js';
import {
  createFinding,
  validateValidatorPolicyVersion,
  ValidatorError,
  type InternalValidationFinding,
} from './finding.js';

export interface RestrictedMatcherInput {
  readonly policyVersion: string;
  readonly prose: string;
  readonly guards: readonly RestrictedGuard[];
}
export interface NormalizedRestrictedText {
  readonly text: string;
  readonly tokens: readonly string[];
}

interface SourceToken {
  readonly text: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
}
interface NormalizedWithSource extends NormalizedRestrictedText {
  readonly sourceTokens: readonly SourceToken[];
}

const assertWellFormed = (value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new ValidatorError('INVALID_RESTRICTED_GUARD', 'Text contains lone surrogate');
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new ValidatorError('INVALID_RESTRICTED_GUARD', 'Text contains lone surrogate');
    }
  }
};
const normalizeCore = (value: string): string => value.normalize('NFKC').toLowerCase();
const normalizeWithSource = (original: string): NormalizedWithSource => {
  assertWellFormed(original);
  const normalized = normalizeCore(original);
  const validPrefixes: { readonly originalOffset: number; readonly normalizedOffset: number }[] =
    [];
  for (let offset = 0; offset <= original.length; offset += 1) {
    const splitsSurrogatePair =
      offset > 0 &&
      offset < original.length &&
      original.charCodeAt(offset - 1) >= 0xd800 &&
      original.charCodeAt(offset - 1) <= 0xdbff &&
      original.charCodeAt(offset) >= 0xdc00 &&
      original.charCodeAt(offset) <= 0xdfff;
    if (!splitsSurrogatePair) {
      validPrefixes.push({
        originalOffset: offset,
        normalizedOffset: normalizeCore(original.slice(0, offset)).length,
      });
    }
  }
  const boundaries = [...new Set(validPrefixes.map((prefix) => prefix.normalizedOffset))].sort(
    (a, b) => a - b,
  );
  const boundaryRange = (normalizedOffset: number): readonly [number, number] => {
    const exact = validPrefixes
      .filter((prefix) => prefix.normalizedOffset === normalizedOffset)
      .map((prefix) => prefix.originalOffset);
    if (exact.length > 0) return [Math.min(...exact), Math.max(...exact)];
    const before =
      validPrefixes.filter((prefix) => prefix.normalizedOffset < normalizedOffset).at(-1)
        ?.originalOffset ?? 0;
    const after =
      validPrefixes.find((prefix) => prefix.normalizedOffset > normalizedOffset)?.originalOffset ??
      original.length;
    return [before, after];
  };
  const segments = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]!;
    const [startMin, startMax] = boundaryRange(start);
    const [endMin, endMax] = boundaryRange(end);
    return {
      normalizedStart: start,
      normalizedEnd: end,
      originalStart: Math.min(startMin, startMax),
      originalEnd: Math.max(endMin, endMax),
    };
  });
  const sourceTokens: SourceToken[] = [];
  for (const match of normalized.matchAll(/[\p{L}\p{N}]+/gu)) {
    const normalizedStart = match.index;
    const normalizedEnd = normalizedStart + match[0].length;
    const contributing = segments.filter(
      (segment) =>
        segment.normalizedEnd > normalizedStart && segment.normalizedStart < normalizedEnd,
    );
    sourceTokens.push({
      text: match[0],
      startUtf16: Math.min(...contributing.map((segment) => segment.originalStart)),
      endUtf16: Math.max(...contributing.map((segment) => segment.originalEnd)),
    });
  }
  const text = normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return Object.freeze({
    text,
    tokens: Object.freeze(sourceTokens.map((token) => token.text)),
    sourceTokens: Object.freeze(sourceTokens),
  });
};
export function normalizeRestrictedText(value: string): NormalizedRestrictedText {
  const normalized = normalizeWithSource(value);
  return Object.freeze({ text: normalized.text, tokens: normalized.tokens });
}
const phraseMatch = (
  tokens: readonly SourceToken[],
  phrase: readonly string[],
): { startUtf16: number; endUtf16: number } | undefined => {
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((term, offset) => tokens[start + offset]!.text === term)) {
      return {
        startUtf16: tokens[start]!.startUtf16,
        endUtf16: tokens[start + phrase.length - 1]!.endUtf16,
      };
    }
  }
  return undefined;
};
const lexicalFinding = (
  prose: string,
  guardKey: string,
  mode: 'exact' | 'alias',
  normalizedTerms: readonly string[],
  location: { readonly startUtf16: number; readonly endUtf16: number },
): InternalValidationFinding =>
  createFinding({
    source: 'deterministic',
    ruleKey: `restricted.${mode}`,
    severity: 'blocking',
    publicMessageCode: `validation.restricted.${mode}`,
    location,
    evidenceHash: canonicalSha256({ guardKey, mode, normalizedTerms }),
    restrictedDetail: {
      guardKey,
      status: 'matched',
      matchedText: prose.slice(location.startUtf16, location.endUtf16),
      normalizedTerms,
    },
  });

const invalidGuard = (message: string): never => {
  throw new ValidatorError('INVALID_RESTRICTED_GUARD', message);
};
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exactObject = (
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (!isPlainObject(value)) return invalidGuard(`${label} must be a plain object`);
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    return invalidGuard(`${label} must contain exact keys`);
  }
  return value;
};
const denseArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value))
    return invalidGuard(`${label} must be a dense array without extra keys`);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    return invalidGuard(`${label} must be a dense array without extra keys`);
  }
  return value;
};
const restrictedString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || [...value.trim()].length === 0) {
    return invalidGuard(`${label} must be non-empty`);
  }
  assertWellFormed(value);
  return value;
};
const normalizeTerm = (value: unknown, label = 'Restricted lexical value'): string => {
  const normalized = normalizeRestrictedText(restrictedString(value, label)).text;
  if (normalized.length === 0) return invalidGuard(`${label} normalizes empty`);
  return normalized;
};
const stringList = (value: unknown, label: string): readonly string[] =>
  denseArray(value, label).map((item, index) => restrictedString(item, `${label}[${index}]`));
const groupList = (value: unknown, label: string): readonly (readonly string[])[] =>
  denseArray(value, label).map((group, index) => {
    const terms = stringList(group, `${label}[${index}]`);
    if (terms.length < 2) return invalidGuard('Restricted term group requires at least two terms');
    const normalized = terms.map((term, termIndex) =>
      normalizeTerm(term, `${label}[${index}][${termIndex}]`),
    );
    if (new Set(normalized).size !== normalized.length) {
      return invalidGuard('Restricted term group contains duplicate terms');
    }
    return terms;
  });
const parseMatcherInput = (value: unknown): RestrictedMatcherInput => {
  const input = exactObject(
    value,
    ['policyVersion', 'prose', 'guards'],
    'Restricted matcher input',
  );
  if (typeof input.policyVersion !== 'string' || typeof input.prose !== 'string') {
    return invalidGuard('Restricted policyVersion and prose must be strings');
  }
  assertWellFormed(input.prose);
  denseArray(input.guards, 'guards').forEach((value, index) => {
    const label = `guards[${index}]`;
    const item = exactObject(
      value,
      [
        'guardKey',
        'prohibitedExact',
        'prohibitedAliases',
        'coOccurrenceGroups',
        'proximityGroups',
        'semanticReviewRequired',
      ],
      label,
    );
    restrictedString(item.guardKey, `${label}.guardKey`);
    stringList(item.prohibitedExact, `${label}.prohibitedExact`);
    stringList(item.prohibitedAliases, `${label}.prohibitedAliases`);
    groupList(item.coOccurrenceGroups, `${label}.coOccurrenceGroups`);
    groupList(item.proximityGroups, `${label}.proximityGroups`);
    if (typeof item.semanticReviewRequired !== 'boolean') {
      return invalidGuard(`${label}.semanticReviewRequired must be boolean`);
    }
  });
  return {
    policyVersion: input.policyVersion,
    prose: input.prose,
    guards: input.guards as readonly RestrictedGuard[],
  };
};
const validateGuards = (guards: readonly RestrictedGuard[]): void => {
  const guardKeys = new Set<string>();
  for (const guard of guards) {
    if (guardKeys.has(guard.guardKey)) return invalidGuard('Guard keys must be unique');
    guardKeys.add(guard.guardKey);
    const phrases = [...guard.prohibitedExact, ...guard.prohibitedAliases].map((term) =>
      normalizeTerm(term),
    );
    if (new Set(phrases).size !== phrases.length) {
      return invalidGuard('Normalized exact and alias phrases must be unique');
    }
    for (const groups of [guard.coOccurrenceGroups, guard.proximityGroups]) {
      const groupKeys = new Set<string>();
      for (const group of groups) {
        const terms = group.map((term) => normalizeTerm(term));
        const key = JSON.stringify([...terms].sort());
        if (groupKeys.has(key)) {
          return invalidGuard('Restricted term groups must be unique independent of order');
        }
        groupKeys.add(key);
      }
    }
  }
};
const MODE_POLICY = {
  coOccurrence: {
    ruleKey: 'restricted.co_occurrence',
    publicMessageCode: 'validation.restricted.suspected',
    severity: 'error',
    status: 'suspected',
  },
  proximity: {
    ruleKey: 'restricted.proximity',
    publicMessageCode: 'validation.restricted.suspected',
    severity: 'error',
    status: 'suspected',
  },
  semantic: {
    ruleKey: 'restricted.semantic_gap',
    publicMessageCode: 'validation.restricted.semantic_review',
    severity: 'warning',
    status: 'requires_semantic_review',
  },
} as const;
const modeFinding = (
  prose: string,
  guardKey: string,
  mode: keyof typeof MODE_POLICY,
  normalizedTerms: readonly string[],
  location?: { readonly startUtf16: number; readonly endUtf16: number },
): InternalValidationFinding => {
  const policy = MODE_POLICY[mode];
  return createFinding({
    source: 'deterministic',
    ruleKey: policy.ruleKey,
    publicMessageCode: policy.publicMessageCode,
    severity: policy.severity,
    ...(location === undefined ? {} : { location }),
    evidenceHash: canonicalSha256({ guardKey, mode, normalizedTerms }),
    restrictedDetail: {
      guardKey,
      status: policy.status,
      matchedText:
        location === undefined ? null : prose.slice(location.startUtf16, location.endUtf16),
      normalizedTerms,
    },
  });
};
const sentenceTokenGroups = (
  prose: string,
  tokens: readonly SourceToken[],
): readonly (readonly SourceToken[])[] => {
  const groups: SourceToken[][] = [];
  let startUtf16 = 0;
  for (const match of prose.matchAll(/[.!?\p{Sentence_Terminal}]+[^\p{L}\p{N}]*/gu)) {
    const endUtf16 = match.index + match[0].length;
    groups.push(
      tokens.filter((token) => token.startUtf16 >= startUtf16 && token.endUtf16 <= endUtf16),
    );
    startUtf16 = endUtf16;
  }
  if (startUtf16 < prose.length) {
    groups.push(tokens.filter((token) => token.startUtf16 >= startUtf16));
  }
  return groups;
};
const groupMatch = (
  tokens: readonly SourceToken[],
  terms: readonly string[],
  maxWindow?: number,
): { startUtf16: number; endUtf16: number } | undefined => {
  const required = new Set(terms);
  const counts = new Map<string, number>();
  let covered = 0;
  let left = 0;
  for (let right = 0; right < tokens.length; right += 1) {
    const rightText = tokens[right]!.text;
    if (required.has(rightText)) {
      const count = counts.get(rightText) ?? 0;
      counts.set(rightText, count + 1);
      if (count === 0) covered += 1;
    }
    while (covered === required.size) {
      const leftText = tokens[left]!.text;
      if (!required.has(leftText) || (counts.get(leftText) ?? 0) > 1) {
        if (required.has(leftText)) counts.set(leftText, counts.get(leftText)! - 1);
        left += 1;
        continue;
      }
      if (maxWindow === undefined || right - left + 1 <= maxWindow) {
        return { startUtf16: tokens[left]!.startUtf16, endUtf16: tokens[right]!.endUtf16 };
      }
      counts.set(leftText, 0);
      covered -= 1;
      left += 1;
    }
  }
  return undefined;
};

export function matchRestrictedRepresentations(
  value: unknown,
): readonly InternalValidationFinding[] {
  const input = parseMatcherInput(value);
  validateValidatorPolicyVersion(input.policyVersion);
  validateGuards(input.guards);
  const prose = normalizeWithSource(input.prose);
  const sentences = sentenceTokenGroups(input.prose, prose.sourceTokens);
  const findings: InternalValidationFinding[] = [];
  for (const guard of input.guards) {
    const guardFindings: InternalValidationFinding[] = [];
    for (const [mode, phrases] of [
      ['exact', guard.prohibitedExact],
      ['alias', guard.prohibitedAliases],
    ] as const) {
      for (const phrase of phrases) {
        const normalizedTerms = normalizeRestrictedText(phrase).tokens;
        const location = phraseMatch(prose.sourceTokens, normalizedTerms);
        if (location !== undefined) {
          guardFindings.push(
            lexicalFinding(input.prose, guard.guardKey, mode, normalizedTerms, location),
          );
        }
      }
    }
    for (const group of guard.coOccurrenceGroups) {
      const normalizedTerms = group.map((term) => normalizeTerm(term));
      const location = sentences
        .map((tokens) => groupMatch(tokens, normalizedTerms))
        .find((value) => value !== undefined);
      if (location !== undefined) {
        guardFindings.push(
          modeFinding(input.prose, guard.guardKey, 'coOccurrence', normalizedTerms, location),
        );
      }
    }
    for (const group of guard.proximityGroups) {
      const normalizedTerms = group.map((term) => normalizeTerm(term));
      const location = groupMatch(prose.sourceTokens, normalizedTerms, 20);
      if (location !== undefined) {
        guardFindings.push(
          modeFinding(input.prose, guard.guardKey, 'proximity', normalizedTerms, location),
        );
      }
    }
    if (guard.semanticReviewRequired && guardFindings.length === 0) {
      guardFindings.push(modeFinding(input.prose, guard.guardKey, 'semantic', []));
    }
    findings.push(...guardFindings);
  }
  const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  findings.sort(
    (a, b) =>
      (a.location?.startUtf16 ?? Number.POSITIVE_INFINITY) -
        (b.location?.startUtf16 ?? Number.POSITIVE_INFINITY) ||
      (a.location?.endUtf16 ?? Number.POSITIVE_INFINITY) -
        (b.location?.endUtf16 ?? Number.POSITIVE_INFINITY) ||
      compareText(a.ruleKey, b.ruleKey) ||
      compareText(a.findingKey, b.findingKey),
  );
  return Object.freeze(findings);
}

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

export function matchRestrictedRepresentations(
  input: RestrictedMatcherInput,
): readonly InternalValidationFinding[] {
  validateValidatorPolicyVersion(input.policyVersion);
  const prose = normalizeWithSource(input.prose);
  const findings: InternalValidationFinding[] = [];
  for (const guard of input.guards) {
    for (const phrase of guard.prohibitedExact) {
      const normalizedTerms = normalizeRestrictedText(phrase).tokens;
      const location = phraseMatch(prose.sourceTokens, normalizedTerms);
      if (location !== undefined) {
        findings.push(lexicalFinding(input.prose, guard.guardKey, 'exact', normalizedTerms, location));
      }
    }
    for (const phrase of guard.prohibitedAliases) {
      const normalizedTerms = normalizeRestrictedText(phrase).tokens;
      const location = phraseMatch(prose.sourceTokens, normalizedTerms);
      if (location !== undefined) {
        findings.push(lexicalFinding(input.prose, guard.guardKey, 'alias', normalizedTerms, location));
      }
    }
  }
  return Object.freeze(findings);
}

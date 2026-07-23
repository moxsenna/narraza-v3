import type { ValidatorBeatContract } from '../context/packet-types.js';
import { canonicalSha256 } from '../dependency/canonical-json.js';
import {
  createFinding,
  validateValidatorPolicyVersion,
  ValidatorError,
  type FindingSeverity,
  type InternalValidationFinding,
} from './finding.js';

export interface StructuralEvidenceEntry {
  readonly id: string;
  readonly lexicalEvidence: readonly string[];
}
export interface StructuralEvidence {
  readonly characters: readonly StructuralEvidenceEntry[];
  readonly facts: readonly StructuralEvidenceEntry[];
}
export interface StructuralValidationInput {
  readonly policyVersion: string;
  readonly prose: string;
  readonly contract: ValidatorBeatContract;
  readonly evidence: StructuralEvidence;
}

const RULES = {
  empty: ['beat.prose.empty', 'validation.prose.empty', 'blocking'],
  character: [
    'beat.required_character.missing',
    'validation.character.required_missing',
    'blocking',
  ],
  characterSemantic: [
    'beat.required_character.semantic_review',
    'validation.character.semantic_review',
    'warning',
  ],
  fact: ['beat.required_fact.missing', 'validation.fact.required_missing', 'blocking'],
  factSemantic: [
    'beat.required_fact.semantic_review',
    'validation.fact.semantic_review',
    'warning',
  ],
  directive: [
    'beat.required_directive.missing',
    'validation.directive.required_missing',
    'error',
  ],
  directiveSemantic: [
    'beat.required_directive.semantic_review',
    'validation.directive.semantic_review',
    'warning',
  ],
  prohibited: [
    'beat.prohibited_action.present',
    'validation.action.prohibited_present',
    'blocking',
  ],
  prohibitedSemantic: [
    'beat.prohibited_action.semantic_review',
    'validation.action.semantic_review',
    'warning',
  ],
  ending: ['beat.ending_requirement.missing', 'validation.ending.required_missing', 'error'],
  endingSemantic: [
    'beat.ending_requirement.semantic_review',
    'validation.ending.semantic_review',
    'warning',
  ],
  length: ['beat.length.out_of_range', 'validation.length.out_of_range', 'error'],
} as const satisfies Record<string, readonly [string, string, FindingSeverity]>;

const invalid = (message: string): never => {
  throw new ValidatorError('INVALID_BEAT_CONTRACT', message);
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
  if (!isPlainObject(value)) return invalid(`${label} must be a plain object`);
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    return invalid(`${label} must contain exact keys`);
  }
  return value;
};
const denseArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) return invalid(`${label} must be a dense array without extra keys`);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    return invalid(`${label} must be a dense array without extra keys`);
  }
  return value;
};
const nonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || [...value.trim()].length === 0) {
    return invalid(`${label} must be non-empty`);
  }
  return value;
};
const stringArray = (value: unknown, label: string, allowEmpty: boolean): readonly string[] => {
  const values = denseArray(value, label).map((item) => nonEmptyString(item, label));
  if (!allowEmpty && values.length === 0) invalid(`${label} must not be empty`);
  return values;
};
const unique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) invalid(`${label} must be unique`);
};
const lexicalObject = (
  value: unknown,
  keyName: 'directiveKey' | 'actionKey',
  label: string,
): {
  readonly key: string;
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
} => {
  if (!isPlainObject(value)) return invalid(`${label} must be a plain object`);
  const hasLexicalEvidence = Object.hasOwn(value, 'lexicalEvidence');
  const item = exactObject(
    value,
    hasLexicalEvidence ? [keyName, 'description', 'lexicalEvidence'] : [keyName, 'description'],
    label,
  );
  return {
    key: nonEmptyString(item[keyName], `${label}.${keyName}`),
    description: nonEmptyString(item.description, `${label}.description`),
    ...(hasLexicalEvidence
      ? { lexicalEvidence: stringArray(item.lexicalEvidence, `${label}.lexicalEvidence`, true) }
      : {}),
  };
};
const parseStructuralInput = (value: unknown): StructuralValidationInput => {
  const input = exactObject(value, ['policyVersion', 'prose', 'contract', 'evidence'], 'Structural input');
  if (typeof input.policyVersion !== 'string' || typeof input.prose !== 'string') {
    return invalid('Structural policyVersion and prose must be strings');
  }
  const contractSource = isPlainObject(input.contract)
    ? input.contract
    : invalid('Beat contract must be a plain object');
  const hasEnding = Object.hasOwn(contractSource, 'endingRequirement');
  const hasLength = Object.hasOwn(contractSource, 'lengthRange');
  const contract = exactObject(
    contractSource,
    [
      'beatId',
      'purpose',
      'requiredCharacterIds',
      'requiredFactKeys',
      'requiredDirectives',
      'prohibitedActions',
      ...(hasEnding ? ['endingRequirement'] : []),
      ...(hasLength ? ['lengthRange'] : []),
    ],
    'Beat contract',
  );
  const requiredCharacterIds = stringArray(contract.requiredCharacterIds, 'requiredCharacterIds', true);
  const requiredFactKeys = stringArray(contract.requiredFactKeys, 'requiredFactKeys', true);
  unique(requiredCharacterIds, 'requiredCharacterIds');
  unique(requiredFactKeys, 'requiredFactKeys');
  const directives = denseArray(contract.requiredDirectives, 'requiredDirectives').map((item, index) =>
    lexicalObject(item, 'directiveKey', `requiredDirectives[${index}]`),
  );
  const actions = denseArray(contract.prohibitedActions, 'prohibitedActions').map((item, index) =>
    lexicalObject(item, 'actionKey', `prohibitedActions[${index}]`),
  );
  unique(
    directives.map((item) => item.key),
    'directive keys',
  );
  unique(
    actions.map((item) => item.key),
    'action keys',
  );
  if (hasEnding) {
    if (!isPlainObject(contract.endingRequirement)) {
      return invalid('endingRequirement must be a plain object');
    }
    const hasLexicalEvidence = Object.hasOwn(contract.endingRequirement, 'lexicalEvidence');
    const ending = exactObject(
      contract.endingRequirement,
      hasLexicalEvidence ? ['description', 'lexicalEvidence'] : ['description'],
      'endingRequirement',
    );
    nonEmptyString(ending.description, 'endingRequirement.description');
    if (hasLexicalEvidence) {
      stringArray(ending.lexicalEvidence, 'endingRequirement.lexicalEvidence', true);
    }
  }
  if (hasLength) {
    const range = exactObject(contract.lengthRange, ['min', 'max'], 'lengthRange');
    if (
      !Number.isSafeInteger(range.min) ||
      !Number.isSafeInteger(range.max) ||
      (range.min as number) < 0 ||
      (range.max as number) < (range.min as number)
    )
      invalid('Length range is invalid');
  }
  const evidence = exactObject(input.evidence, ['characters', 'facts'], 'Structural evidence');
  const parseEvidence = (value: unknown, label: string): readonly StructuralEvidenceEntry[] => {
    const entries = denseArray(value, label).map((entry, index) => {
      const item = exactObject(entry, ['id', 'lexicalEvidence'], `${label}[${index}]`);
      return {
        id: nonEmptyString(item.id, `${label}[${index}].id`),
        lexicalEvidence: stringArray(item.lexicalEvidence, `${label}[${index}].lexicalEvidence`, true),
      };
    });
    unique(
      entries.map((entry) => entry.id),
      `${label} IDs`,
    );
    return entries;
  };
  nonEmptyString(contract.beatId, 'beatId');
  nonEmptyString(contract.purpose, 'purpose');
  parseEvidence(evidence.characters, 'evidence.characters');
  parseEvidence(evidence.facts, 'evidence.facts');
  return {
    policyVersion: input.policyVersion as string,
    prose: input.prose as string,
    contract: input.contract as ValidatorBeatContract,
    evidence: input.evidence as StructuralEvidence,
  };
};
const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstMatch = (
  prose: string,
  evidence: readonly string[],
): { startUtf16: number; endUtf16: number } | undefined => {
  for (const value of evidence) {
    const leftBoundary = /^[\p{L}\p{N}]/u.test(value) ? '(^|[^\\p{L}\\p{N}])' : '()';
    const rightBoundary = /[\p{L}\p{N}]$/u.test(value) ? '(?=$|[^\\p{L}\\p{N}])' : '';
    const match = new RegExp(`${leftBoundary}(${escapePattern(value)})${rightBoundary}`, 'iu').exec(
      prose,
    );
    if (match !== null) {
      const startUtf16 = match.index + match[1]!.length;
      return { startUtf16, endUtf16: startUtf16 + match[2]!.length };
    }
  }
  return undefined;
};
const make = (
  input: StructuralValidationInput,
  rule: readonly [string, string, FindingSeverity],
  subjectKind: string,
  subjectKey: string,
  location?: { readonly startUtf16: number; readonly endUtf16: number },
): InternalValidationFinding =>
  createFinding({
    source: 'deterministic',
    ruleKey: rule[0],
    publicMessageCode: rule[1],
    severity: rule[2],
    evidenceHash: canonicalSha256({
      beatId: input.contract.beatId,
      subjectKind,
      subjectKey,
    }),
    ...(location === undefined ? {} : { location }),
  });

export function validateBeatStructure(value: unknown): readonly InternalValidationFinding[] {
  const input = parseStructuralInput(value);
  validateValidatorPolicyVersion(input.policyVersion);
  if ([...input.prose.trim()].length === 0)
    return Object.freeze([make(input, RULES.empty, 'prose', 'empty')]);
  const findings: InternalValidationFinding[] = [];
  const checkRequired = (
    ids: readonly string[],
    catalog: readonly StructuralEvidenceEntry[],
    missingRule: readonly [string, string, FindingSeverity],
    semanticRule: readonly [string, string, FindingSeverity],
    kind: string,
  ): void => {
    for (const id of ids) {
      const entry = catalog.find((candidate) => candidate.id === id);
      if (entry === undefined || entry.lexicalEvidence.length === 0)
        findings.push(make(input, semanticRule, kind, id));
      else if (firstMatch(input.prose, entry.lexicalEvidence) === undefined)
        findings.push(make(input, missingRule, kind, id));
    }
  };
  checkRequired(
    input.contract.requiredCharacterIds,
    input.evidence.characters,
    RULES.character,
    RULES.characterSemantic,
    'character',
  );
  checkRequired(
    input.contract.requiredFactKeys,
    input.evidence.facts,
    RULES.fact,
    RULES.factSemantic,
    'fact',
  );
  for (const directive of input.contract.requiredDirectives) {
    if (directive.lexicalEvidence === undefined || directive.lexicalEvidence.length === 0)
      findings.push(make(input, RULES.directiveSemantic, 'directive', directive.directiveKey));
    else if (firstMatch(input.prose, directive.lexicalEvidence) === undefined)
      findings.push(make(input, RULES.directive, 'directive', directive.directiveKey));
  }
  for (const action of input.contract.prohibitedActions) {
    if (action.lexicalEvidence === undefined || action.lexicalEvidence.length === 0)
      findings.push(make(input, RULES.prohibitedSemantic, 'action', action.actionKey));
    else {
      const location = firstMatch(input.prose, action.lexicalEvidence);
      if (location !== undefined)
        findings.push(make(input, RULES.prohibited, 'action', action.actionKey, location));
    }
  }
  const ending = input.contract.endingRequirement;
  if (ending !== undefined) {
    if (ending.lexicalEvidence === undefined || ending.lexicalEvidence.length === 0)
      findings.push(make(input, RULES.endingSemantic, 'ending', ending.description));
    else if (firstMatch(input.prose, ending.lexicalEvidence) === undefined)
      findings.push(make(input, RULES.ending, 'ending', ending.description));
  }
  const length = [...input.prose].length;
  const range = input.contract.lengthRange;
  if (range !== undefined && (length < range.min || length > range.max))
    findings.push(make(input, RULES.length, 'length', `${range.min}:${range.max}`));
  return Object.freeze(findings);
}

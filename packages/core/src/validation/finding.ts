import { canonicalSha256 } from '../dependency/canonical-json.js';

export const VALIDATOR_POLICY_VERSION = 'validator:v1' as const;
export type FindingSource = 'deterministic' | 'model';
export type FindingSeverity = 'info' | 'warning' | 'error' | 'blocking';
export type RestrictedMatchStatus = 'matched' | 'suspected' | 'requires_semantic_review';
export interface FindingLocation {
  readonly startUtf16: number;
  readonly endUtf16: number;
}
export interface RestrictedFindingDetail {
  readonly guardKey: string;
  readonly status: RestrictedMatchStatus;
  readonly matchedText: string | null;
  readonly normalizedTerms: readonly string[];
}
export interface InternalValidationFinding {
  readonly findingKey: string;
  readonly source: FindingSource;
  readonly ruleKey: string;
  readonly severity: FindingSeverity;
  readonly publicMessageCode: string;
  readonly location?: FindingLocation;
  readonly evidenceHash?: string;
  readonly restrictedDetail?: RestrictedFindingDetail;
}
export interface PublicValidationFinding {
  readonly findingKey: string;
  readonly ruleKey: string;
  readonly severity: FindingSeverity;
  readonly publicMessageCode: string;
  readonly location?: FindingLocation;
}
export type ValidatorErrorCode =
  | 'INVALID_BEAT_CONTRACT'
  | 'INVALID_RESTRICTED_GUARD'
  | 'INVALID_FINDING'
  | 'DUPLICATE_DETERMINISTIC_FINDING'
  | 'UNSUPPORTED_POLICY_VERSION';
export class ValidatorError extends Error {
  constructor(
    readonly code: ValidatorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ValidatorError';
  }
}
export const severityRank: Readonly<Record<FindingSeverity, number>> = {
  info: 0,
  warning: 1,
  error: 2,
  blocking: 3,
};
const SHA256 = /^[0-9a-f]{64}$/;
const SOURCES = new Set<FindingSource>(['deterministic', 'model']);
const SEVERITIES = new Set<FindingSeverity>(['info', 'warning', 'error', 'blocking']);
const STATUSES = new Set<RestrictedMatchStatus>([
  'matched',
  'suspected',
  'requires_semantic_review',
]);
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && [...value.trim()].length > 0;
const isDenseNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && Object.keys(value).length === value.length && value.every(nonEmpty);
const invalidFinding = (message: string): never => {
  throw new ValidatorError('INVALID_FINDING', message);
};
const validateLocationValue = (value: unknown): FindingLocation => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => key !== 'startUtf16' && key !== 'endUtf16')
  ) {
    return invalidFinding('Finding location must be a plain object with exact keys');
  }
  const { startUtf16, endUtf16 } = value;
  if (
    !Number.isSafeInteger(startUtf16) ||
    !Number.isSafeInteger(endUtf16) ||
    (startUtf16 as number) < 0 ||
    (endUtf16 as number) < (startUtf16 as number)
  ) {
    return invalidFinding('Finding location must be ordered non-negative safe integers');
  }
  return value as unknown as FindingLocation;
};
export function validateLocation(location: FindingLocation): void {
  validateLocationValue(location);
}
export function normalizedLocation(location: FindingLocation | undefined): FindingLocation | null {
  if (location === undefined) return null;
  validateLocation(location);
  return { startUtf16: location.startUtf16, endUtf16: location.endUtf16 };
}
export function findingIdentity(
  ruleKey: string,
  location?: FindingLocation,
  evidenceHash?: string,
): string {
  if (!nonEmpty(ruleKey) || (evidenceHash !== undefined && !SHA256.test(evidenceHash))) {
    throw new ValidatorError('INVALID_FINDING', 'Finding identity material is invalid');
  }
  return canonicalSha256({
    ruleKey,
    location: normalizedLocation(location),
    evidenceHash: evidenceHash ?? null,
  });
}
export type FindingDraft = Omit<InternalValidationFinding, 'findingKey'>;
const copyLocation = (location: FindingLocation): FindingLocation =>
  Object.freeze({ startUtf16: location.startUtf16, endUtf16: location.endUtf16 });
const copyRestrictedDetail = (detail: RestrictedFindingDetail): RestrictedFindingDetail =>
  Object.freeze({
    guardKey: detail.guardKey,
    status: detail.status,
    matchedText: detail.matchedText,
    normalizedTerms: Object.freeze([...detail.normalizedTerms]),
  });
export function createFinding(draft: FindingDraft): InternalValidationFinding {
  const location = draft.location === undefined ? undefined : copyLocation(draft.location);
  const restrictedDetail =
    draft.restrictedDetail === undefined ? undefined : copyRestrictedDetail(draft.restrictedDetail);
  const finding: InternalValidationFinding = Object.freeze({
    findingKey: findingIdentity(draft.ruleKey, location, draft.evidenceHash),
    source: draft.source,
    ruleKey: draft.ruleKey,
    severity: draft.severity,
    publicMessageCode: draft.publicMessageCode,
    ...(location === undefined ? {} : { location }),
    ...(draft.evidenceHash === undefined ? {} : { evidenceHash: draft.evidenceHash }),
    ...(restrictedDetail === undefined ? {} : { restrictedDetail }),
  });
  validateFinding(finding);
  return finding;
}
export function validateFinding(value: unknown): asserts value is InternalValidationFinding {
  if (!isPlainObject(value)) {
    return invalidFinding('Validation finding must be a plain object');
  }
  const record: Record<string, unknown> = value;
  const allowed = new Set([
    'findingKey',
    'source',
    'ruleKey',
    'severity',
    'publicMessageCode',
    'location',
    'evidenceHash',
    'restrictedDetail',
  ]);
  if (
    Object.keys(record).some((key) => !allowed.has(key)) ||
    typeof record.findingKey !== 'string' ||
    !SHA256.test(record.findingKey) ||
    typeof record.source !== 'string' ||
    !SOURCES.has(record.source as FindingSource) ||
    typeof record.severity !== 'string' ||
    !SEVERITIES.has(record.severity as FindingSeverity) ||
    !nonEmpty(record.ruleKey) ||
    !nonEmpty(record.publicMessageCode) ||
    (record.evidenceHash !== undefined &&
      (typeof record.evidenceHash !== 'string' || !SHA256.test(record.evidenceHash)))
  ) {
    invalidFinding('Validation finding is malformed');
  }
  const location =
    record.location === undefined ? undefined : validateLocationValue(record.location);
  if (record.restrictedDetail !== undefined) {
    const detail = record.restrictedDetail;
    if (
      !isPlainObject(detail) ||
      Object.keys(detail).some(
        (key) => !['guardKey', 'status', 'matchedText', 'normalizedTerms'].includes(key),
      ) ||
      !nonEmpty(detail.guardKey) ||
      typeof detail.status !== 'string' ||
      !STATUSES.has(detail.status as RestrictedMatchStatus) ||
      (detail.matchedText !== null && typeof detail.matchedText !== 'string') ||
      !isDenseNonEmptyStringArray(detail.normalizedTerms)
    ) {
      invalidFinding('Restricted finding detail is malformed');
    }
  }
  if (
    record.findingKey !==
    findingIdentity(record.ruleKey as string, location, record.evidenceHash as string | undefined)
  ) {
    invalidFinding('Finding key does not match identity material');
  }
}
export function validateValidatorPolicyVersion(version: string): void {
  if (version !== VALIDATOR_POLICY_VERSION) {
    throw new ValidatorError(
      'UNSUPPORTED_POLICY_VERSION',
      `Unsupported validator policy version: ${version}`,
    );
  }
}

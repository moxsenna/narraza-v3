import { canonicalJson } from '../dependency/canonical-json.js';
import {
  createFinding,
  severityRank,
  validateFinding,
  ValidatorError,
  type InternalValidationFinding,
} from './finding.js';

export interface ValidationResult {
  readonly findings: readonly InternalValidationFinding[];
  readonly passed: boolean;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const canonicalFinding = (finding: InternalValidationFinding): string => canonicalJson(finding);

export function mergeFindings(
  deterministic: readonly InternalValidationFinding[],
  model: readonly InternalValidationFinding[],
): ValidationResult {
  for (const finding of [...deterministic, ...model]) validateFinding(finding);
  if (
    deterministic.some((finding) => finding.source !== 'deterministic') ||
    model.some((finding) => finding.source !== 'model')
  ) {
    throw new ValidatorError(
      'INVALID_FINDING',
      'Finding supplied through wrong provenance collection',
    );
  }

  const merged = new Map<string, InternalValidationFinding>();
  for (const finding of deterministic) {
    if (merged.has(finding.findingKey)) {
      throw new ValidatorError(
        'DUPLICATE_DETERMINISTIC_FINDING',
        `Duplicate deterministic finding: ${finding.findingKey}`,
      );
    }
    merged.set(finding.findingKey, finding);
  }

  for (const finding of model) {
    const existing = merged.get(finding.findingKey);
    if (existing?.source === 'deterministic') continue;
    if (
      existing === undefined ||
      severityRank[finding.severity] > severityRank[existing.severity] ||
      (severityRank[finding.severity] === severityRank[existing.severity] &&
        canonicalFinding(finding) < canonicalFinding(existing))
    ) {
      merged.set(finding.findingKey, finding);
    }
  }

  const findings = [...merged.values()].sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] ||
      compareText(a.ruleKey, b.ruleKey) ||
      (a.location?.startUtf16 ?? Number.POSITIVE_INFINITY) -
        (b.location?.startUtf16 ?? Number.POSITIVE_INFINITY) ||
      (a.location?.endUtf16 ?? Number.POSITIVE_INFINITY) -
        (b.location?.endUtf16 ?? Number.POSITIVE_INFINITY) ||
      compareText(a.findingKey, b.findingKey),
  );

  const copied = findings.map((finding) =>
    createFinding({
      source: finding.source,
      ruleKey: finding.ruleKey,
      severity: finding.severity,
      publicMessageCode: finding.publicMessageCode,
      ...(finding.location === undefined ? {} : { location: finding.location }),
      ...(finding.evidenceHash === undefined ? {} : { evidenceHash: finding.evidenceHash }),
      ...(finding.restrictedDetail === undefined
        ? {}
        : { restrictedDetail: finding.restrictedDetail }),
    }),
  );

  return Object.freeze({
    findings: Object.freeze(copied),
    passed: !copied.some((finding) => finding.severity === 'blocking'),
  });
}

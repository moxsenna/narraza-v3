import {
  validateFinding,
  type InternalValidationFinding,
  type PublicValidationFinding,
} from './finding.js';

export function toPublicFinding(finding: InternalValidationFinding): PublicValidationFinding {
  validateFinding(finding);
  const base = {
    findingKey: finding.findingKey,
    ruleKey: finding.ruleKey,
    severity: finding.severity,
    publicMessageCode: finding.publicMessageCode,
  };
  return finding.location === undefined
    ? Object.freeze(base)
    : Object.freeze({
        ...base,
        location: Object.freeze({
          startUtf16: finding.location.startUtf16,
          endUtf16: finding.location.endUtf16,
        }),
      });
}

export function toPublicFindings(
  findings: readonly InternalValidationFinding[],
): readonly PublicValidationFinding[] {
  return Object.freeze(findings.map(toPublicFinding));
}

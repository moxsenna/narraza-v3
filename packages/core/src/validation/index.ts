export {
  VALIDATOR_POLICY_VERSION,
  ValidatorError,
  createFinding,
  findingIdentity,
  severityRank,
  validateFinding,
  validateValidatorPolicyVersion,
} from './finding.js';
export type {
  FindingDraft,
  FindingLocation,
  FindingSeverity,
  FindingSource,
  InternalValidationFinding,
  PublicValidationFinding,
  RestrictedFindingDetail,
  RestrictedMatchStatus,
  ValidatorErrorCode,
} from './finding.js';
export { validateBeatStructure } from './structural-validator.js';
export type {
  StructuralEvidence,
  StructuralEvidenceEntry,
  StructuralValidationInput,
} from './structural-validator.js';
export { matchRestrictedRepresentations, normalizeRestrictedText } from './restricted-matcher.js';
export type { NormalizedRestrictedText, RestrictedMatcherInput } from './restricted-matcher.js';
export { mergeFindings } from './merge-findings.js';
export type { ValidationResult } from './merge-findings.js';
export { toPublicFinding, toPublicFindings } from './public-finding.js';

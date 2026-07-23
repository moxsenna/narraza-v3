export { OperationDomainError, type OperationErrorCode } from './errors.js';
export type {
  CanonicalOperationType,
  CanonicalEntitySnapshot,
  EntityType,
  IdAllocator,
  OperationContract,
  OperationRisk,
  Ref,
  RepairExtractionBinding,
  ResolutionContext,
  SuggestionOperationType,
} from './entities.js';
export type {
  BeliefDowngradeReason,
  BeliefLevel,
  CanonicalOperationPayload,
  CanonicalProseEvidenceBinding,
  CharacterFields,
  CharacterRole,
  FactCanonStatus,
  FactVisibility,
  FoundationChanges,
  NormalizedOperationPayload,
  ProseEvidenceBinding,
} from './payloads.js';
export { parseModelSuggestion, type ModelSuggestionDraft } from './suggestion.js';
export {
  normalizeSuggestion,
  parseAndNormalizeSuggestion,
  type NormalizedOperationDraft,
} from './normalized.js';
export type { CanonicalChangeOperation } from './canonical.js';
export {
  OPERATION_CATALOG,
  CONTRACT_LIMITS,
  GLOBAL_OPERATION_LIMIT,
  CREATION_LIMIT,
  DEPENDENCY_LIMIT,
} from './catalog.js';
export { resolveOperations, type ResolvedOperations } from './resolver.js';
export { hashCanonicalOperations } from './operations-hash.js';

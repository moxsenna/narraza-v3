export type OperationErrorCode =
  | 'INVALID_SUGGESTION'
  | 'UNKNOWN_OPERATION'
  | 'OPERATION_NOT_ALLOWED'
  | 'OPERATION_LIMIT_EXCEEDED'
  | 'DUPLICATE_TEMP_REF'
  | 'UNRESOLVED_TEMP_REF'
  | 'INVALID_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  | 'INVALID_SNAPSHOT'
  | 'DUPLICATE_SNAPSHOT'
  | 'ENTITY_NOT_FOUND'
  | 'REVISION_REQUIRED'
  | 'PROSE_ACCEPT_REQUIRED'
  | 'PROSE_ACCEPT_NOT_LAST'
  | 'REPAIR_REEXTRACTION_REQUIRED'
  | 'INVALID_PROSE_EVIDENCE_BINDING';

export class OperationDomainError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'OperationDomainError';
  }
}

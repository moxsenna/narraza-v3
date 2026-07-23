import {
  TEMP_REF_PATTERN,
  exactRecord,
  nonEmpty,
  type SuggestionOperationType,
} from './entities.js';
import { OperationDomainError } from './errors.js';

export interface ModelSuggestionDraft {
  readonly schemaVersion: 1;
  readonly tempRef: string;
  readonly operationType: SuggestionOperationType;
  readonly input: unknown;
  readonly dependsOn?: readonly string[];
}

const OPERATION_TYPES = new Set<SuggestionOperationType>([
  'foundation.update',
  'character.create',
  'character.update',
  'fact.create',
  'fact.update',
  'state.append',
  'belief.append',
  'disclosure.append',
  'reveal.create',
  'reveal.update',
  'breadcrumb.create',
  'outline.create',
  'outline.update',
  'prose.version.create',
  'prose.accept',
]);

export function parseModelSuggestionDraft(value: unknown): ModelSuggestionDraft {
  const record = exactRecord(
    value,
    ['schemaVersion', 'tempRef', 'operationType', 'input'],
    ['dependsOn'],
  );
  if (record.schemaVersion !== 1) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'schemaVersion must be 1');
  }
  const tempRef = nonEmpty(record.tempRef);
  if (!TEMP_REF_PATTERN.test(tempRef)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'tempRef is invalid');
  }
  if (
    typeof record.operationType !== 'string' ||
    !OPERATION_TYPES.has(record.operationType as SuggestionOperationType)
  ) {
    throw new OperationDomainError('UNKNOWN_OPERATION', 'unknown operation type');
  }
  let dependsOn: readonly string[] | undefined;
  if (Object.hasOwn(record, 'dependsOn')) {
    if (!Array.isArray(record.dependsOn)) {
      throw new OperationDomainError('INVALID_SUGGESTION', 'dependsOn must be an array');
    }
    dependsOn = record.dependsOn.map((item, index) => {
      if (typeof item !== 'string' || item.trim().length === 0) {
        throw new OperationDomainError(
          'INVALID_SUGGESTION',
          `dependsOn[${index}] must be non-empty string`,
        );
      }
      return item;
    });
  }
  return {
    schemaVersion: 1,
    tempRef,
    operationType: record.operationType as SuggestionOperationType,
    input: record.input,
    ...(dependsOn === undefined ? {} : { dependsOn }),
  };
}

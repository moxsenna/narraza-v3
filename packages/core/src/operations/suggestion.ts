import {
  exactRecord,
  nonEmpty,
  TEMP_REF_PATTERN,
  type SuggestionOperationType,
} from './entities.js';
import { OperationDomainError } from './errors.js';

const TYPES = new Set<SuggestionOperationType>([
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

export interface ModelSuggestionDraft {
  readonly schemaVersion: 1;
  readonly tempRef: string;
  readonly operationType: SuggestionOperationType;
  readonly input: unknown;
  readonly dependsOn?: readonly string[];
}

const choose = (record: Record<string, unknown>, canonical: string, alias: string): unknown => {
  if (Object.hasOwn(record, canonical) && Object.hasOwn(record, alias)) {
    throw new OperationDomainError(
      'INVALID_SUGGESTION',
      `cannot combine ${canonical} and ${alias}`,
    );
  }
  return Object.hasOwn(record, canonical) ? record[canonical] : record[alias];
};

export function parseModelSuggestion(value: unknown): ModelSuggestionDraft {
  const raw = exactRecord(
    value,
    ['schemaVersion', 'input'],
    ['tempRef', 'temp_id', 'operationType', 'op', 'dependsOn', 'dependencies'],
  );
  const tempRef = nonEmpty(choose(raw, 'tempRef', 'temp_id'));
  if (!TEMP_REF_PATTERN.test(tempRef)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'invalid tempRef');
  }
  const operationType = nonEmpty(choose(raw, 'operationType', 'op')) as SuggestionOperationType;
  if (!TYPES.has(operationType)) {
    throw new OperationDomainError('UNKNOWN_OPERATION', `unknown operation ${operationType}`);
  }
  if (raw.schemaVersion !== 1) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'schemaVersion must be 1');
  }
  const dependencyValue = choose(raw, 'dependsOn', 'dependencies');
  if (dependencyValue !== undefined && !Array.isArray(dependencyValue)) {
    throw new OperationDomainError('INVALID_DEPENDENCY', 'dependencies must be dense array');
  }
  const dependsOn =
    dependencyValue === undefined
      ? undefined
      : dependencyValue.map((item, index) => {
          if (!Object.hasOwn(dependencyValue, index)) {
            throw new OperationDomainError('INVALID_DEPENDENCY', 'sparse dependencies');
          }
          const ref = nonEmpty(item);
          if (!TEMP_REF_PATTERN.test(ref)) {
            throw new OperationDomainError('INVALID_DEPENDENCY', 'invalid dependency');
          }
          return ref;
        });
  if (dependsOn !== undefined && new Set(dependsOn).size !== dependsOn.length) {
    throw new OperationDomainError('INVALID_DEPENDENCY', 'duplicate dependency');
  }
  return dependsOn === undefined
    ? { schemaVersion: 1, tempRef, operationType, input: raw.input }
    : { schemaVersion: 1, tempRef, operationType, input: raw.input, dependsOn };
}

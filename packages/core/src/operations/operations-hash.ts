import { canonicalJson, sha256Hex } from '../dependency/canonical-json.js';
import type { CanonicalChangeOperation } from './canonical.js';
import { OperationDomainError } from './errors.js';

const PREFIX = 'narraza-canonical-operations:v1\n';

export function hashCanonicalOperations(
  operations: readonly CanonicalChangeOperation[],
): string {
  operations.forEach((operation, index) => {
    if (operation.ordinal !== index) {
      throw new OperationDomainError(
        'INVALID_SUGGESTION',
        'operations must have contiguous ordered ordinals',
        { index, ordinal: operation.ordinal },
      );
    }
  });
  const material = operations.map(
    ({
      schemaVersion,
      ordinal,
      operationType,
      targetEntityType,
      targetId,
      expectedRevision,
      risk,
      payload,
    }) => ({
      schemaVersion,
      ordinal,
      operationType,
      targetEntityType,
      targetId,
      expectedRevision,
      risk,
      payload,
    }),
  );
  return sha256Hex(PREFIX + canonicalJson(material));
}

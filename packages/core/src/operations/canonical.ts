import type { CanonicalOperationType, EntityType, OperationRisk } from './entities.js';
import type { CanonicalOperationPayload } from './payloads.js';

const CANONICAL_OPERATION: unique symbol = Symbol('CanonicalChangeOperation');

export interface CanonicalChangeOperation {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly ordinal: number;
  readonly operationType: CanonicalOperationType;
  readonly targetEntityType: EntityType;
  readonly targetId: string;
  readonly expectedRevision: number | null;
  readonly risk: OperationRisk;
  readonly payload: CanonicalOperationPayload;
  readonly [CANONICAL_OPERATION]: true;
}

export type UnbrandedCanonicalOperation = Omit<
  CanonicalChangeOperation,
  typeof CANONICAL_OPERATION
>;

export const brandCanonicalOperation = (
  value: UnbrandedCanonicalOperation,
): CanonicalChangeOperation => ({
  ...value,
  [CANONICAL_OPERATION]: true,
});

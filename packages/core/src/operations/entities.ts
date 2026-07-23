import { OperationDomainError } from './errors.js';

export type OperationContract = 'intake' | 'foundation' | 'outline' | 'beat.write' | 'repair';
export type OperationRisk = 'low' | 'medium' | 'high';
export type EntityType =
  | 'foundation'
  | 'character'
  | 'fact'
  | 'character_state'
  | 'character_belief'
  | 'fact_disclosure'
  | 'reveal'
  | 'reveal_breadcrumb'
  | 'roadmap'
  | 'arc'
  | 'chapter'
  | 'beat'
  | 'prose_version';
export type Ref =
  | { readonly kind: 'existing'; readonly entityType: EntityType; readonly entityId: string }
  | { readonly kind: 'temporary'; readonly entityType: EntityType; readonly tempRef: string };
export type CanonicalOperationType =
  | 'foundation.update'
  | 'character.create'
  | 'character.update'
  | 'fact.create'
  | 'fact.update'
  | 'state.append'
  | 'belief.append'
  | 'disclosure.append'
  | 'reveal.create'
  | 'reveal.update'
  | 'breadcrumb.create'
  | 'outline.create'
  | 'outline.update'
  | 'prose.version.create'
  | 'prose.accept';
export type SuggestionOperationType = CanonicalOperationType;
export const TEMP_REF_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface CanonicalEntitySnapshot {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly exists: boolean;
  readonly deleted: boolean;
  readonly revision: number | null;
  readonly parentId: string | null;
  readonly candidateId?: string;
  readonly extractionRunId?: string;
  readonly content?: string;
  readonly contentHash?: string;
  readonly ordinal?: number;
  readonly narrativeSequence?: number;
  readonly nextOrdinal?: number;
  readonly nextNarrativeSequence?: number;
  readonly factKey?: string;
  readonly beatId?: string;
  readonly targetSequence?: number;
}
export interface RepairExtractionBinding {
  readonly sourceProseVersionId: string;
  readonly repairedProseVersionId: string;
  readonly extractionSourceProseVersionId: string;
}
export type IdAllocator = (entityType: EntityType, localRef: string) => string;
export interface ResolutionContext {
  readonly contract: OperationContract;
  readonly candidateId: string;
  readonly extractionRunId: string;
  readonly snapshots: readonly CanonicalEntitySnapshot[];
  readonly repairBinding?: RepairExtractionBinding;
  readonly allocateId: IdAllocator;
  readonly allocateOperationId: (localRef: string) => string;
  readonly allocateFactKey: (localRef: string) => string;
}
export const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
export function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'expected plain object');
  }
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'object keys do not match schema');
  }
  return value;
}
export function nonEmpty(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'expected non-empty string');
  }
  return value;
}
export function nullableString(value: unknown): string | null {
  return value === null ? null : nonEmpty(value);
}
export function safeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'expected safe non-negative integer');
  }
  return value as number;
}

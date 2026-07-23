import { SHA256_PATTERN, type CanonicalEntitySnapshot, type EntityType } from './entities.js';
import { OperationDomainError } from './errors.js';

const ENTITY_TYPES = new Set<EntityType>([
  'foundation',
  'character',
  'fact',
  'character_state',
  'character_belief',
  'fact_disclosure',
  'reveal',
  'reveal_breadcrumb',
  'roadmap',
  'arc',
  'chapter',
  'beat',
  'prose_version',
]);

const optionalByType: Record<EntityType, readonly string[]> = {
  foundation: [],
  character: [],
  fact: ['factKey'],
  character_state: [],
  character_belief: [],
  fact_disclosure: ['factKey'],
  reveal: ['targetSequence'],
  reveal_breadcrumb: [],
  roadmap: ['nextOrdinal', 'nextNarrativeSequence'],
  arc: ['ordinal', 'nextOrdinal', 'nextNarrativeSequence'],
  chapter: ['ordinal', 'narrativeSequence', 'nextOrdinal', 'nextNarrativeSequence'],
  beat: ['ordinal', 'narrativeSequence'],
  prose_version: ['candidateId', 'extractionRunId', 'content', 'contentHash', 'beatId'],
};

const requiredLive: Partial<Record<EntityType, readonly string[]>> = {
  fact: ['factKey'],
  roadmap: ['nextOrdinal', 'nextNarrativeSequence'],
  arc: ['parentId', 'ordinal', 'nextOrdinal', 'nextNarrativeSequence'],
  chapter: ['parentId', 'ordinal', 'narrativeSequence', 'nextOrdinal', 'nextNarrativeSequence'],
  beat: ['parentId', 'ordinal', 'narrativeSequence'],
  prose_version: ['candidateId', 'extractionRunId', 'content', 'contentHash', 'beatId'],
  reveal: ['targetSequence'],
};

const integerFields = [
  'revision',
  'ordinal',
  'narrativeSequence',
  'nextOrdinal',
  'nextNarrativeSequence',
  'targetSequence',
] as const;

const requiredBase = [
  'entityType',
  'entityId',
  'exists',
  'deleted',
  'revision',
  'parentId',
] as const;

export const snapshotKey = (type: EntityType, id: string): string => `${type}\u0000${id}`;

export function buildSnapshotIndex(
  input: readonly unknown[],
): ReadonlyMap<string, CanonicalEntitySnapshot> {
  const out = new Map<string, CanonicalEntitySnapshot>();
  for (const value of input) {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw new OperationDomainError('INVALID_SNAPSHOT', 'snapshot must be a plain object');
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.entityType !== 'string' || !ENTITY_TYPES.has(raw.entityType as EntityType)) {
      throw new OperationDomainError('INVALID_SNAPSHOT', 'unknown snapshot entityType', {
        entityType: raw.entityType,
      });
    }
    const entityType = raw.entityType as EntityType;
    const allowed = new Set([...requiredBase, ...optionalByType[entityType]]);
    if (
      requiredBase.some((k) => !Object.hasOwn(raw, k)) ||
      Object.keys(raw).some((k) => !allowed.has(k)) ||
      typeof raw.entityId !== 'string' ||
      raw.entityId.trim() === '' ||
      typeof raw.exists !== 'boolean' ||
      typeof raw.deleted !== 'boolean'
    ) {
      throw new OperationDomainError('INVALID_SNAPSHOT', 'invalid snapshot shape', {
        entityType,
        entityId: raw.entityId,
      });
    }
    const s = raw as unknown as CanonicalEntitySnapshot;
    const live = s.exists && !s.deleted;
    if (
      s.exists === s.deleted ||
      (!live &&
        (s.revision !== null ||
          s.parentId !== null ||
          Object.keys(s).some((k) => !requiredBase.includes(k as (typeof requiredBase)[number]))))
    ) {
      throw new OperationDomainError('INVALID_SNAPSHOT', 'contradictory existence fields', {
        entityType: s.entityType,
        entityId: s.entityId,
      });
    }
    if (live) {
      if (s.revision === null || !Number.isSafeInteger(s.revision) || s.revision < 0) {
        throw new OperationDomainError('INVALID_SNAPSHOT', 'live revision required');
      }
      for (const key of requiredLive[entityType] ?? []) {
        if (
          !Object.hasOwn(s, key) ||
          s[key as keyof CanonicalEntitySnapshot] === undefined ||
          s[key as keyof CanonicalEntitySnapshot] === null
        ) {
          throw new OperationDomainError('INVALID_SNAPSHOT', `missing ${key}`);
        }
      }
    }
    for (const key of integerFields) {
      const field = s[key];
      if (field !== undefined && field !== null && (!Number.isSafeInteger(field) || field < 0)) {
        throw new OperationDomainError('INVALID_SNAPSHOT', `invalid ${key}`);
      }
    }
    if (
      s.contentHash !== undefined &&
      (typeof s.contentHash !== 'string' || !SHA256_PATTERN.test(s.contentHash))
    ) {
      throw new OperationDomainError('INVALID_SNAPSHOT', 'invalid content hash');
    }
    const key = snapshotKey(s.entityType, s.entityId);
    if (out.has(key)) {
      throw new OperationDomainError('DUPLICATE_SNAPSHOT', 'duplicate snapshot identity', {
        entityType: s.entityType,
        entityId: s.entityId,
      });
    }
    out.set(key, Object.freeze({ ...s }));
  }
  return out;
}

export function requireLiveSnapshot(
  index: ReadonlyMap<string, CanonicalEntitySnapshot>,
  type: EntityType,
  id: string,
): CanonicalEntitySnapshot {
  const s = index.get(snapshotKey(type, id));
  if (!s || !s.exists || s.deleted) {
    throw new OperationDomainError('ENTITY_NOT_FOUND', 'entity missing or deleted', {
      entityType: type,
      entityId: id,
    });
  }
  return s;
}

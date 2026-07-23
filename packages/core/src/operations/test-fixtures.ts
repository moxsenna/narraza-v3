import type { CanonicalEntitySnapshot, EntityType, ResolutionContext } from './entities.js';
import type { NormalizedOperationDraft } from './normalized.js';

export const HASH_A = '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd';
export const CANDIDATE = 'candidate-1';
export const RUN = 'run-1';

export const existing = (entityType: EntityType, entityId: string) => ({
  kind: 'existing' as const,
  entityType,
  entityId,
});

export const temporary = (entityType: EntityType, tempRef: string) => ({
  kind: 'temporary' as const,
  entityType,
  tempRef,
});

export const snapshots: readonly CanonicalEntitySnapshot[] = [
  {
    entityType: 'foundation',
    entityId: 'foundation-1',
    exists: true,
    deleted: false,
    revision: 2,
    parentId: null,
  },
  {
    entityType: 'character',
    entityId: 'char-1',
    exists: true,
    deleted: false,
    revision: 3,
    parentId: null,
  },
  {
    entityType: 'fact',
    entityId: 'fact-1',
    exists: true,
    deleted: false,
    revision: 1,
    parentId: null,
    factKey: 'FK-1',
  },
  {
    entityType: 'roadmap',
    entityId: 'roadmap-1',
    exists: true,
    deleted: false,
    revision: 1,
    parentId: null,
    nextOrdinal: 1,
    nextNarrativeSequence: 10,
  },
  {
    entityType: 'arc',
    entityId: 'arc-1',
    exists: true,
    deleted: false,
    revision: 1,
    parentId: 'roadmap-1',
    ordinal: 0,
    nextOrdinal: 2,
    nextNarrativeSequence: 10,
  },
  {
    entityType: 'chapter',
    entityId: 'chapter-1',
    exists: true,
    deleted: false,
    revision: 1,
    parentId: 'arc-1',
    ordinal: 1,
    narrativeSequence: 10,
    nextOrdinal: 3,
    nextNarrativeSequence: 11,
  },
  {
    entityType: 'beat',
    entityId: 'beat-1',
    exists: true,
    deleted: false,
    revision: 4,
    parentId: 'chapter-1',
    ordinal: 2,
    narrativeSequence: 10,
  },
  {
    entityType: 'reveal',
    entityId: 'reveal-1',
    exists: true,
    deleted: false,
    revision: 1,
    parentId: null,
    targetSequence: 20,
  },
  {
    entityType: 'prose_version',
    entityId: 'pv-1',
    exists: true,
    deleted: false,
    revision: 0,
    parentId: null,
    candidateId: CANDIDATE,
    extractionRunId: RUN,
    content: 'A',
    contentHash: HASH_A,
    beatId: 'beat-1',
  },
];

export const context = (
  contract: ResolutionContext['contract'] = 'beat.write',
  overrides: Partial<ResolutionContext> = {},
): ResolutionContext => ({
  contract,
  candidateId: CANDIDATE,
  extractionRunId: RUN,
  snapshots,
  allocateId: (type, ref) => `${type}-${ref}`,
  allocateOperationId: (ref) => `operation-${ref}`,
  allocateFactKey: (ref) => `FK-${ref}`,
  ...overrides,
});

export const draft = (value: NormalizedOperationDraft): NormalizedOperationDraft => value;

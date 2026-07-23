import { sha256Hex } from '../dependency/canonical-json.js';
import {
  brandCanonicalOperation,
  type CanonicalChangeOperation,
  type UnbrandedCanonicalOperation,
} from './canonical.js';
import { OPERATION_CATALOG, validateCandidateContract } from './catalog.js';
import {
  compareCodeUnits,
  type CanonicalEntitySnapshot,
  type EntityType,
  type Ref,
  type ResolutionContext,
} from './entities.js';
import { resolveProseEvidence, type TemporaryProse } from './evidence.js';
import { OperationDomainError } from './errors.js';
import type { NormalizedOperationDraft } from './normalized.js';
import { hashCanonicalOperations } from './operations-hash.js';
import type {
  CanonicalOperationPayload,
  CanonicalProseEvidenceBinding,
  NormalizedOperationPayload,
} from './payloads.js';
import { buildSnapshotIndex, requireLiveSnapshot, snapshotKey } from './snapshot.js';
import { stableTopologicalSort } from './topo-sort.js';

export interface ResolutionEdge {
  readonly before: string;
  readonly after: string;
}

export interface ResolvedValueNode
  extends Omit<UnbrandedCanonicalOperation, 'ordinal'> {
  readonly localRef: string;
  readonly ordinal: 0;
  readonly referenceEdges: readonly ResolutionEdge[];
  readonly evidenceProseVersionIds: readonly string[];
}

export interface ResolutionValues {
  readonly nodes: readonly ResolvedValueNode[];
  readonly explicitEdges: readonly ResolutionEdge[];
}

export interface ResolvedOperations {
  readonly operations: readonly CanonicalChangeOperation[];
  readonly operationsHash: string;
}

const requiredRevision = (s: CanonicalEntitySnapshot): number => {
  if (s.revision === null) {
    throw new OperationDomainError('REVISION_REQUIRED', 'revision required', {
      entityType: s.entityType,
      entityId: s.entityId,
    });
  }
  return s.revision;
};

const refId = (
  ref: Ref,
  index: ReadonlyMap<string, CanonicalEntitySnapshot>,
  ids: ReadonlyMap<string, { type: EntityType; id: string }>,
  consumer: string,
  edges: ResolutionEdge[],
): string => {
  if (ref.kind === 'existing') {
    return requireLiveSnapshot(index, ref.entityType, ref.entityId).entityId;
  }
  const item = ids.get(ref.tempRef);
  if (!item || item.type !== ref.entityType) {
    throw new OperationDomainError('UNRESOLVED_TEMP_REF', 'unresolved temporary reference', {
      localRef: consumer,
      tempRef: ref.tempRef,
      entityType: ref.entityType,
    });
  }
  edges.push({ before: ref.tempRef, after: consumer });
  return item.id;
};

const sequenceForEvidence = (
  e: CanonicalProseEvidenceBinding,
  index: ReadonlyMap<string, CanonicalEntitySnapshot>,
  temporaryProse: ReadonlyMap<string, TemporaryProse>,
): number => {
  const beatId =
    [...temporaryProse.values()].find((p) => p.id === e.proseVersionId)?.beatId ??
    requireLiveSnapshot(index, 'prose_version', e.proseVersionId).beatId!;
  return requireLiveSnapshot(index, 'beat', beatId).narrativeSequence!;
};

type OutlineEntityType = 'roadmap' | 'arc' | 'chapter' | 'beat';

interface ResolvedOutlineMetadata {
  readonly entityType: OutlineEntityType;
  readonly entityId: string;
  readonly parentId?: string;
  readonly ordinal?: number;
  readonly narrativeSequence?: number;
}

interface TemporaryOutlineMetadata {
  readonly byLocalRef: ReadonlyMap<string, ResolvedOutlineMetadata>;
  readonly byResolvedIdentity: ReadonlyMap<string, ResolvedOutlineMetadata>;
}

const outlineCounterKey = (type: EntityType, id: string) => snapshotKey(type, id);

type OutlineCreateDraft = NormalizedOperationDraft & {
  readonly operationType: 'outline.create';
  readonly payload: Extract<NormalizedOperationPayload, { kind: 'outline.create' | 'outline.update' }> & {
    readonly kind: 'outline.create';
  };
};

function precomputeOutlineCreates(
  drafts: readonly NormalizedOperationDraft[],
  index: ReadonlyMap<string, CanonicalEntitySnapshot>,
  ids: ReadonlyMap<string, { type: EntityType; id: string }>,
): TemporaryOutlineMetadata {
  const pending = new Map(
    drafts
      .filter((d): d is OutlineCreateDraft => d.operationType === 'outline.create')
      .map((d) => [d.localRef, d]),
  );
  const byLocalRef = new Map<string, ResolvedOutlineMetadata>();
  const byResolvedIdentity = new Map<string, ResolvedOutlineMetadata>();
  const nextOrdinal = new Map<string, number>();
  const nextNarrative = new Map<string, number>();

  const counters = (type: EntityType, id: string, temporary: boolean) => {
    const key = outlineCounterKey(type, id);
    if (!nextOrdinal.has(key)) {
      if (temporary) {
        nextOrdinal.set(key, 0);
        nextNarrative.set(key, 0);
      } else {
        const parent = requireLiveSnapshot(index, type, id);
        nextOrdinal.set(key, parent.nextOrdinal!);
        nextNarrative.set(key, parent.nextNarrativeSequence!);
      }
    }
    return key;
  };

  const expose = (localRef: string, metadata: ResolvedOutlineMetadata) => {
    byLocalRef.set(localRef, metadata);
    byResolvedIdentity.set(snapshotKey(metadata.entityType, metadata.entityId), metadata);
  };

  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter(
        (d) =>
          d.payload.node.kind === 'roadmap' ||
          d.payload.node.parent.kind === 'existing' ||
          byLocalRef.has(d.payload.node.parent.tempRef),
      )
      .sort(
        (a, b) =>
          compareCodeUnits(a.target.entityType, b.target.entityType) ||
          compareCodeUnits(a.localRef, b.localRef),
      );
    if (ready.length === 0) {
      throw new OperationDomainError(
        'UNRESOLVED_TEMP_REF',
        'temporary outline parent chain cannot be resolved',
        { localRefs: [...pending.keys()].sort(compareCodeUnits) },
      );
    }
    for (const d of ready) {
      const node = d.payload.node;
      const entityId = ids.get(d.localRef)!.id;
      if (node.kind === 'roadmap') {
        expose(d.localRef, { entityType: 'roadmap', entityId });
        counters('roadmap', entityId, true);
        pending.delete(d.localRef);
        continue;
      }
      const parentId =
        node.parent.kind === 'existing'
          ? requireLiveSnapshot(index, node.parent.entityType, node.parent.entityId).entityId
          : byLocalRef.get(node.parent.tempRef)!.entityId;
      const key = counters(node.parent.entityType, parentId, node.parent.kind === 'temporary');
      const ordinal = nextOrdinal.get(key)!;
      nextOrdinal.set(key, ordinal + 1);
      if (node.kind === 'arc') {
        expose(d.localRef, { entityType: node.kind, entityId, parentId, ordinal });
      } else {
        const narrativeSequence = nextNarrative.get(key)!;
        nextNarrative.set(key, narrativeSequence + 1);
        expose(d.localRef, {
          entityType: node.kind,
          entityId,
          parentId,
          ordinal,
          narrativeSequence,
        });
      }
      counters(node.kind, entityId, true);
      pending.delete(d.localRef);
    }
  }
  return { byLocalRef, byResolvedIdentity };
}

const outlinePosition = (
  ref: Ref,
  index: ReadonlyMap<string, CanonicalEntitySnapshot>,
  temporaryOutline: TemporaryOutlineMetadata,
  ids: ReadonlyMap<string, { type: EntityType; id: string }>,
  consumer: string,
  edges: ResolutionEdge[],
): { readonly entityId: string; readonly narrativeSequence: number } => {
  const entityId = refId(ref, index, ids, consumer, edges);
  if (ref.kind === 'existing') {
    const snapshot = requireLiveSnapshot(index, ref.entityType, entityId);
    return { entityId, narrativeSequence: snapshot.narrativeSequence! };
  }
  const metadata =
    temporaryOutline.byLocalRef.get(ref.tempRef) ??
    temporaryOutline.byResolvedIdentity.get(snapshotKey(ref.entityType, entityId));
  if (
    metadata === undefined ||
    metadata.entityType !== ref.entityType ||
    metadata.narrativeSequence === undefined
  ) {
    throw new OperationDomainError(
      'UNRESOLVED_TEMP_REF',
      'temporary outline position metadata missing',
      {
        localRef: consumer,
        tempRef: ref.tempRef,
        entityType: ref.entityType,
        entityId,
      },
    );
  }
  return { entityId: metadata.entityId, narrativeSequence: metadata.narrativeSequence };
};

export function resolveOperationValues(
  drafts: readonly NormalizedOperationDraft[],
  context: ResolutionContext,
): ResolutionValues {
  validateCandidateContract(context.contract, drafts);

  if (context.contract === 'repair') {
    const b = context.repairBinding;
    if (
      b === undefined ||
      Object.keys(b).sort().join(',') !==
        'extractionSourceProseVersionId,repairedProseVersionId,sourceProseVersionId' ||
      [b.sourceProseVersionId, b.repairedProseVersionId, b.extractionSourceProseVersionId].some(
        (x) => typeof x !== 'string' || x.trim() === '',
      ) ||
      b.sourceProseVersionId === b.repairedProseVersionId ||
      b.extractionSourceProseVersionId !== b.repairedProseVersionId
    ) {
      throw new OperationDomainError(
        'REPAIR_REEXTRACTION_REQUIRED',
        'invalid repair extraction binding',
      );
    }
  }

  const index = buildSnapshotIndex(context.snapshots);
  if (context.contract === 'repair') {
    for (const snapshot of index.values()) {
      if (
        snapshot.entityType === 'prose_version' &&
        snapshot.exists &&
        !snapshot.deleted &&
        (snapshot.candidateId !== context.candidateId ||
          snapshot.extractionRunId !== context.extractionRunId)
      ) {
        throw new OperationDomainError(
          'REPAIR_REEXTRACTION_REQUIRED',
          'repair context contains prose from old extraction provenance',
          {
            proseVersionId: snapshot.entityId,
            actualCandidateId: snapshot.candidateId,
            actualExtractionRunId: snapshot.extractionRunId,
          },
        );
      }
    }
  }
  const semanticDrafts = [...drafts].sort(
    (a, b) =>
      compareCodeUnits(a.operationType, b.operationType) ||
      compareCodeUnits(a.target.entityType, b.target.entityType) ||
      compareCodeUnits(a.localRef, b.localRef),
  );
  const ids = new Map<string, { type: EntityType; id: string }>();
  const allocatedIdentityKey = (type: EntityType, id: string) => snapshotKey(type, id);
  const usedIdentities = new Set(
    [...index.values()].map((s) => allocatedIdentityKey(s.entityType, s.entityId)),
  );
  const usedOperationIds = new Set<string>();
  const usedFactKeys = new Set(
    [...index.values()]
      .filter((s) => s.entityType === 'fact' && s.exists && !s.deleted)
      .map((s) => s.factKey!),
  );

  for (const d of semanticDrafts) {
    if (OPERATION_CATALOG[d.operationType].mode !== 'create') continue;
    const id = context.allocateId(d.target.entityType, d.localRef);
    const identity =
      typeof id === 'string' ? allocatedIdentityKey(d.target.entityType, id) : '';
    if (typeof id !== 'string' || id.trim() === '' || usedIdentities.has(identity)) {
      throw new OperationDomainError(
        'INVALID_SUGGESTION',
        'allocator returned invalid/duplicate entity identity',
        { localRef: d.localRef, entityType: d.target.entityType, entityId: id },
      );
    }
    usedIdentities.add(identity);
    ids.set(d.localRef, { type: d.target.entityType, id });
  }

  const factKeyByLocalRef = new Map<string, string>();
  for (const d of semanticDrafts) {
    if (d.operationType !== 'fact.create') continue;
    const factKey = context.allocateFactKey(d.localRef);
    if (typeof factKey !== 'string' || factKey.trim() === '' || usedFactKeys.has(factKey)) {
      throw new OperationDomainError('INVALID_SUGGESTION', 'invalid/duplicate factKey', {
        localRef: d.localRef,
      });
    }
    usedFactKeys.add(factKey);
    factKeyByLocalRef.set(d.localRef, factKey);
  }

  const temporaryOutline = precomputeOutlineCreates(semanticDrafts, index, ids);
  const temporaryProse = new Map<string, TemporaryProse>();
  for (const d of semanticDrafts) {
    if (d.operationType === 'prose.version.create' && d.payload.kind === 'prose.version.create') {
      const edges: ResolutionEdge[] = [];
      const beatId = refId(d.payload.beat, index, ids, d.localRef, edges);
      const id = ids.get(d.localRef)!.id;
      temporaryProse.set(d.localRef, {
        id,
        beatId,
        content: d.payload.content,
        contentHash: sha256Hex(d.payload.content),
      });
    }
  }

  const revealSequenceByLocalRef = new Map<string, number>();
  for (const d of drafts) {
    if (d.operationType !== 'reveal.create' || d.payload.kind !== 'reveal.create') continue;
    const edges: ResolutionEdge[] = [];
    const chapter = outlinePosition(
      d.payload.position.chapter,
      index,
      temporaryOutline,
      ids,
      d.localRef,
      edges,
    );
    const beat =
      d.payload.position.beat === undefined
        ? undefined
        : outlinePosition(
            d.payload.position.beat,
            index,
            temporaryOutline,
            ids,
            d.localRef,
            edges,
          );
    revealSequenceByLocalRef.set(
      d.localRef,
      beat?.narrativeSequence ?? chapter.narrativeSequence,
    );
  }

  const nodes = semanticDrafts.map((d): ResolvedValueNode => {
    const edges: ResolutionEdge[] = [];
    // Create ops target their own localRef; never emit self-edge for that identity.
    let targetId: string;
    if (d.target.kind === 'existing') {
      targetId = requireLiveSnapshot(index, d.target.entityType, d.target.entityId).entityId;
    } else if (
      OPERATION_CATALOG[d.operationType].mode === 'create' &&
      d.target.tempRef === d.localRef
    ) {
      const item = ids.get(d.localRef);
      if (!item || item.type !== d.target.entityType) {
        throw new OperationDomainError('UNRESOLVED_TEMP_REF', 'unresolved temporary reference', {
          localRef: d.localRef,
          tempRef: d.target.tempRef,
          entityType: d.target.entityType,
        });
      }
      targetId = item.id;
    } else {
      targetId = refId(d.target, index, ids, d.localRef, edges);
    }
    const targetSnapshot =
      d.target.kind === 'existing'
        ? requireLiveSnapshot(index, d.target.entityType, targetId)
        : null;
    const operationId = context.allocateOperationId(d.localRef);
    if (
      typeof operationId !== 'string' ||
      operationId.trim() === '' ||
      usedOperationIds.has(operationId)
    ) {
      throw new OperationDomainError('INVALID_SUGGESTION', 'invalid/duplicate operationId');
    }
    usedOperationIds.add(operationId);
    let payload: CanonicalOperationPayload;
    let expectedRevision: number | null = null;
    const evidenceIds: string[] = [];

    const evidence = (value: Parameters<typeof resolveProseEvidence>[0]) => {
      let e: CanonicalProseEvidenceBinding;
      try {
        e = resolveProseEvidence(value, index, temporaryProse, context);
      } catch (error) {
        if (
          context.contract === 'repair' &&
          error instanceof OperationDomainError &&
          error.code === 'INVALID_PROSE_EVIDENCE_BINDING' &&
          error.details.reason === 'provenance'
        ) {
          throw new OperationDomainError(
            'REPAIR_REEXTRACTION_REQUIRED',
            'repair consumed evidence from old extraction provenance',
            {
              localRef: d.localRef,
              proseVersionId: error.details.proseVersionId,
              actualCandidateId: error.details.actualCandidateId,
              actualExtractionRunId: error.details.actualExtractionRunId,
            },
          );
        }
        throw error;
      }
      evidenceIds.push(e.proseVersionId);
      if (value.proseVersionRef.kind === 'temporary') {
        edges.push({ before: value.proseVersionRef.tempRef, after: d.localRef });
      }
      return e;
    };

    switch (d.operationType) {
      case 'foundation.update': {
        if (d.payload.kind !== 'foundation.update') {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        expectedRevision = requiredRevision(targetSnapshot!);
        payload = d.payload;
        break;
      }
      case 'character.create':
      case 'character.update': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        expectedRevision =
          d.operationType === 'character.update' ? requiredRevision(targetSnapshot!) : null;
        payload = d.payload;
        break;
      }
      case 'fact.create':
      case 'fact.update': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        expectedRevision =
          d.operationType === 'fact.update' ? requiredRevision(targetSnapshot!) : null;
        const factKey =
          d.operationType === 'fact.create'
            ? factKeyByLocalRef.get(d.localRef)!
            : targetSnapshot!.factKey!;
        payload = {
          kind: d.operationType,
          factKey,
          statement: d.payload.statement,
          canonStatus: d.payload.canonStatus,
          visibility: d.payload.visibility,
          source:
            d.payload.source.kind === 'foundation'
              ? { kind: 'foundation' }
              : { kind: 'prose', evidence: evidence(d.payload.source.evidence) },
        };
        break;
      }
      case 'state.append': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        const e = evidence(d.payload.evidence);
        payload = {
          kind: d.operationType,
          effectiveSequence: sequenceForEvidence(e, index, temporaryProse),
          stateKey: d.payload.stateKey,
          value: d.payload.value,
          evidence: e,
        };
        break;
      }
      case 'belief.append': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        const factId = refId(d.payload.fact, index, ids, d.localRef, edges);
        let factKey: string | undefined;
        if (d.payload.fact.kind === 'existing') {
          factKey = requireLiveSnapshot(index, 'fact', factId).factKey!;
        } else {
          factKey = factKeyByLocalRef.get(d.payload.fact.tempRef);
          if (factKey === undefined) {
            throw new OperationDomainError('UNRESOLVED_TEMP_REF', 'missing fact producer', {
              tempRef: d.payload.fact.tempRef,
            });
          }
        }
        const e = evidence(d.payload.evidence);
        const base = {
          kind: d.operationType,
          factId,
          beliefKey: factKey,
          effectiveSequence: sequenceForEvidence(e, index, temporaryProse),
          level: d.payload.level,
          evidence: e,
        } as const;
        payload =
          d.payload.downgradeReason === undefined
            ? base
            : { ...base, downgradeReason: d.payload.downgradeReason };
        break;
      }
      case 'disclosure.append': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        const e = evidence(d.payload.evidence);
        let event:
          | { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' }
          | { readonly kind: 'retract'; readonly disclosureId: string };
        if (d.payload.event.kind === 'disclose') {
          event = d.payload.event;
        } else {
          const disclosureId = refId(
            d.payload.event.disclosure,
            index,
            ids,
            d.localRef,
            edges,
          );
          const disclosure = requireLiveSnapshot(index, 'fact_disclosure', disclosureId);
          let targetFactKey: string | undefined;
          if (d.target.kind === 'existing') {
            targetFactKey = targetSnapshot!.factKey!;
          } else {
            targetFactKey = factKeyByLocalRef.get(d.target.tempRef);
            if (targetFactKey === undefined) {
              throw new OperationDomainError('UNRESOLVED_TEMP_REF', 'missing fact producer', {
                tempRef: d.target.tempRef,
              });
            }
          }
          if (disclosure.factKey !== targetFactKey) {
            throw new OperationDomainError(
              'INVALID_SUGGESTION',
              'retraction belongs to different fact',
            );
          }
          event = { kind: 'retract', disclosureId };
        }
        payload = {
          kind: d.operationType,
          effectiveSequence: sequenceForEvidence(e, index, temporaryProse),
          event,
          evidence: e,
        };
        break;
      }
      case 'reveal.create':
      case 'reveal.update': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        expectedRevision =
          d.operationType === 'reveal.update' ? requiredRevision(targetSnapshot!) : null;
        const factId = refId(d.payload.fact, index, ids, d.localRef, edges);
        const chapter = outlinePosition(
          d.payload.position.chapter,
          index,
          temporaryOutline,
          ids,
          d.localRef,
          edges,
        );
        const beat =
          d.payload.position.beat === undefined
            ? undefined
            : outlinePosition(
                d.payload.position.beat,
                index,
                temporaryOutline,
                ids,
                d.localRef,
                edges,
              );
        const targetSequence = beat?.narrativeSequence ?? chapter.narrativeSequence;
        payload =
          beat === undefined
            ? {
                kind: d.operationType,
                factId,
                chapterId: chapter.entityId,
                targetSequence,
                safeDirectives: d.payload.safeDirectives,
              }
            : {
                kind: d.operationType,
                factId,
                chapterId: chapter.entityId,
                beatId: beat.entityId,
                targetSequence,
                safeDirectives: d.payload.safeDirectives,
              };
        break;
      }
      case 'breadcrumb.create': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        const revealId = refId(d.payload.reveal, index, ids, d.localRef, edges);
        const chapter = outlinePosition(
          d.payload.position.chapter,
          index,
          temporaryOutline,
          ids,
          d.localRef,
          edges,
        );
        const beat =
          d.payload.position.beat === undefined
            ? undefined
            : outlinePosition(
                d.payload.position.beat,
                index,
                temporaryOutline,
                ids,
                d.localRef,
                edges,
              );
        const sequence = beat?.narrativeSequence ?? chapter.narrativeSequence;
        let revealSequence: number | undefined;
        if (d.payload.reveal.kind === 'existing') {
          revealSequence = requireLiveSnapshot(index, 'reveal', revealId).targetSequence!;
        } else {
          revealSequence = revealSequenceByLocalRef.get(d.payload.reveal.tempRef);
          if (revealSequence === undefined) {
            throw new OperationDomainError('UNRESOLVED_TEMP_REF', 'missing reveal producer', {
              tempRef: d.payload.reveal.tempRef,
            });
          }
        }
        if (sequence >= revealSequence) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'breadcrumb must precede reveal');
        }
        payload =
          beat === undefined
            ? {
                kind: d.operationType,
                revealId,
                chapterId: chapter.entityId,
                sequence,
                safeDirective: d.payload.safeDirective,
              }
            : {
                kind: d.operationType,
                revealId,
                chapterId: chapter.entityId,
                beatId: beat.entityId,
                sequence,
                safeDirective: d.payload.safeDirective,
              };
        break;
      }
      case 'outline.create':
      case 'outline.update': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        expectedRevision =
          d.operationType === 'outline.update' ? requiredRevision(targetSnapshot!) : null;
        const node = d.payload.node;
        if (d.operationType === 'outline.update') {
          if (targetSnapshot!.entityType !== d.payload.node.kind) {
            throw new OperationDomainError('INVALID_SUGGESTION', 'outline target type mismatch');
          }
          if (d.payload.node.kind === 'roadmap' && targetSnapshot!.parentId !== null) {
            throw new OperationDomainError('INVALID_SUGGESTION', 'roadmap cannot have parent');
          }
        }
        if (node.kind === 'roadmap') {
          payload = { kind: d.operationType, node };
        } else {
          const parentId = refId(node.parent, index, ids, d.localRef, edges);
          if (
            d.operationType === 'outline.update' &&
            targetSnapshot!.parentId !== parentId
          ) {
            throw new OperationDomainError('INVALID_SUGGESTION', 'outline parent identity changed');
          }
          const metadata =
            d.operationType === 'outline.create'
              ? temporaryOutline.byLocalRef.get(d.localRef)
              : undefined;
          const ordinal =
            d.operationType === 'outline.update'
              ? targetSnapshot!.ordinal!
              : metadata!.ordinal!;
          if (node.kind === 'beat') {
            const narrativeSequence =
              d.operationType === 'outline.update'
                ? targetSnapshot!.narrativeSequence!
                : metadata!.narrativeSequence!;
            payload = {
              kind: d.operationType,
              node: {
                kind: 'beat',
                parentId,
                title: node.title,
                purpose: node.purpose,
                ordinal,
                narrativeSequence,
              },
            };
          } else if (node.kind === 'arc') {
            payload = {
              kind: d.operationType,
              node: { kind: 'arc', parentId, title: node.title, ordinal },
            };
          } else {
            const narrativeSequence =
              d.operationType === 'outline.update'
                ? targetSnapshot!.narrativeSequence!
                : metadata!.narrativeSequence!;
            payload = {
              kind: d.operationType,
              node: {
                kind: 'chapter',
                parentId,
                title: node.title,
                ordinal,
                narrativeSequence,
              },
            };
          }
        }
        break;
      }
      case 'prose.version.create': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        const p = temporaryProse.get(d.localRef)!;
        payload = {
          kind: d.operationType,
          beatId: p.beatId,
          content: p.content,
          contentHash: p.contentHash,
        };
        break;
      }
      case 'prose.accept': {
        if (d.payload.kind !== d.operationType) {
          throw new OperationDomainError('INVALID_SUGGESTION', 'payload mismatch');
        }
        if (
          (context.contract === 'beat.write' || context.contract === 'repair') &&
          d.payload.proseVersion.kind !== 'temporary'
        ) {
          throw new OperationDomainError(
            'PROSE_ACCEPT_REQUIRED',
            'accept must target candidate prose',
          );
        }
        expectedRevision = requiredRevision(targetSnapshot!);
        const proseVersionId = refId(d.payload.proseVersion, index, ids, d.localRef, edges);
        const beatId =
          d.payload.proseVersion.kind === 'temporary'
            ? temporaryProse.get(d.payload.proseVersion.tempRef)!.beatId
            : requireLiveSnapshot(index, 'prose_version', proseVersionId).beatId!;
        if (beatId !== targetId) {
          throw new OperationDomainError(
            'INVALID_SUGGESTION',
            'accepted prose belongs to different beat',
          );
        }
        payload = { kind: d.operationType, proseVersionId };
        break;
      }
    }

    return {
      schemaVersion: 1,
      operationId,
      ordinal: 0,
      operationType: d.operationType,
      targetEntityType: d.target.entityType,
      targetId,
      expectedRevision,
      risk: OPERATION_CATALOG[d.operationType].risk,
      payload,
      localRef: d.localRef,
      referenceEdges: edges,
      evidenceProseVersionIds: evidenceIds,
    };
  });

  if (context.contract === 'repair') {
    const b = context.repairBinding!;
    const producer = nodes.find((n) => n.operationType === 'prose.version.create');
    const accept = nodes.find((n) => n.operationType === 'prose.accept');
    if (
      producer?.targetId !== b.repairedProseVersionId ||
      accept?.payload.kind !== 'prose.accept' ||
      accept.payload.proseVersionId !== b.repairedProseVersionId
    ) {
      throw new OperationDomainError(
        'REPAIR_REEXTRACTION_REQUIRED',
        'repair producer/accept mismatch',
      );
    }
    const factNodes = nodes.filter(
      (node) => node.operationType === 'fact.create' || node.operationType === 'fact.update',
    );
    if (factNodes.length === 0) {
      throw new OperationDomainError(
        'REPAIR_REEXTRACTION_REQUIRED',
        'repair must re-extract at least one fact',
        { reason: 'missing_fact_reextraction' },
      );
    }
    for (const node of factNodes) {
      const source =
        node.payload.kind === 'fact.create' || node.payload.kind === 'fact.update'
          ? node.payload.source
          : undefined;
      if (
        source?.kind !== 'prose' ||
        node.evidenceProseVersionIds.length !== 1 ||
        node.evidenceProseVersionIds[0] !== b.repairedProseVersionId
      ) {
        throw new OperationDomainError(
          'REPAIR_REEXTRACTION_REQUIRED',
          'repair fact source must be exactly repaired prose evidence',
          {
            localRef: node.localRef,
            reason: 'fact_source_not_repaired_prose',
            evidenceProseVersionIds: node.evidenceProseVersionIds,
          },
        );
      }
    }
    const extractionKinds = new Set(['state.append', 'belief.append', 'disclosure.append']);
    for (const node of nodes) {
      if (
        extractionKinds.has(node.operationType) &&
        node.evidenceProseVersionIds.some((id) => id !== b.repairedProseVersionId)
      ) {
        throw new OperationDomainError(
          'REPAIR_REEXTRACTION_REQUIRED',
          'repair evidence uses source prose',
          { localRef: node.localRef },
        );
      }
    }
  }

  return {
    nodes,
    explicitEdges: drafts.flatMap((d) =>
      d.dependsOn.map((before) => ({ before, after: d.localRef })),
    ),
  };
}

export const brandResolvedNode = (node: ResolvedValueNode, ordinal: number) =>
  brandCanonicalOperation({
    schemaVersion: 1,
    operationId: node.operationId,
    ordinal,
    operationType: node.operationType,
    targetEntityType: node.targetEntityType,
    targetId: node.targetId,
    expectedRevision: node.expectedRevision,
    risk: node.risk,
    payload: node.payload,
  });

export function assertProseAcceptLast(
  contract: ResolutionContext['contract'],
  ordered: readonly ResolvedValueNode[],
): void {
  if (contract !== 'beat.write' && contract !== 'repair') return;
  const accepts = ordered.filter((n) => n.operationType === 'prose.accept');
  if (accepts.length !== 1) {
    throw new OperationDomainError('PROSE_ACCEPT_REQUIRED', 'exactly one accept required');
  }
  if (ordered.at(-1)?.localRef !== accepts[0]!.localRef) {
    throw new OperationDomainError('PROSE_ACCEPT_NOT_LAST', 'accept must be last');
  }
}

export function resolveOperations(
  drafts: readonly NormalizedOperationDraft[],
  context: ResolutionContext,
): ResolvedOperations {
  const values = resolveOperationValues(drafts, context);
  const accept = values.nodes.find((n) => n.operationType === 'prose.accept');
  const acceptEdges =
    accept === undefined
      ? []
      : values.nodes
          .filter((n) => n.localRef !== accept.localRef)
          .map((n) => ({ before: n.localRef, after: accept.localRef }));
  const edges = [
    ...values.explicitEdges,
    ...values.nodes.flatMap((n) => n.referenceEdges),
    ...acceptEdges,
  ];
  const ordered = stableTopologicalSort(values.nodes, edges);
  assertProseAcceptLast(context.contract, ordered);
  const operations = ordered.map((node, ordinal) => brandResolvedNode(node, ordinal));
  return { operations, operationsHash: hashCanonicalOperations(operations) };
}

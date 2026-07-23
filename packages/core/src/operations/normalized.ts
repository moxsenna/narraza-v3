import {
  exactRecord,
  nonEmpty,
  nullableString,
  safeInteger,
  SHA256_PATTERN,
  type CanonicalOperationType,
  type EntityType,
  type Ref,
} from './entities.js';
import { OperationDomainError } from './errors.js';
import type {
  BeliefDowngradeReason,
  BeliefLevel,
  CharacterFields,
  CharacterRole,
  FactCanonStatus,
  FactVisibility,
  FoundationChanges,
  NormalizedFactSource,
  NormalizedOperationPayload,
  ProseEvidenceBinding,
} from './payloads.js';
import { parseModelSuggestion, type ModelSuggestionDraft } from './suggestion.js';

export interface NormalizedOperationDraft {
  readonly schemaVersion: 1;
  readonly localRef: string;
  readonly operationType: CanonicalOperationType;
  readonly target: Ref;
  readonly payload: NormalizedOperationPayload;
  readonly dependsOn: readonly string[];
}

const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'invalid enum');
  }
  return value as T;
};

const existing = (id: unknown, entityType: EntityType): Ref => ({
  kind: 'existing',
  entityType,
  entityId: nonEmpty(id),
});

const temporary = (tempRef: unknown, entityType: EntityType): Ref => ({
  kind: 'temporary',
  entityType,
  tempRef: nonEmpty(tempRef),
});

const modelRef = (value: unknown, entityType: EntityType, existingOnly = false): Ref => {
  const r = exactRecord(value, [], ['existingId', 'tempRef']);
  if (Object.keys(r).length !== 1) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'reference needs exactly one identity');
  }
  if (Object.hasOwn(r, 'existingId')) return existing(r.existingId, entityType);
  if (existingOnly) throw new OperationDomainError('INVALID_SUGGESTION', 'temporary target forbidden');
  return temporary(r.tempRef, entityType);
};

const strings = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'expected string array');
  }
  return value.map((item, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new OperationDomainError('INVALID_SUGGESTION', 'sparse array');
    }
    return nonEmpty(item);
  });
};

const alias = (r: Record<string, unknown>, canonical: string, alternative: string): unknown => {
  if (Object.hasOwn(r, canonical) && Object.hasOwn(r, alternative)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'alias collision');
  }
  return Object.hasOwn(r, canonical) ? r[canonical] : r[alternative];
};

const character = (
  value: unknown,
  update: boolean,
): { readonly target?: Ref; readonly fields: CharacterFields } => {
  const r = exactRecord(
    value,
    update
      ? ['target', 'role', 'identity', 'goal', 'motivation', 'address', 'speechStyle']
      : ['role', 'identity', 'goal', 'motivation', 'address', 'speechStyle'],
    ['displayName', 'character_name'],
  );
  return {
    ...(update ? { target: modelRef(r.target, 'character', true) } : {}),
    fields: {
      displayName: nonEmpty(alias(r, 'displayName', 'character_name')),
      role: oneOf<CharacterRole>(r.role, ['main', 'supporting']),
      identity: nullableString(r.identity),
      goal: nullableString(r.goal),
      motivation: nullableString(r.motivation),
      address: nullableString(r.address),
      speechStyle: nullableString(r.speechStyle),
    },
  };
};

const evidence = (value: unknown): ProseEvidenceBinding => {
  const r = exactRecord(value, [
    'proseVersionRef',
    'proseContentHash',
    'startUtf16',
    'endUtf16',
  ]);
  const hash = nonEmpty(r.proseContentHash);
  if (!SHA256_PATTERN.test(hash)) {
    throw new OperationDomainError('INVALID_SUGGESTION', 'invalid evidence hash');
  }
  return {
    proseVersionRef: modelRef(r.proseVersionRef, 'prose_version'),
    proseContentHash: hash,
    startUtf16: safeInteger(r.startUtf16),
    endUtf16: safeInteger(r.endUtf16),
  };
};

const source = (value: unknown): NormalizedFactSource => {
  const r = exactRecord(value, ['kind'], ['evidence']);
  if (r.kind === 'foundation') {
    if (Object.hasOwn(r, 'evidence')) {
      throw new OperationDomainError('INVALID_SUGGESTION', 'foundation source has no evidence');
    }
    return { kind: 'foundation' };
  }
  if (r.kind === 'prose' && Object.hasOwn(r, 'evidence')) {
    return { kind: 'prose', evidence: evidence(r.evidence) };
  }
  throw new OperationDomainError('INVALID_SUGGESTION', 'invalid fact source');
};

const factFields = (r: Record<string, unknown>) => ({
  statement: nonEmpty(alias(r, 'statement', 'fact_text')),
  canonStatus: oneOf<FactCanonStatus>(r.canonStatus, ['draft', 'established', 'disproven']),
  visibility: oneOf<FactVisibility>(r.visibility, ['writer_safe', 'planner_only']),
  source: source(r.source),
});

const position = (value: unknown) => {
  const r = exactRecord(value, ['chapter'], ['beat']);
  const chapter = modelRef(r.chapter, 'chapter');
  return Object.hasOwn(r, 'beat')
    ? { chapter, beat: modelRef(r.beat, 'beat') }
    : { chapter };
};

type OutlineNode = Extract<
  NormalizedOperationPayload,
  { kind: 'outline.create' | 'outline.update' }
>['node'];

const outlineNode = (
  value: unknown,
): {
  readonly entityType: 'roadmap' | 'arc' | 'chapter' | 'beat';
  readonly node: OutlineNode;
} => {
  const base = exactRecord(value, ['kind', 'title'], ['parent', 'purpose']);
  const kind = oneOf(base.kind, ['roadmap', 'arc', 'chapter', 'beat'] as const);
  if (kind === 'roadmap') {
    exactRecord(value, ['kind', 'title']);
    return {
      entityType: 'roadmap',
      node: { kind: 'roadmap', title: nonEmpty(base.title) },
    };
  }
  if (kind === 'beat') {
    const r = exactRecord(value, ['kind', 'parent', 'title', 'purpose']);
    return {
      entityType: 'beat',
      node: {
        kind: 'beat',
        parent: modelRef(r.parent, 'chapter'),
        title: nonEmpty(r.title),
        purpose: nonEmpty(r.purpose),
      },
    };
  }
  if (kind === 'arc') {
    const r = exactRecord(value, ['kind', 'parent', 'title']);
    return {
      entityType: 'arc',
      node: {
        kind: 'arc',
        parent: modelRef(r.parent, 'roadmap'),
        title: nonEmpty(r.title),
      },
    };
  }
  const r = exactRecord(value, ['kind', 'parent', 'title']);
  return {
    entityType: 'chapter',
    node: {
      kind: 'chapter',
      parent: modelRef(r.parent, 'arc'),
      title: nonEmpty(r.title),
    },
  };
};

export function normalizeSuggestion(s: ModelSuggestionDraft): NormalizedOperationDraft {
  const deps = s.dependsOn ?? [];
  switch (s.operationType) {
    case 'foundation.update': {
      const r = exactRecord(s.input, ['target', 'changes']);
      const c = exactRecord(
        r.changes,
        [],
        ['coreConcept', 'conflict', 'endingDirection', 'readerPromise'],
      );
      if (Object.keys(c).length === 0) {
        throw new OperationDomainError('INVALID_SUGGESTION', 'empty changes');
      }
      const changes: FoundationChanges = {};
      for (const key of Object.keys(c) as (keyof FoundationChanges)[]) {
        (changes as Record<string, unknown>)[key] = nullableString(c[key]);
      }
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: modelRef(r.target, 'foundation', true),
        payload: { kind: s.operationType, changes },
        dependsOn: deps,
      };
    }
    case 'character.create':
    case 'character.update': {
      const c = character(s.input, s.operationType === 'character.update');
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: c.target ?? temporary(s.tempRef, 'character'),
        payload: { kind: s.operationType, ...c.fields },
        dependsOn: deps,
      };
    }
    case 'fact.create':
    case 'fact.update': {
      const update = s.operationType === 'fact.update';
      const r = exactRecord(
        s.input,
        update ? ['target', 'canonStatus', 'visibility', 'source'] : ['canonStatus', 'visibility', 'source'],
        ['statement', 'fact_text'],
      );
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: update ? modelRef(r.target, 'fact', true) : temporary(s.tempRef, 'fact'),
        payload: { kind: s.operationType, ...factFields(r) },
        dependsOn: deps,
      };
    }
    case 'state.append': {
      const r = exactRecord(s.input, ['target', 'stateKey', 'value', 'evidence']);
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: modelRef(r.target, 'character', true),
        payload: {
          kind: s.operationType,
          stateKey: nonEmpty(r.stateKey),
          value: nonEmpty(r.value),
          evidence: evidence(r.evidence),
        },
        dependsOn: deps,
      };
    }
    case 'belief.append': {
      const r = exactRecord(
        s.input,
        ['target', 'fact', 'level', 'evidence'],
        ['downgradeReason'],
      );
      const p = {
        kind: s.operationType,
        fact: modelRef(r.fact, 'fact'),
        level: oneOf<BeliefLevel>(r.level, [
          'unknown',
          'suspected',
          'believed',
          'known',
          'disproven',
        ]),
        evidence: evidence(r.evidence),
      } as const;
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: modelRef(r.target, 'character', true),
        payload: Object.hasOwn(r, 'downgradeReason')
          ? {
              ...p,
              downgradeReason: oneOf<BeliefDowngradeReason>(r.downgradeReason, [
                'new_evidence',
                'source_discredited',
                'memory_loss',
                'deliberate_deception',
                'canon_correction',
              ]),
            }
          : p,
        dependsOn: deps,
      };
    }
    case 'disclosure.append': {
      const r = exactRecord(s.input, ['target', 'event', 'evidence']);
      const e = exactRecord(r.event, ['kind'], ['result', 'disclosure']);
      let event:
        | { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' }
        | { readonly kind: 'retract'; readonly disclosure: Ref };
      if (e.kind === 'disclose') {
        exactRecord(r.event, ['kind', 'result']);
        event = {
          kind: 'disclose',
          result: oneOf(e.result, ['suspected', 'known'] as const),
        };
      } else if (e.kind === 'retract') {
        exactRecord(r.event, ['kind', 'disclosure']);
        event = {
          kind: 'retract',
          disclosure: modelRef(e.disclosure, 'fact_disclosure', true),
        };
      } else {
        throw new OperationDomainError('INVALID_SUGGESTION', 'invalid disclosure event');
      }
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: modelRef(r.target, 'fact'),
        payload: {
          kind: s.operationType,
          event,
          evidence: evidence(r.evidence),
        },
        dependsOn: deps,
      };
    }
    case 'reveal.create':
    case 'reveal.update': {
      const update = s.operationType === 'reveal.update';
      const r = exactRecord(
        s.input,
        update
          ? ['target', 'fact', 'position', 'safeDirectives']
          : ['fact', 'position', 'safeDirectives'],
      );
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: update
          ? modelRef(r.target, 'reveal', true)
          : temporary(s.tempRef, 'reveal'),
        payload: {
          kind: s.operationType,
          fact: modelRef(r.fact, 'fact'),
          position: position(r.position),
          safeDirectives: strings(r.safeDirectives),
        },
        dependsOn: deps,
      };
    }
    case 'breadcrumb.create': {
      const r = exactRecord(s.input, ['reveal', 'position', 'safeDirective']);
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: temporary(s.tempRef, 'reveal_breadcrumb'),
        payload: {
          kind: s.operationType,
          reveal: modelRef(r.reveal, 'reveal'),
          position: position(r.position),
          safeDirective: nonEmpty(r.safeDirective),
        },
        dependsOn: deps,
      };
    }
    case 'outline.create':
    case 'outline.update': {
      const update = s.operationType === 'outline.update';
      const r = exactRecord(s.input, update ? ['target', 'node'] : ['node']);
      const parsed = outlineNode(r.node);
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: update
          ? modelRef(r.target, parsed.entityType, true)
          : temporary(s.tempRef, parsed.entityType),
        payload: { kind: s.operationType, node: parsed.node },
        dependsOn: deps,
      };
    }
    case 'prose.version.create': {
      const r = exactRecord(s.input, ['beat'], ['content', 'prose_text']);
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: temporary(s.tempRef, 'prose_version'),
        payload: {
          kind: s.operationType,
          beat: modelRef(r.beat, 'beat'),
          content: nonEmpty(alias(r, 'content', 'prose_text')),
        },
        dependsOn: deps,
      };
    }
    case 'prose.accept': {
      const r = exactRecord(s.input, ['target', 'proseVersion']);
      return {
        schemaVersion: 1,
        localRef: s.tempRef,
        operationType: s.operationType,
        target: modelRef(r.target, 'beat', true),
        payload: {
          kind: s.operationType,
          proseVersion: modelRef(r.proseVersion, 'prose_version'),
        },
        dependsOn: deps,
      };
    }
  }
}

export const parseAndNormalizeSuggestion = (value: unknown): NormalizedOperationDraft =>
  normalizeSuggestion(parseModelSuggestion(value));

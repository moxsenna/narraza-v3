import {
  ContextPacketError,
  PACKET_POLICY_VERSION,
  PACKET_SCHEMA_VERSION,
  type AcceptedProseContext,
  type AuthorPrivateFact,
  type BehavioralCharacterDirective,
  type ContextPacketErrorCode,
  type FoundationPlanningContext,
  type FutureOutlineItem,
  type PacketMetadata,
  type PlannerCharacter,
  type PlannerContextPacket,
  type PlannerPacketInput,
  type PlannerReveal,
  type WriterContextPacket,
  type WriterPacketInput,
  type WriterRevealGuidanceItem,
  type WriterSafeBeatContract,
  type WriterSafeFact,
} from './packet-types.js';

const SHA256 = /^[0-9a-f]{64}$/;
const SERVICE_RESTRICTED_KEYS = new Set([
  'apiKey',
  'credential',
  'credentials',
  'providerMetadata',
  'securityConfig',
  'serviceRestricted',
  'serviceSecret',
]);

function fail(code: ContextPacketErrorCode, path: string, message: string): never {
  throw new ContextPacketError(code, path, message);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_PACKET', path, `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  path: string,
  keys: readonly string[],
): Record<string, unknown> {
  const object = objectAt(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(object)) {
    if (SERVICE_RESTRICTED_KEYS.has(key)) {
      fail('SERVICE_RESTRICTED_DATA', `${path}.${key}`, `${path}.${key} is service restricted`);
    }
    if (!allowed.has(key)) {
      fail('UNKNOWN_KEY', `${path}.${key}`, `${path}.${key} is not allowed`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) {
      fail('INVALID_PACKET', `${path}.${key}`, `${path}.${key} is required`);
    }
  }
  return object;
}

function arrayAt(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail('INVALID_PACKET', path, `${path} must be an array`);
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_PACKET', path, `${path} must be a non-empty string`);
  }
  return value;
}

function literalAt<T extends string>(
  value: unknown,
  expected: T,
  path: string,
  code: ContextPacketErrorCode,
): T {
  if (value !== expected) fail(code, path, `${path} must be ${expected}`);
  return expected;
}

function cloneStrings(value: unknown, path: string): readonly string[] {
  return arrayAt(value, path).map((item, index) => stringAt(item, `${path}[${index}]`));
}

function assertUniqueIds(items: readonly { readonly id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail('DUPLICATE_ENTITY_ID', path, `duplicate entity id ${item.id}`);
    seen.add(item.id);
  }
}

function metadataAt(value: unknown): PacketMetadata {
  const item = exactObject(value, '$.metadata', [
    'schemaVersion',
    'projectId',
    'dependencyHash',
    'policyVersion',
  ]);
  if (item.schemaVersion !== PACKET_SCHEMA_VERSION) {
    fail(
      'UNSUPPORTED_SCHEMA_VERSION',
      '$.metadata.schemaVersion',
      'unsupported packet schema version',
    );
  }
  if (item.policyVersion !== PACKET_POLICY_VERSION) {
    fail(
      'UNSUPPORTED_POLICY_VERSION',
      '$.metadata.policyVersion',
      'unsupported packet policy version',
    );
  }
  const dependencyHash = stringAt(item.dependencyHash, '$.metadata.dependencyHash');
  if (!SHA256.test(dependencyHash)) {
    fail(
      'INVALID_DEPENDENCY_HASH',
      '$.metadata.dependencyHash',
      'dependency hash must be lowercase SHA-256',
    );
  }
  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    projectId: stringAt(item.projectId, '$.metadata.projectId'),
    dependencyHash,
    policyVersion: PACKET_POLICY_VERSION,
  };
}

function positionAt(value: unknown, path: string) {
  const source = objectAt(value, path);
  const hasBeatId = Object.hasOwn(source, 'beatId');
  const item = exactObject(
    value,
    path,
    hasBeatId ? ['chapterId', 'beatId', 'sequence'] : ['chapterId', 'sequence'],
  );
  if (!Number.isSafeInteger(item.sequence) || (item.sequence as number) < 0) {
    fail('INVALID_PACKET', `${path}.sequence`, 'sequence must be a non-negative safe integer');
  }
  return hasBeatId
    ? {
        chapterId: stringAt(item.chapterId, `${path}.chapterId`),
        beatId: stringAt(item.beatId, `${path}.beatId`),
        sequence: item.sequence as number,
      }
    : {
        chapterId: stringAt(item.chapterId, `${path}.chapterId`),
        sequence: item.sequence as number,
      };
}

function beatContractAt(value: unknown, path: string): WriterSafeBeatContract {
  const item = exactObject(value, path, ['beatId', 'purpose', 'sceneGoal', 'directives']);
  return {
    beatId: stringAt(item.beatId, `${path}.beatId`),
    purpose: stringAt(item.purpose, `${path}.purpose`),
    sceneGoal: stringAt(item.sceneGoal, `${path}.sceneGoal`),
    directives: cloneStrings(item.directives, `${path}.directives`),
  };
}

function writerFactAt(value: unknown, path: string): WriterSafeFact {
  const item = exactObject(value, path, ['dataClass', 'id', 'factKey', 'safeStatement']);
  literalAt(item.dataClass, 'writer_safe', `${path}.dataClass`, 'DATA_CLASS_MISMATCH');
  return {
    dataClass: 'writer_safe',
    id: stringAt(item.id, `${path}.id`),
    factKey: stringAt(item.factKey, `${path}.factKey`),
    safeStatement: stringAt(item.safeStatement, `${path}.safeStatement`),
  };
}

function guidanceAt(value: unknown, path: string): WriterRevealGuidanceItem {
  const item = exactObject(value, path, ['revealId', 'guidance']);
  const guidance = exactObject(item.guidance, `${path}.guidance`, ['status', 'safeDirectives']);
  const status = guidance.status;
  if (
    !['before_breadcrumb', 'breadcrumb_due', 'hold', 'reveal_due', 'revealed'].includes(
      status as string,
    )
  ) {
    fail('INVALID_PACKET', `${path}.guidance.status`, 'unsupported reveal guidance status');
  }
  return {
    revealId: stringAt(item.revealId, `${path}.revealId`),
    guidance: {
      status: status as WriterRevealGuidanceItem['guidance']['status'],
      safeDirectives: cloneStrings(guidance.safeDirectives, `${path}.guidance.safeDirectives`),
    },
  };
}

export function buildPlannerPacket(input: PlannerPacketInput): PlannerContextPacket {
  const item = exactObject(input, '$', [
    'kind',
    'dataClass',
    'metadata',
    'foundation',
    'characters',
    'facts',
    'reveals',
    'futureOutline',
  ]);
  literalAt(item.kind, 'planner', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'author_private', '$.dataClass', 'DATA_CLASS_MISMATCH');

  const foundationSource = exactObject(item.foundation, '$.foundation', [
    'coreConcept',
    'conflict',
    'endingDirection',
    'readerPromise',
  ]);
  const foundation: FoundationPlanningContext = {
    coreConcept: stringAt(foundationSource.coreConcept, '$.foundation.coreConcept'),
    conflict: stringAt(foundationSource.conflict, '$.foundation.conflict'),
    endingDirection: stringAt(foundationSource.endingDirection, '$.foundation.endingDirection'),
    readerPromise: stringAt(foundationSource.readerPromise, '$.foundation.readerPromise'),
  };
  const characters: readonly PlannerCharacter[] = arrayAt(item.characters, '$.characters').map(
    (value, index) => {
      const path = `$.characters[${index}]`;
      const source = exactObject(value, path, [
        'id',
        'name',
        'identity',
        'goal',
        'motivation',
        'privateNotes',
      ]);
      return {
        id: stringAt(source.id, `${path}.id`),
        name: stringAt(source.name, `${path}.name`),
        identity: stringAt(source.identity, `${path}.identity`),
        goal: stringAt(source.goal, `${path}.goal`),
        motivation: stringAt(source.motivation, `${path}.motivation`),
        privateNotes: cloneStrings(source.privateNotes, `${path}.privateNotes`),
      };
    },
  );
  const facts: readonly AuthorPrivateFact[] = arrayAt(item.facts, '$.facts').map((value, index) => {
    const path = `$.facts[${index}]`;
    const source = exactObject(value, path, ['dataClass', 'id', 'factKey', 'truth', 'visibility']);
    literalAt(source.dataClass, 'author_private', `${path}.dataClass`, 'DATA_CLASS_MISMATCH');
    if (source.visibility !== 'canonical' && source.visibility !== 'planner_only') {
      fail('INVALID_PACKET', `${path}.visibility`, 'unsupported planner fact visibility');
    }
    return {
      dataClass: 'author_private',
      id: stringAt(source.id, `${path}.id`),
      factKey: stringAt(source.factKey, `${path}.factKey`),
      truth: stringAt(source.truth, `${path}.truth`),
      visibility: source.visibility,
    };
  });
  const reveals: readonly PlannerReveal[] = arrayAt(item.reveals, '$.reveals').map(
    (value, index) => {
      const path = `$.reveals[${index}]`;
      const source = exactObject(value, path, [
        'id',
        'factId',
        'targetPosition',
        'breadcrumbPositions',
      ]);
      return {
        id: stringAt(source.id, `${path}.id`),
        factId: stringAt(source.factId, `${path}.factId`),
        targetPosition: positionAt(source.targetPosition, `${path}.targetPosition`),
        breadcrumbPositions: arrayAt(source.breadcrumbPositions, `${path}.breadcrumbPositions`).map(
          (position, positionIndex) =>
            positionAt(position, `${path}.breadcrumbPositions[${positionIndex}]`),
        ),
      };
    },
  );
  const futureOutline: readonly FutureOutlineItem[] = arrayAt(
    item.futureOutline,
    '$.futureOutline',
  ).map((value, index) => {
    const path = `$.futureOutline[${index}]`;
    const source = exactObject(value, path, ['id', 'position', 'purpose']);
    return {
      id: stringAt(source.id, `${path}.id`),
      position: positionAt(source.position, `${path}.position`),
      purpose: stringAt(source.purpose, `${path}.purpose`),
    };
  });
  assertUniqueIds(characters, '$.characters');
  assertUniqueIds(facts, '$.facts');
  assertUniqueIds(reveals, '$.reveals');
  assertUniqueIds(futureOutline, '$.futureOutline');
  const factIds = new Set(facts.map((fact) => fact.id));
  for (const reveal of reveals) {
    if (!factIds.has(reveal.factId)) {
      fail(
        'UNRESOLVED_REFERENCE',
        '$.reveals',
        `reveal ${reveal.id} references missing fact ${reveal.factId}`,
      );
    }
  }
  return {
    kind: 'planner',
    dataClass: 'author_private',
    metadata: metadataAt(item.metadata),
    foundation,
    characters,
    facts,
    reveals,
    futureOutline,
  } as unknown as PlannerContextPacket;
}

export function buildWriterPacket(input: WriterPacketInput): WriterContextPacket {
  const item = exactObject(input, '$', [
    'kind',
    'dataClass',
    'metadata',
    'beatContract',
    'characterDirectives',
    'establishedFacts',
    'revealGuidance',
    'acceptedProseContext',
  ]);
  literalAt(item.kind, 'writer', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'writer_safe', '$.dataClass', 'DATA_CLASS_MISMATCH');
  const characterDirectives: readonly BehavioralCharacterDirective[] = arrayAt(
    item.characterDirectives,
    '$.characterDirectives',
  ).map((value, index) => {
    const path = `$.characterDirectives[${index}]`;
    const source = exactObject(value, path, ['characterId', 'directives']);
    return {
      characterId: stringAt(source.characterId, `${path}.characterId`),
      directives: cloneStrings(source.directives, `${path}.directives`),
    };
  });
  const establishedFacts = arrayAt(item.establishedFacts, '$.establishedFacts').map(
    (value, index) => writerFactAt(value, `$.establishedFacts[${index}]`),
  );
  const revealGuidance = arrayAt(item.revealGuidance, '$.revealGuidance').map((value, index) =>
    guidanceAt(value, `$.revealGuidance[${index}]`),
  );
  const acceptedProseContext: readonly AcceptedProseContext[] = arrayAt(
    item.acceptedProseContext,
    '$.acceptedProseContext',
  ).map((value, index) => {
    const path = `$.acceptedProseContext[${index}]`;
    const source = exactObject(value, path, ['proseVersionId', 'beatId', 'excerpt']);
    return {
      proseVersionId: stringAt(source.proseVersionId, `${path}.proseVersionId`),
      beatId: stringAt(source.beatId, `${path}.beatId`),
      excerpt: stringAt(source.excerpt, `${path}.excerpt`),
    };
  });
  assertUniqueIds(establishedFacts, '$.establishedFacts');
  return {
    kind: 'writer',
    dataClass: 'writer_safe',
    metadata: metadataAt(item.metadata),
    beatContract: beatContractAt(item.beatContract, '$.beatContract'),
    characterDirectives,
    establishedFacts,
    revealGuidance,
    acceptedProseContext,
  } as unknown as WriterContextPacket;
}

import {
  ContextPacketError,
  PACKET_POLICY_VERSION,
  PACKET_SCHEMA_VERSION,
  type AcceptedProseContext,
  type AuthorPrivateFact,
  type BehavioralCharacterDirective,
  type ContextPacketErrorCode,
  type ExtractionContextPacket,
  type ExtractionPacketInput,
  type FindingLocationInput,
  type FoundationPlanningContext,
  type FutureOutlineItem,
  type IntakeSignalMessage,
  type PacketMetadata,
  type PlannerCharacter,
  type PlannerContextPacket,
  type PlannerPacketInput,
  type PlannerReveal,
  type PublicStructureProse,
  type RepairContextPacket,
  type RepairDirective,
  type RepairPacketInput,
  type RepairableProse,
  type RestrictedGuard,
  type ValidatorBeatContract,
  type ValidatorBeatDirective,
  type ValidatorContextPacket,
  type ValidatorEndingRequirement,
  type ValidatorLengthRange,
  type ValidatorPacketInput,
  type ValidatorProhibitedAction,
  type ValidatorProse,
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

function uniqueStringsAt(value: unknown, path: string): readonly string[] {
  const strings = cloneStrings(value, path);
  if (new Set(strings).size !== strings.length) {
    fail('DUPLICATE_ENTITY_ID', path, `${path} contains duplicate values`);
  }
  return strings;
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

function proseAt(value: unknown, path: string): ValidatorProse {
  const item = exactObject(value, path, ['proseVersionId', 'beatId', 'content']);
  return {
    proseVersionId: stringAt(item.proseVersionId, `${path}.proseVersionId`),
    beatId: stringAt(item.beatId, `${path}.beatId`),
    content: stringAt(item.content, `${path}.content`),
  };
}

function validatorDirectiveAt(value: unknown, path: string): ValidatorBeatDirective {
  const source = objectAt(value, path);
  const hasLexicalEvidence = Object.hasOwn(source, 'lexicalEvidence');
  const item = exactObject(
    value,
    path,
    hasLexicalEvidence
      ? ['directiveKey', 'description', 'lexicalEvidence']
      : ['directiveKey', 'description'],
  );
  const directive = {
    directiveKey: stringAt(item.directiveKey, `${path}.directiveKey`),
    description: stringAt(item.description, `${path}.description`),
  };
  return hasLexicalEvidence
    ? {
        ...directive,
        lexicalEvidence: cloneStrings(item.lexicalEvidence, `${path}.lexicalEvidence`),
      }
    : directive;
}

function prohibitedActionAt(value: unknown, path: string): ValidatorProhibitedAction {
  const source = objectAt(value, path);
  const hasLexicalEvidence = Object.hasOwn(source, 'lexicalEvidence');
  const item = exactObject(
    value,
    path,
    hasLexicalEvidence
      ? ['actionKey', 'description', 'lexicalEvidence']
      : ['actionKey', 'description'],
  );
  const action = {
    actionKey: stringAt(item.actionKey, `${path}.actionKey`),
    description: stringAt(item.description, `${path}.description`),
  };
  return hasLexicalEvidence
    ? {
        ...action,
        lexicalEvidence: cloneStrings(item.lexicalEvidence, `${path}.lexicalEvidence`),
      }
    : action;
}

function validatorBeatContractAt(value: unknown, path: string): ValidatorBeatContract {
  const source = objectAt(value, path);
  const hasEndingRequirement = Object.hasOwn(source, 'endingRequirement');
  const hasLengthRange = Object.hasOwn(source, 'lengthRange');
  const item = exactObject(value, path, [
    'beatId',
    'purpose',
    'requiredCharacterIds',
    'requiredFactKeys',
    'requiredDirectives',
    'prohibitedActions',
    ...(hasEndingRequirement ? ['endingRequirement'] : []),
    ...(hasLengthRange ? ['lengthRange'] : []),
  ]);
  const requiredDirectives = arrayAt(item.requiredDirectives, `${path}.requiredDirectives`).map(
    (directiveValue, index) =>
      validatorDirectiveAt(directiveValue, `${path}.requiredDirectives[${index}]`),
  );
  const prohibitedActions = arrayAt(item.prohibitedActions, `${path}.prohibitedActions`).map(
    (actionValue, index) => prohibitedActionAt(actionValue, `${path}.prohibitedActions[${index}]`),
  );
  const directiveKeys = requiredDirectives.map((directive) => directive.directiveKey);
  if (new Set(directiveKeys).size !== directiveKeys.length) {
    fail(
      'DUPLICATE_ENTITY_ID',
      `${path}.requiredDirectives`,
      `${path}.requiredDirectives contains duplicate directiveKey values`,
    );
  }
  const actionKeys = prohibitedActions.map((action) => action.actionKey);
  if (new Set(actionKeys).size !== actionKeys.length) {
    fail(
      'DUPLICATE_ENTITY_ID',
      `${path}.prohibitedActions`,
      `${path}.prohibitedActions contains duplicate actionKey values`,
    );
  }
  const contract = {
    beatId: stringAt(item.beatId, `${path}.beatId`),
    purpose: stringAt(item.purpose, `${path}.purpose`),
    requiredCharacterIds: uniqueStringsAt(
      item.requiredCharacterIds,
      `${path}.requiredCharacterIds`,
    ),
    requiredFactKeys: uniqueStringsAt(item.requiredFactKeys, `${path}.requiredFactKeys`),
    requiredDirectives,
    prohibitedActions,
  };
  let endingRequirement: ValidatorEndingRequirement | undefined;
  if (hasEndingRequirement) {
    const endingSource = objectAt(item.endingRequirement, `${path}.endingRequirement`);
    const hasLexicalEvidence = Object.hasOwn(endingSource, 'lexicalEvidence');
    const ending = exactObject(
      endingSource,
      `${path}.endingRequirement`,
      hasLexicalEvidence ? ['description', 'lexicalEvidence'] : ['description'],
    );
    const endingBase = {
      description: stringAt(ending.description, `${path}.endingRequirement.description`),
    };
    endingRequirement = hasLexicalEvidence
      ? {
          ...endingBase,
          lexicalEvidence: cloneStrings(
            ending.lexicalEvidence,
            `${path}.endingRequirement.lexicalEvidence`,
          ),
        }
      : endingBase;
  }
  let lengthRange: ValidatorLengthRange | undefined;
  if (hasLengthRange) {
    const range = exactObject(item.lengthRange, `${path}.lengthRange`, ['min', 'max']);
    if (
      !Number.isSafeInteger(range.min) ||
      !Number.isSafeInteger(range.max) ||
      (range.min as number) < 0 ||
      (range.max as number) < (range.min as number)
    ) {
      fail('INVALID_PACKET', `${path}.lengthRange`, 'length range must satisfy 0 <= min <= max');
    }
    lengthRange = { min: range.min as number, max: range.max as number };
  }
  return {
    ...contract,
    ...(endingRequirement === undefined ? {} : { endingRequirement }),
    ...(lengthRange === undefined ? {} : { lengthRange }),
  };
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('INVALID_PACKET', path, `${path} must be a boolean`);
  return value;
}

function termGroupsAt(value: unknown, path: string): readonly (readonly string[])[] {
  return arrayAt(value, path).map((group, index) => {
    const groupPath = `${path}[${index}]`;
    const terms = cloneStrings(group, groupPath);
    if (terms.length < 2) {
      fail('INVALID_PACKET', groupPath, `${groupPath} must contain at least two terms`);
    }
    return terms;
  });
}

function guardAt(value: unknown, path: string): RestrictedGuard {
  const item = exactObject(value, path, [
    'guardKey',
    'prohibitedExact',
    'prohibitedAliases',
    'coOccurrenceGroups',
    'proximityGroups',
    'semanticReviewRequired',
  ]);
  return {
    guardKey: stringAt(item.guardKey, `${path}.guardKey`),
    prohibitedExact: cloneStrings(item.prohibitedExact, `${path}.prohibitedExact`),
    prohibitedAliases: cloneStrings(item.prohibitedAliases, `${path}.prohibitedAliases`),
    coOccurrenceGroups: termGroupsAt(item.coOccurrenceGroups, `${path}.coOccurrenceGroups`),
    proximityGroups: termGroupsAt(item.proximityGroups, `${path}.proximityGroups`),
    semanticReviewRequired: booleanAt(
      item.semanticReviewRequired,
      `${path}.semanticReviewRequired`,
    ),
  };
}

export function buildValidatorPacket(input: ValidatorPacketInput): ValidatorContextPacket {
  const item = exactObject(input, '$', [
    'kind',
    'dataClass',
    'metadata',
    'prose',
    'beatContract',
    'restrictedGuardSets',
    'continuityRules',
  ]);
  literalAt(item.kind, 'validator', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'author_private', '$.dataClass', 'DATA_CLASS_MISMATCH');
  const restrictedGuardSets = arrayAt(item.restrictedGuardSets, '$.restrictedGuardSets').map(
    (value, index) => guardAt(value, `$.restrictedGuardSets[${index}]`),
  );
  const guardKeys = restrictedGuardSets.map((guard) => guard.guardKey);
  if (new Set(guardKeys).size !== guardKeys.length) {
    fail(
      'DUPLICATE_ENTITY_ID',
      '$.restrictedGuardSets',
      '$.restrictedGuardSets contains duplicate guardKey values',
    );
  }
  const continuityRules = arrayAt(item.continuityRules, '$.continuityRules').map((value, index) => {
    const path = `$.continuityRules[${index}]`;
    const source = exactObject(value, path, ['ruleKey', 'instruction', 'restrictedEvidence']);
    return {
      ruleKey: stringAt(source.ruleKey, `${path}.ruleKey`),
      instruction: stringAt(source.instruction, `${path}.instruction`),
      restrictedEvidence: cloneStrings(source.restrictedEvidence, `${path}.restrictedEvidence`),
    };
  });
  return {
    kind: 'validator',
    dataClass: 'author_private',
    metadata: metadataAt(item.metadata),
    prose: proseAt(item.prose, '$.prose'),
    beatContract: validatorBeatContractAt(item.beatContract, '$.beatContract'),
    restrictedGuardSets,
    continuityRules,
  } as unknown as ValidatorContextPacket;
}

function locationAt(value: unknown, path: string): FindingLocationInput {
  const item = exactObject(value, path, ['startUtf16', 'endUtf16']);
  if (!Number.isSafeInteger(item.startUtf16) || !Number.isSafeInteger(item.endUtf16)) {
    fail('INVALID_PACKET', path, 'location offsets must be safe integers');
  }
  const startUtf16 = item.startUtf16 as number;
  const endUtf16 = item.endUtf16 as number;
  if (startUtf16 < 0 || endUtf16 < startUtf16) {
    fail('INVALID_PACKET', path, 'location must satisfy 0 <= startUtf16 <= endUtf16');
  }
  return { startUtf16, endUtf16 };
}

function repairDirectiveAt(value: unknown, path: string): RepairDirective {
  const source = objectAt(value, path);
  const hasLocation = Object.hasOwn(source, 'location');
  const item = exactObject(
    value,
    path,
    hasLocation
      ? ['findingKey', 'publicMessageCode', 'instruction', 'location']
      : ['findingKey', 'publicMessageCode', 'instruction'],
  );
  const base = {
    findingKey: stringAt(item.findingKey, `${path}.findingKey`),
    publicMessageCode: stringAt(item.publicMessageCode, `${path}.publicMessageCode`),
    instruction: stringAt(item.instruction, `${path}.instruction`),
  };
  return hasLocation ? { ...base, location: locationAt(item.location, `${path}.location`) } : base;
}

export function buildRepairPacket(input: RepairPacketInput): RepairContextPacket {
  const item = exactObject(input, '$', [
    'kind',
    'dataClass',
    'metadata',
    'repairableProse',
    'directives',
    'beatContract',
    'revealGuidance',
  ]);
  literalAt(item.kind, 'repair', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'writer_safe', '$.dataClass', 'DATA_CLASS_MISMATCH');
  const repairableProseSource = exactObject(item.repairableProse, '$.repairableProse', [
    'proseVersionId',
    'beatId',
    'content',
  ]);
  const repairableProse: RepairableProse = {
    proseVersionId: stringAt(
      repairableProseSource.proseVersionId,
      '$.repairableProse.proseVersionId',
    ),
    beatId: stringAt(repairableProseSource.beatId, '$.repairableProse.beatId'),
    content: stringAt(repairableProseSource.content, '$.repairableProse.content'),
  };
  const directives = arrayAt(item.directives, '$.directives').map((value, index) =>
    repairDirectiveAt(value, `$.directives[${index}]`),
  );
  const revealGuidance = arrayAt(item.revealGuidance, '$.revealGuidance').map((value, index) =>
    guidanceAt(value, `$.revealGuidance[${index}]`),
  );
  return {
    kind: 'repair',
    dataClass: 'writer_safe',
    metadata: metadataAt(item.metadata),
    repairableProse,
    directives,
    beatContract: beatContractAt(item.beatContract, '$.beatContract'),
    revealGuidance,
  } as unknown as RepairContextPacket;
}

function assertExtractionBase(
  item: Record<string, unknown>,
  expectedClass: 'review_safe' | 'author_private',
): PacketMetadata {
  literalAt(item.kind, 'extraction', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, expectedClass, '$.dataClass', 'DATA_CLASS_MISMATCH');
  return metadataAt(item.metadata);
}

export function buildExtractionPacket(input: ExtractionPacketInput): ExtractionContextPacket {
  const raw = objectAt(input, '$');
  if (raw.useCase === 'intake_signals') {
    const item = exactObject(raw, '$', ['kind', 'dataClass', 'metadata', 'useCase', 'messages']);
    const messages: readonly IntakeSignalMessage[] = arrayAt(item.messages, '$.messages').map(
      (value, index) => {
        const path = `$.messages[${index}]`;
        const source = exactObject(value, path, ['id', 'role', 'content']);
        if (source.role !== 'user' && source.role !== 'assistant') {
          fail('INVALID_PACKET', `${path}.role`, 'message role must be user or assistant');
        }
        return {
          id: stringAt(source.id, `${path}.id`),
          role: source.role,
          content: stringAt(source.content, `${path}.content`),
        };
      },
    );
    assertUniqueIds(messages, '$.messages');
    return {
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata: assertExtractionBase(item, 'review_safe'),
      useCase: 'intake_signals',
      messages,
    } as unknown as ExtractionContextPacket;
  }
  if (raw.useCase === 'prose_public_structure') {
    const item = exactObject(raw, '$', ['kind', 'dataClass', 'metadata', 'useCase', 'prose']);
    const source = exactObject(item.prose, '$.prose', ['proseVersionId', 'content']);
    const prose: PublicStructureProse = {
      proseVersionId: stringAt(source.proseVersionId, '$.prose.proseVersionId'),
      content: stringAt(source.content, '$.prose.content'),
    };
    return {
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata: assertExtractionBase(item, 'review_safe'),
      useCase: 'prose_public_structure',
      prose,
    } as unknown as ExtractionContextPacket;
  }
  if (raw.useCase === 'canon_reconciliation') {
    const item = exactObject(raw, '$', [
      'kind',
      'dataClass',
      'metadata',
      'useCase',
      'prose',
      'facts',
      'characters',
    ]);
    const facts: readonly AuthorPrivateFact[] = arrayAt(item.facts, '$.facts').map(
      (value, index) => {
        const path = `$.facts[${index}]`;
        const source = exactObject(value, path, [
          'dataClass',
          'id',
          'factKey',
          'truth',
          'visibility',
        ]);
        literalAt(source.dataClass, 'author_private', `${path}.dataClass`, 'DATA_CLASS_MISMATCH');
        if (source.visibility !== 'canonical' && source.visibility !== 'planner_only') {
          fail('INVALID_PACKET', `${path}.visibility`, 'unsupported fact visibility');
        }
        return {
          dataClass: 'author_private',
          id: stringAt(source.id, `${path}.id`),
          factKey: stringAt(source.factKey, `${path}.factKey`),
          truth: stringAt(source.truth, `${path}.truth`),
          visibility: source.visibility,
        };
      },
    );
    const characters = arrayAt(item.characters, '$.characters').map((value, index) => {
      const path = `$.characters[${index}]`;
      const source = exactObject(value, path, ['id', 'identity']);
      return {
        id: stringAt(source.id, `${path}.id`),
        identity: stringAt(source.identity, `${path}.identity`),
      };
    });
    assertUniqueIds(facts, '$.facts');
    assertUniqueIds(characters, '$.characters');
    return {
      kind: 'extraction',
      dataClass: 'author_private',
      metadata: assertExtractionBase(item, 'author_private'),
      useCase: 'canon_reconciliation',
      prose: proseAt(item.prose, '$.prose'),
      facts,
      characters,
    } as unknown as ExtractionContextPacket;
  }
  fail('INVALID_PACKET', '$.useCase', 'unsupported extraction use case');
}

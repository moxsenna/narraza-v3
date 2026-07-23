import { describe, expect, it } from 'vitest';
import {
  buildPlannerPacket,
  buildValidatorPacket,
  buildWriterPacket,
  type ContextPacketError,
  type WriterPacketInput,
} from './index.js';

const metadata = {
  schemaVersion: 1,
  projectId: 'project-1',
  dependencyHash: 'a'.repeat(64),
  policyVersion: 'domain-core/v1',
} as const;

const writerInput = (): WriterPacketInput => ({
  kind: 'writer',
  dataClass: 'writer_safe',
  metadata,
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Force a choice',
    sceneGoal: 'Mira refuses the offer',
    directives: ['Show hesitation through action'],
  },
  characterDirectives: [],
  establishedFacts: [],
  revealGuidance: [],
  acceptedProseContext: [],
});

describe('packet metadata', () => {
  it.each([
    ['schemaVersion', 2, 'UNSUPPORTED_SCHEMA_VERSION'],
    ['policyVersion', 'domain-core/v2', 'UNSUPPORTED_POLICY_VERSION'],
    ['dependencyHash', 'ABC', 'INVALID_DEPENDENCY_HASH'],
  ] as const)('rejects invalid %s', (key, value, code) => {
    const input: Record<string, unknown> = { ...writerInput() };
    input.metadata = { ...metadata, [key]: value };
    expect(() => buildWriterPacket(input as never)).toThrowError(
      expect.objectContaining<Partial<ContextPacketError>>({ code }),
    );
  });

  it('rejects empty projectId', () => {
    expect(() =>
      buildWriterPacket({
        ...writerInput(),
        metadata: { ...metadata, projectId: '   ' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('returns fixed writer discrimination', () => {
    const packet = buildWriterPacket(writerInput());
    expect(packet.kind).toBe('writer');
    expect(packet.dataClass).toBe('writer_safe');
    expect(packet.metadata).toEqual(metadata);
  });
});

it('rejects unknown top-level and nested keys', () => {
  const top = { ...writerInput(), truth: 'the heir is alive' };
  expect(() => buildWriterPacket(top as never)).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY', path: '$.truth' }),
  );

  const nested = {
    ...writerInput(),
    beatContract: { ...writerInput().beatContract, futureOutline: 'ambush' },
  };
  expect(() => buildWriterPacket(nested as never)).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY', path: '$.beatContract.futureOutline' }),
  );
});

it.each([
  ['kind', 'planner', 'PACKET_KIND_MISMATCH'],
  ['dataClass', 'author_private', 'DATA_CLASS_MISMATCH'],
] as const)('rejects writer %s mismatch', (key, value, code) => {
  expect(() => buildWriterPacket({ ...writerInput(), [key]: value } as never)).toThrowError(
    expect.objectContaining({ code }),
  );
});

it.each(['serviceSecret', 'apiKey', 'credentials', 'providerMetadata', 'securityConfig'])(
  'rejects service-restricted key %s',
  (key) => {
    expect(() => buildWriterPacket({ ...writerInput(), [key]: 'secret' } as never)).toThrowError(
      expect.objectContaining({ code: 'SERVICE_RESTRICTED_DATA' }),
    );
  },
);

it('rejects duplicate entity IDs', () => {
  const fact = {
    dataClass: 'author_private',
    id: 'fact-1',
    factKey: 'heir_alive',
    truth: 'The heir is alive',
    visibility: 'canonical',
  } as const;
  expect(() =>
    buildPlannerPacket({
      kind: 'planner',
      dataClass: 'author_private',
      metadata,
      foundation: {
        coreConcept: 'Trust after betrayal',
        conflict: 'Mira must choose',
        endingDirection: 'Mira tells the truth',
        readerPromise: 'A fair mystery',
      },
      characters: [],
      facts: [fact, fact],
      reveals: [],
      futureOutline: [],
    }),
  ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
});

it('rejects unresolved planner fact references', () => {
  expect(() =>
    buildPlannerPacket({
      kind: 'planner',
      dataClass: 'author_private',
      metadata,
      foundation: {
        coreConcept: 'Trust after betrayal',
        conflict: 'Mira must choose',
        endingDirection: 'Mira tells the truth',
        readerPromise: 'A fair mystery',
      },
      characters: [],
      facts: [],
      reveals: [
        {
          id: 'reveal-1',
          factId: 'missing-fact',
          targetPosition: { chapterId: 'chapter-2', sequence: 20 },
          breadcrumbPositions: [{ chapterId: 'chapter-1', sequence: 10 }],
        },
      ],
      futureOutline: [],
    }),
  ).toThrowError(expect.objectContaining({ code: 'UNRESOLVED_REFERENCE' }));
});

it('builds author-private validator packet and rejects mismatch', () => {
  const input = {
    kind: 'validator',
    dataClass: 'author_private',
    metadata,
    prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Mira closed the door.' },
    beatContract: {
      beatId: 'beat-1',
      purpose: 'Delay disclosure',
      requiredCharacterIds: ['character-1'],
      requiredFactKeys: ['door_locked'],
      requiredDirectives: [
        {
          directiveKey: 'keep-indirect',
          description: 'Keep the answer indirect',
          lexicalEvidence: ['not yet'],
        },
      ],
      prohibitedActions: [
        {
          actionKey: 'name-heir',
          description: 'Do not name the heir',
          lexicalEvidence: ['the heir is alive'],
        },
      ],
      endingRequirement: { description: 'End on doubt', lexicalEvidence: ['?'] },
      lengthRange: { min: 10, max: 500 },
    },
    restrictedGuardSets: [
      {
        guardKey: 'fact:heir-alive',
        prohibitedExact: ['The heir is alive'],
        prohibitedAliases: ['the lost prince'],
        coOccurrenceGroups: [['heir', 'alive']],
        proximityGroups: [['lost', 'prince']],
        semanticReviewRequired: true,
      },
    ],
    continuityRules: [
      {
        ruleKey: 'door-state',
        instruction: 'Door remains locked',
        restrictedEvidence: ['Mira hid the key'],
      },
    ],
  } as const;
  expect(buildValidatorPacket(input).dataClass).toBe('author_private');
  expect(() => buildValidatorPacket({ ...input, dataClass: 'writer_safe' } as never)).toThrowError(
    expect.objectContaining({ code: 'DATA_CLASS_MISMATCH' }),
  );

  const packet = buildValidatorPacket(input);
  expect(packet.beatContract).toEqual(input.beatContract);
  expect(packet.beatContract).not.toBe(input.beatContract);
  expect(packet.beatContract.requiredCharacterIds).not.toBe(
    input.beatContract.requiredCharacterIds,
  );
  expect(packet.beatContract.requiredDirectives[0]).not.toBe(
    input.beatContract.requiredDirectives[0],
  );
  expect(packet.beatContract.requiredDirectives[0]?.lexicalEvidence).not.toBe(
    input.beatContract.requiredDirectives[0]?.lexicalEvidence,
  );
  expect(packet.beatContract.prohibitedActions[0]).not.toBe(
    input.beatContract.prohibitedActions[0],
  );
  expect(packet.beatContract.endingRequirement).not.toBe(input.beatContract.endingRequirement);
  expect(packet.beatContract.lengthRange).not.toBe(input.beatContract.lengthRange);
  expect(packet.restrictedGuardSets).toEqual(input.restrictedGuardSets);
  expect(packet.restrictedGuardSets).not.toBe(input.restrictedGuardSets);
  expect(packet.restrictedGuardSets[0]).not.toBe(input.restrictedGuardSets[0]);
  expect(packet.restrictedGuardSets[0]?.prohibitedExact).not.toBe(
    input.restrictedGuardSets[0]?.prohibitedExact,
  );
  expect(packet.restrictedGuardSets[0]?.coOccurrenceGroups).not.toBe(
    input.restrictedGuardSets[0]?.coOccurrenceGroups,
  );
  expect(packet.restrictedGuardSets[0]?.coOccurrenceGroups[0]).not.toBe(
    input.restrictedGuardSets[0]?.coOccurrenceGroups[0],
  );
  expect(packet.restrictedGuardSets[0]?.proximityGroups).not.toBe(
    input.restrictedGuardSets[0]?.proximityGroups,
  );
  expect(packet.restrictedGuardSets[0]?.proximityGroups[0]).not.toBe(
    input.restrictedGuardSets[0]?.proximityGroups[0],
  );

  const malformed = {
    ...input,
    beatContract: {
      ...input.beatContract,
      requiredDirectives: [
        { ...input.beatContract.requiredDirectives[0], truth: 'The heir is alive' },
      ],
    },
  };
  expect(() => buildValidatorPacket(malformed as never)).toThrowError(
    expect.objectContaining({
      code: 'UNKNOWN_KEY',
      path: '$.beatContract.requiredDirectives[0].truth',
    }),
  );

  expect(() =>
    buildValidatorPacket({
      ...input,
      beatContract: { ...input.beatContract, requiredCharacterIds: ['character-1', 'character-1'] },
    } as never),
  ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));

  expect(() =>
    buildValidatorPacket({
      ...input,
      beatContract: { ...input.beatContract, lengthRange: { min: 20, max: 10 } },
    } as never),
  ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));

  expect(() =>
    buildValidatorPacket({
      ...input,
      beatContract: {
        ...input.beatContract,
        endingRequirement: { ...input.beatContract.endingRequirement, truth: 'The heir is alive' },
      },
    } as never),
  ).toThrowError(
    expect.objectContaining({
      code: 'UNKNOWN_KEY',
      path: '$.beatContract.endingRequirement.truth',
    }),
  );
});

it.each([
  [
    'requiredDirectives',
    {
      directiveKey: 'keep-indirect',
      description: 'Keep the answer indirect',
    },
  ],
  [
    'prohibitedActions',
    {
      actionKey: 'name-heir',
      description: 'Do not name the heir',
    },
  ],
] as const)('rejects duplicate validator %s keys', (field, entry) => {
  expect(() =>
    buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata,
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
      beatContract: {
        beatId: 'beat-1',
        purpose: 'Test',
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
        [field]: [entry, entry],
      },
      restrictedGuardSets: [],
      continuityRules: [],
    } as never),
  ).toThrowError(
    expect.objectContaining({
      code: 'DUPLICATE_ENTITY_ID',
      path: `$.beatContract.${field}`,
    }),
  );
});

it.each([
  ['revealId', 'reveal-1'],
  ['sensitiveTerms', ['heir', 'alive']],
  ['targetPosition', { chapterId: 'chapter-8', sequence: 80 }],
])('rejects obsolete validator guard field %s', (key, value) => {
  const guard = {
    guardKey: 'fact:heir-alive',
    prohibitedExact: ['The heir is alive'],
    prohibitedAliases: ['the lost prince'],
    coOccurrenceGroups: [['heir', 'alive']],
    proximityGroups: [['lost', 'prince']],
    semanticReviewRequired: true,
    [key]: value,
  };
  expect(() =>
    buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata,
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
      beatContract: {
        beatId: 'beat-1',
        purpose: 'Test',
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
      },
      restrictedGuardSets: [guard],
      continuityRules: [],
    } as never),
  ).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY', path: `$.restrictedGuardSets[0].${key}` }),
  );
});

it.each([
  [{ guardKey: '' }, '$.restrictedGuardSets[0].guardKey'],
  [{ coOccurrenceGroups: [['only-one']] }, '$.restrictedGuardSets[0].coOccurrenceGroups[0]'],
  [{ proximityGroups: [['one', 2]] }, '$.restrictedGuardSets[0].proximityGroups[0][1]'],
  [{ semanticReviewRequired: 'yes' }, '$.restrictedGuardSets[0].semanticReviewRequired'],
])('rejects malformed W1.4 guard value %#', (override, path) => {
  const guard = {
    guardKey: 'fact:heir-alive',
    prohibitedExact: ['The heir is alive'],
    prohibitedAliases: ['the lost prince'],
    coOccurrenceGroups: [['heir', 'alive']],
    proximityGroups: [['lost', 'prince']],
    semanticReviewRequired: true,
    ...override,
  };
  expect(() =>
    buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata,
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
      beatContract: {
        beatId: 'beat-1',
        purpose: 'Test',
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
      },
      restrictedGuardSets: [guard],
      continuityRules: [],
    } as never),
  ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET', path }));
});

it('does not allow validator packet conversion through writer builder', () => {
  const validator = {
    kind: 'validator',
    dataClass: 'author_private',
    metadata,
    prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
    beatContract: {
      beatId: 'beat-1',
      purpose: 'Test',
      requiredCharacterIds: [],
      requiredFactKeys: [],
      requiredDirectives: [],
      prohibitedActions: [],
    },
    restrictedGuardSets: [],
    continuityRules: [],
  } as const;
  expect(() => buildWriterPacket(buildValidatorPacket(validator) as never)).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY' }),
  );
});

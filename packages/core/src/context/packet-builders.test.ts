import { describe, expect, it } from 'vitest';
import {
  ContextPacketError,
  buildPlannerPacket,
  buildWriterPacket,
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

import { describe, expect, it } from 'vitest';
import { buildWriterPacket, type WriterPacketInput } from './index.js';

const safeInput: WriterPacketInput = {
  kind: 'writer',
  dataClass: 'writer_safe',
  metadata: {
    schemaVersion: 1,
    projectId: 'project-1',
    dependencyHash: 'b'.repeat(64),
    policyVersion: 'domain-core/v1',
  },
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Mira tests Raka',
    sceneGoal: 'End with a refusal',
    directives: ['Use a visible pause before the answer'],
  },
  characterDirectives: [{ characterId: 'character-1', directives: ['Avoid eye contact'] }],
  establishedFacts: [
    {
      dataClass: 'writer_safe',
      id: 'fact-safe-1',
      factKey: 'mira_arrived',
      safeStatement: 'Mira arrived before dusk',
    },
  ],
  revealGuidance: [
    { revealId: 'reveal-1', guidance: { status: 'hold', safeDirectives: ['Do not resolve it'] } },
  ],
  acceptedProseContext: [
    { proseVersionId: 'prose-1', beatId: 'beat-0', excerpt: 'Rain covered the road.' },
  ],
};

describe('writer-packet-leak', () => {
  it.each([
    ['truth', 'The heir is alive'],
    ['rawBeliefs', [{ characterId: 'character-1', belief: 'The heir is alive' }]],
    ['restrictedAliases', ['the lost prince']],
    ['restrictedGuardSets', []],
    ['futureOutline', [{ id: 'beat-9' }]],
    ['plannerOnlyFacts', []],
    ['unrevealedFacts', []],
    ['authorPrivate', { truth: 'The heir is alive' }],
  ])('rejects restricted top-level field %s', (key, value) => {
    expect(() => buildWriterPacket({ ...safeInput, [key]: value } as never)).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_KEY' }),
    );
  });

  it('does not retain source arrays or unknown properties', () => {
    const directives = ['Use a visible pause before the answer'];
    const input = {
      ...safeInput,
      beatContract: { ...safeInput.beatContract, directives },
    };
    const packet = buildWriterPacket(input);
    directives.push('Reveal the hidden truth');
    expect(packet.beatContract.directives).toEqual(['Use a visible pause before the answer']);
    expect(Object.keys(packet).sort()).toEqual([
      'acceptedProseContext',
      'beatContract',
      'characterDirectives',
      'dataClass',
      'establishedFacts',
      'kind',
      'metadata',
      'revealGuidance',
    ]);
  });
});

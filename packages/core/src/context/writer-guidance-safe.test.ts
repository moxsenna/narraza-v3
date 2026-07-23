import { expect, it } from 'vitest';
import { buildWriterPacket, type WriterPacketInput } from './index.js';

it('writer-guidance-safe copies only revealId, status, and safeDirectives', () => {
  const input: WriterPacketInput = {
    kind: 'writer',
    dataClass: 'writer_safe',
    metadata: {
      schemaVersion: 1,
      projectId: 'project-1',
      dependencyHash: 'c'.repeat(64),
      policyVersion: 'domain-core/v1',
    },
    beatContract: {
      beatId: 'beat-1',
      purpose: 'Delay disclosure',
      sceneGoal: 'End on doubt',
      directives: [],
    },
    characterDirectives: [],
    establishedFacts: [],
    revealGuidance: [
      {
        revealId: 'reveal-1',
        guidance: { status: 'breadcrumb_due', safeDirectives: ['Mention the empty frame'] },
      },
    ],
    acceptedProseContext: [],
  };

  expect(buildWriterPacket(input).revealGuidance).toEqual([
    {
      revealId: 'reveal-1',
      guidance: { status: 'breadcrumb_due', safeDirectives: ['Mention the empty frame'] },
    },
  ]);

  for (const [key, value] of [
    ['truth', 'The portrait subject is alive'],
    ['prohibitedExact', ['The portrait subject is alive']],
  ] as const) {
    const adversarial = {
      ...input,
      revealGuidance: [
        {
          revealId: 'reveal-1',
          guidance: {
            status: 'breadcrumb_due',
            safeDirectives: ['Mention the empty frame'],
            [key]: value,
          },
        },
      ],
    };
    expect(() => buildWriterPacket(adversarial as never)).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_KEY', path: `$.revealGuidance[0].guidance.${key}` }),
    );
  }
});

import { describe, expect, it } from 'vitest';
import { buildRepairPacket, type RepairPacketInput } from './index.js';

const safeRepair: RepairPacketInput = {
  kind: 'repair',
  dataClass: 'writer_safe',
  metadata: {
    schemaVersion: 1,
    projectId: 'project-1',
    dependencyHash: 'd'.repeat(64),
    policyVersion: 'domain-core/v1',
  },
  repairableProse: {
    proseVersionId: 'prose-2',
    beatId: 'beat-1',
    content: 'Mira named the heir.',
  },
  directives: [
    {
      findingKey: 'finding-1',
      publicMessageCode: 'validation.reveal.too_early',
      instruction: 'Replace the explicit statement with a visible hesitation.',
      location: { startUtf16: 0, endUtf16: 20 },
    },
  ],
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Delay disclosure',
    sceneGoal: 'End on doubt',
    directives: ['Keep the answer indirect'],
  },
  revealGuidance: [
    { revealId: 'reveal-1', guidance: { status: 'hold', safeDirectives: ['Keep it indirect'] } },
  ],
};

describe('repair-packet', () => {
  it('builds only sanitized directives', () => {
    expect(buildRepairPacket(safeRepair).directives).toEqual(safeRepair.directives);
  });

  it.each([
    ['ruleKey', 'reveal.exact'],
    ['severity', 'blocking'],
    ['internalRationale', 'Matched the forbidden truth'],
    ['restrictedEvidence', ['The heir is alive']],
    ['forbiddenPhrase', 'The heir is alive'],
    ['truth', 'The heir is alive'],
  ])('rejects unsanitized directive field %s', (key, value) => {
    const directive = { ...safeRepair.directives[0], [key]: value };
    expect(() =>
      buildRepairPacket({ ...safeRepair, directives: [directive] } as never),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_KEY' }));
  });

  it('rejects malformed UTF-16 location', () => {
    const directive = {
      ...safeRepair.directives[0],
      location: { startUtf16: 21, endUtf16: 20 },
    };
    expect(() =>
      buildRepairPacket({ ...safeRepair, directives: [directive] } as never),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });
});

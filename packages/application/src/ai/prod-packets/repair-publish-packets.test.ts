import { describe, expect, it } from 'vitest';
import type { ValidationFindingRecord } from '../../ports/validation-repo.js';
import { buildPublishPacket } from './publish-packets.js';
import { buildRepairPacket } from './repair-packets.js';

const HASH = 'c'.repeat(64);

function finding(id: string): ValidationFindingRecord {
  return {
    id,
    projectId: 'project-1',
    reportId: 'report-1',
    proseVersionId: 'version-1',
    source: 'deterministic',
    ruleKey: 'beat.prose.empty',
    severity: 'blocking',
    message: 'validation.prose.empty',
    overrideStatus: null,
    overrideReason: null,
  };
}

describe('buildRepairPacket', () => {
  it('builds a writer_safe repair packet with sanitized directives', () => {
    const result = buildRepairPacket({
      projectId: 'project-1',
      dependencyHash: HASH,
      proseVersionId: 'version-1',
      beatId: 'beat-1',
      beatTitle: 'Konfrontasi',
      proseContent: 'Draf bermasalah.',
      findings: [finding('finding-1')],
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.packet.kind).toBe('repair');
    expect(result.packet.dataClass).toBe('writer_safe');
    const payload = result.packet as unknown as {
      directives: { findingKey: string; publicMessageCode: string }[];
    };
    expect(payload.directives).toHaveLength(1);
    expect(payload.directives[0]?.findingKey).toBe('finding-1');
    expect(payload.directives[0]?.publicMessageCode).toBe('validation.prose.empty');
  });

  it('refuses repair without blockers, prose, or identity', () => {
    const base = {
      projectId: 'project-1',
      dependencyHash: HASH,
      proseVersionId: 'version-1',
      beatId: 'beat-1',
      beatTitle: 'Konfrontasi',
      proseContent: 'Draf.',
      findings: [finding('finding-1')],
    };
    expect(buildRepairPacket({ ...base, findings: [] }).kind).toBe('error');
    expect(buildRepairPacket({ ...base, proseContent: '  ' }).kind).toBe('error');
    expect(buildRepairPacket({ ...base, proseVersionId: '' }).kind).toBe('error');
  });
});

describe('buildPublishPacket', () => {
  it('builds a review_safe extraction packet from accepted prose', () => {
    const result = buildPublishPacket({
      projectId: 'project-1',
      dependencyHash: HASH,
      proseVersionId: 'version-1',
      proseContent: 'Naskah resmi.',
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.packet.kind).toBe('extraction');
    expect(result.packet.dataClass).toBe('review_safe');
  });

  it('refuses empty prose or missing identity', () => {
    expect(
      buildPublishPacket({
        projectId: 'project-1',
        dependencyHash: HASH,
        proseVersionId: 'version-1',
        proseContent: '   ',
      }).kind,
    ).toBe('error');
    expect(
      buildPublishPacket({
        projectId: '',
        dependencyHash: HASH,
        proseVersionId: 'version-1',
        proseContent: 'x',
      }).kind,
    ).toBe('error');
  });
});

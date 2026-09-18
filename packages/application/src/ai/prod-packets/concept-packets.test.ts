import { describe, expect, it } from 'vitest';
import { buildConceptPlannerPacket } from './concept-packets.js';

const HASH = 'a'.repeat(64);

describe('buildConceptPlannerPacket', () => {
  it('builds an author_private planner packet from the last user message', () => {
    const result = buildConceptPlannerPacket({
      projectId: 'project-1',
      dependencyHash: HASH,
      lastUserContent: '  Kisah penjaga mercusuar terakhir. ',
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.packet.kind).toBe('planner');
    expect(result.packet.dataClass).toBe('author_private');
    const payload = result.packet as unknown as {
      foundation: { coreConcept: string };
      metadata: { projectId: string; dependencyHash: string };
    };
    expect(payload.foundation.coreConcept).toBe('Kisah penjaga mercusuar terakhir.');
    expect(payload.metadata.projectId).toBe('project-1');
    expect(payload.metadata.dependencyHash).toBe(HASH);
  });

  it('fails prerequisite without a user message, invalid without identity', () => {
    expect(
      buildConceptPlannerPacket({ projectId: 'p', dependencyHash: HASH, lastUserContent: '   ' })
        .kind,
    ).toBe('error');
    const empty = buildConceptPlannerPacket({
      projectId: 'p',
      dependencyHash: HASH,
      lastUserContent: '',
    });
    expect(empty).toEqual({ kind: 'error', error: 'prerequisite' });
    expect(
      buildConceptPlannerPacket({ projectId: '', dependencyHash: HASH, lastUserContent: 'x' }),
    ).toEqual({ kind: 'error', error: 'invalid' });
  });
});

import { describe, expect, it } from 'vitest';
import { buildBeatValidatorPacket, buildBeatWriterPacket } from './beat-packets.js';

const HASH = 'b'.repeat(64);
const base = {
  projectId: 'project-1',
  dependencyHash: HASH,
  beatId: 'beat-1',
  beatTitle: 'Konfrontasi di Gudang',
};

describe('buildBeatWriterPacket', () => {
  it('builds a writer_safe contract packet from the real beat', () => {
    const result = buildBeatWriterPacket(base);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.packet.kind).toBe('writer');
    expect(result.packet.dataClass).toBe('writer_safe');
    const payload = result.packet as unknown as {
      beatContract: { beatId: string; purpose: string };
    };
    expect(payload.beatContract.beatId).toBe('beat-1');
    expect(payload.beatContract.purpose).toBe('Konfrontasi di Gudang');
  });

  it('fails prerequisite on blank title, invalid on blank identity', () => {
    expect(buildBeatWriterPacket({ ...base, beatTitle: '  ' })).toEqual({
      kind: 'error',
      error: 'prerequisite',
    });
    expect(buildBeatWriterPacket({ ...base, beatId: '' })).toEqual({
      kind: 'error',
      error: 'invalid',
    });
  });
});

describe('buildBeatValidatorPacket', () => {
  it('binds the validator to the same beat contract', () => {
    const result = buildBeatValidatorPacket({
      ...base,
      proseVersionId: 'version-1',
      proseBeatId: 'beat-1',
      proseContent: 'Draf awal.',
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.packet.kind).toBe('validator');
    expect(result.packet.dataClass).toBe('author_private');
  });

  it('requires a prose reference', () => {
    expect(
      buildBeatValidatorPacket({
        ...base,
        proseVersionId: '',
        proseBeatId: 'beat-1',
        proseContent: '',
      }),
    ).toEqual({ kind: 'error', error: 'prerequisite' });
  });
});

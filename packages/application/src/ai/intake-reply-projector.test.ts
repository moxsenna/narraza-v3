import { describe, expect, it } from 'vitest';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { createIntakeReplyProjector } from './intake-reply-projector.js';

const base = {
  projectId: 'project-1',
  intakeSessionId: 'session-1',
  jobId: 'job-1',
};

function stubUoW(messages: Array<{ role: string; jobId: string | null }>, inserted: Array<object>) {
  let sequence = messages.length;
  const ports = {
    allocateId: () => `msg-${sequence + 1}`,
    intake: {
      listMessages: async () => messages,
      nextMessageSequence: async () => {
        sequence += 1;
        return sequence;
      },
      insertMessage: async (input: object) => {
        inserted.push(input);
        return { id: `msg-${sequence}`, ...input };
      },
    },
  };
  const uow: UnitOfWork = {
    execute: async (work) => work(ports as never),
  };
  return { uow, inserted };
}

const goodOutputs = {
  intake_reply: { reply: 'Halo! Ceritakan idemu.', signals: [], sufficiency: {} },
};

describe('intake-reply projector', () => {
  it('publishes the winner reply as an assistant message bound to the job', async () => {
    const inserted: Array<object> = [];
    const { uow } = stubUoW([{ role: 'user', jobId: null }], inserted);
    const result = await createIntakeReplyProjector({ unitOfWork: uow }).publish({
      ...base,
      stageOutputs: goodOutputs,
    });
    expect(result.kind).toBe('published');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      role: 'assistant',
      content: 'Halo! Ceritakan idemu.',
      jobId: 'job-1',
    });
  });

  it('replays without duplicating when the job reply already exists', async () => {
    const inserted: Array<object> = [];
    const { uow } = stubUoW(
      [
        { role: 'user', jobId: null },
        { role: 'assistant', jobId: 'job-1' },
      ],
      inserted,
    );
    const result = await createIntakeReplyProjector({ unitOfWork: uow }).publish({
      ...base,
      stageOutputs: goodOutputs,
    });
    expect(result).toEqual({ kind: 'replayed' });
    expect(inserted).toHaveLength(0);
  });

  it('skips safely on missing or malformed output', async () => {
    const inserted: Array<object> = [];
    const { uow } = stubUoW([], inserted);
    const projector = createIntakeReplyProjector({ unitOfWork: uow });
    await expect(projector.publish({ ...base, stageOutputs: {} })).resolves.toEqual({
      kind: 'skipped',
      reason: 'missing_output',
    });
    await expect(
      projector.publish({ ...base, stageOutputs: { intake_reply: { reply: '  ' } } }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'missing_output' });
    expect(inserted).toHaveLength(0);
  });
});

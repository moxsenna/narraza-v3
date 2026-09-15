import { describe, expect, it } from 'vitest';
import { chatThreadStatus } from './chat-status';

const user = (id: string) => ({ id, role: 'user', jobId: null as string | null });
const opener = { id: 'opener', role: 'assistant', jobId: null as string | null };
const reply = (id: string, jobId: string) => ({ id, role: 'assistant', jobId });

describe('chatThreadStatus', () => {
  it('starts idle on an empty thread', () => {
    expect(chatThreadStatus([])).toEqual({
      awaitingReply: false,
      awaitingKey: null,
      hasRealReply: false,
      showFallbackNotice: false,
    });
  });

  it('hides the fallback notice while the opener stands alone', () => {
    expect(chatThreadStatus([opener]).showFallbackNotice).toBe(false);
  });

  it('awaits a reply after a user message with no AI reply yet', () => {
    expect(chatThreadStatus([opener, user('m1')])).toEqual({
      awaitingReply: true,
      awaitingKey: 'm1',
      hasRealReply: false,
      showFallbackNotice: false,
    });
  });

  it('keeps awaiting on newer user messages but remembers past replies', () => {
    const state = chatThreadStatus([opener, user('m1'), reply('r1', 'job-1'), user('m2')]);
    expect(state).toEqual({
      awaitingReply: true,
      awaitingKey: 'm2',
      hasRealReply: true,
      showFallbackNotice: false,
    });
  });

  it('goes quiet once the latest message is a real reply', () => {
    expect(chatThreadStatus([opener, user('m1'), reply('r1', 'job-1')])).toEqual({
      awaitingReply: false,
      awaitingKey: null,
      hasRealReply: true,
      showFallbackNotice: false,
    });
  });

  it('keeps polling on consecutive user messages, fallback only on jobless stall', () => {
    expect(chatThreadStatus([user('m1'), user('m2')])).toEqual({
      awaitingReply: true,
      awaitingKey: 'm2',
      hasRealReply: false,
      showFallbackNotice: false,
    });
    const stalled = [user('m1'), { id: 'stale', role: 'assistant', jobId: null as string | null }];
    expect(chatThreadStatus(stalled)).toEqual({
      awaitingReply: false,
      awaitingKey: null,
      hasRealReply: false,
      showFallbackNotice: true,
    });
  });
});

/**
 * Derives the chat thread footer state from the stored message list.
 *
 * - awaitingReply: the newest message is user-sent, so a worker reply may
 *   still be on its way — the page polls while this holds.
 * - hasRealReply: at least one assistant message carries a job id, i.e. an
 *   AI reply was actually projected (the static opener has none).
 * - showFallbackNotice: user messages exist but nothing is pending and no AI
 *   reply ever landed — the only state where "belum tersedia" is honest.
 */
export interface ChatThreadState {
  readonly awaitingReply: boolean;
  readonly awaitingKey: string | null;
  readonly hasRealReply: boolean;
  readonly showFallbackNotice: boolean;
}

export function chatThreadStatus(
  messages: readonly {
    readonly id: string;
    readonly role: string;
    readonly jobId: string | null;
  }[],
): ChatThreadState {
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const awaitingReply = last !== undefined && last.role === 'user';
  const hasRealReply = messages.some((m) => m.role === 'assistant' && m.jobId !== null);
  return {
    awaitingReply,
    awaitingKey: last !== undefined && awaitingReply ? last.id : null,
    hasRealReply,
    showFallbackNotice: messages.some((m) => m.role === 'user') && !awaitingReply && !hasRealReply,
  };
}

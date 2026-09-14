import type { JsonObject } from '../ports/types.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';

/**
 * Intake-reply product projection (R1 sell-ready). Projects the frozen
 * intake_reply stage winner into an assistant intake message so Chat Narra
 * answers for real. Idempotent by jobId: a replayed publish never duplicates
 * the reply. Malformed outputs skip safely (the job still terminalizes; the
 * user keeps their persisted message and the honest unavailable notice).
 */
export interface PublishIntakeReplyInput {
  readonly projectId: string;
  readonly intakeSessionId: string;
  readonly jobId: string;
  readonly stageOutputs: Readonly<Record<string, JsonObject>>;
}

export type PublishIntakeReplyResult =
  | { readonly kind: 'published'; readonly messageId: string }
  | { readonly kind: 'replayed' }
  | { readonly kind: 'skipped'; readonly reason: 'missing_output' | 'malformed_output' };

function extractReply(stageOutputs: Readonly<Record<string, JsonObject>>): string | null {
  // Orchestrator stores the winner's parsed contract value directly under
  // the stage key: { reply, signals, sufficiency } (no parseFailed wrapper).
  const stage = stageOutputs['intake_reply'];
  if (typeof stage !== 'object' || stage === null) return null;
  const reply = (stage as JsonObject)['reply'];
  return typeof reply === 'string' && reply.trim().length > 0 ? reply : null;
}

export function createIntakeReplyProjector(deps: { unitOfWork: UnitOfWork }) {
  return {
    async publish(input: PublishIntakeReplyInput): Promise<PublishIntakeReplyResult> {
      const reply = extractReply(input.stageOutputs);
      if (reply === null) return { kind: 'skipped', reason: 'missing_output' };
      return deps.unitOfWork.execute(async (ports) => {
        const existing = await ports.intake.listMessages(input.projectId, input.intakeSessionId);
        if (existing.some((m) => m.role === 'assistant' && m.jobId === input.jobId)) {
          return { kind: 'replayed' as const };
        }
        const sequence = await ports.intake.nextMessageSequence(
          input.projectId,
          input.intakeSessionId,
        );
        const message = await ports.intake.insertMessage({
          id: ports.allocateId(),
          projectId: input.projectId,
          intakeSessionId: input.intakeSessionId,
          role: 'assistant',
          sequence,
          content: reply,
          jobId: input.jobId,
        });
        return { kind: 'published' as const, messageId: message.id };
      });
    },
  };
}

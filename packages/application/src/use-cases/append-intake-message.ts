/**
 * appendIntakeMessage — persist user message only (AI reply = M4).
 * Tenant-scoped: wrong owner → NOT_FOUND.
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { IntakeMessageRecord } from '../ports/types.js';

export interface AppendIntakeMessageInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly content: string;
}

export interface AppendIntakeMessageOutput {
  readonly message: IntakeMessageRecord;
  readonly sequence: number;
}

export function createAppendIntakeMessage(
  uow: UnitOfWork,
): (input: AppendIntakeMessageInput) => Promise<Result<AppendIntakeMessageOutput, AppError>> {
  return async (input) => {
    const content = input.content.trim();
    if (!content) {
      return err(appError('VALIDATION', 'msg.intake.empty_message', 422));
    }
    if (content.length > 20_000) {
      return err(appError('VALIDATION', 'msg.intake.message_too_long', 422));
    }

    try {
      const outcome = await uow.execute(async (ports) => {
        const project = await ports.project.findByIdForOwner(
          input.projectId,
          input.ownerUserId,
        );
        if (!project) {
          throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        }

        const session = await ports.intake.findSessionByProject(input.projectId);
        if (!session) {
          throw asDomain(appError('NOT_FOUND', 'msg.intake.session_not_found', 404));
        }

        const sequence = await ports.intake.nextMessageSequence(
          input.projectId,
          session.id,
        );
        const message = await ports.intake.insertMessage({
          id: ports.allocateId(),
          projectId: input.projectId,
          intakeSessionId: session.id,
          role: 'user',
          sequence,
          content,
        });

        return { message, sequence };
      });
      return ok(outcome);
    } catch (e) {
      if (isDomain(e)) return err(e.error);
      const message = e instanceof Error ? e.message : String(e);
      return err(
        appError('VALIDATION', 'msg.intake.append_failed', 500, { message }),
      );
    }
  };
}

class DomainError extends Error {
  readonly __domain = true as const;
  constructor(readonly error: AppError) {
    super(error.publicMessageCode);
    this.name = 'DomainError';
  }
}

function asDomain(error: AppError): DomainError {
  return new DomainError(error);
}

function isDomain(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

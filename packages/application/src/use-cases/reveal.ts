/**
 * Reveal + breadcrumb user-origin via change set (author_private).
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { RevealRecord, JsonObject } from '../ports/types.js';
import { createCommitCanonicalChangeSet } from '../change-set/commit-canonical-change-set.js';

export interface CreateRevealInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly factId: string;
  readonly chapterId: string;
  readonly beatId?: string | null;
  readonly targetSequence: number;
  readonly payload?: JsonObject;
}

export interface CreateRevealOutput {
  readonly reveal: RevealRecord;
  readonly appliedCanonicalVersion: number;
}

export function createCreateReveal(
  uow: UnitOfWork,
): (input: CreateRevealInput) => Promise<Result<CreateRevealOutput, AppError>> {
  const commit = createCommitCanonicalChangeSet(uow);
  return async (input) => {
    if (!input.factId || !input.chapterId || !Number.isFinite(input.targetSequence)) {
      return err(appError('VALIDATION', 'msg.reveal.fields_required', 422));
    }

    const project = await uow.execute(async (ports) =>
      ports.project.findByIdForOwner(input.projectId, input.ownerUserId),
    );
    if (!project) {
      return err(appError('NOT_FOUND', 'msg.project.not_found', 404));
    }

    const fact = await uow.execute(async (ports) =>
      ports.fact.findById(input.projectId, input.factId),
    );
    if (!fact) {
      return err(appError('NOT_FOUND', 'msg.fact.not_found', 404));
    }

    const revealId = crypto.randomUUID();
    const payload: JsonObject = {
      factId: input.factId,
      chapterId: input.chapterId,
      beatId: input.beatId ?? null,
      targetSequence: input.targetSequence,
      safeDirectives: [],
      ...(input.payload ?? {}),
    };

    const result = await commit({
      projectId: input.projectId,
      actorUserId: input.ownerUserId,
      origin: 'user',
      baseCanonicalVersion: project.currentCanonicalVersion,
      operationsHash: await sha256Hex(`${revealId}|${input.factId}|${input.chapterId}`),
      operations: [
        {
          operationId: crypto.randomUUID(),
          ordinal: 0,
          operationType: 'reveal.create',
          targetEntityType: 'reveal',
          targetEntityId: revealId,
          expectedRevision: null,
          risk: 'high',
          payload,
        },
      ],
      requestId: crypto.randomUUID(),
    });
    if (!result.ok) return result;

    const reveal = await uow.execute(async (ports) =>
      ports.reveal.findReveal(input.projectId, revealId),
    );
    if (!reveal) {
      return err(appError('NOT_FOUND', 'msg.reveal.not_found', 404));
    }
    return ok({
      reveal,
      appliedCanonicalVersion: result.value.appliedCanonicalVersion,
    });
  };
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

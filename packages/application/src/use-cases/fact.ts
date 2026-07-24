/**
 * Fact create/update only via commitCanonicalChangeSet (fact-lifecycle).
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { FactRecord, JsonObject } from '../ports/types.js';
import { createCommitCanonicalChangeSet } from '../change-set/commit-canonical-change-set.js';

export interface UpsertFactInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly factId?: string;
  readonly factKey: string;
  readonly statement: string;
  readonly canonStatus?: string;
  readonly visibility?: string;
  readonly expectedRevision?: number | null;
}

export interface UpsertFactOutput {
  readonly fact: FactRecord;
  readonly appliedCanonicalVersion: number;
}

export function createUpsertFact(
  uow: UnitOfWork,
): (input: UpsertFactInput) => Promise<Result<UpsertFactOutput, AppError>> {
  const commit = createCommitCanonicalChangeSet(uow);
  return async (input) => {
    const factKey = input.factKey.trim();
    const statement = input.statement.trim();
    if (!factKey || !statement) {
      return err(appError('VALIDATION', 'msg.fact.fields_required', 422));
    }
    const canonStatus = input.canonStatus ?? 'confirmed';
    const visibility = input.visibility ?? 'private';
    if (!['confirmed', 'deprecated', 'contradicted'].includes(canonStatus)) {
      return err(appError('VALIDATION', 'msg.fact.canon_status_invalid', 422));
    }
    if (!['private', 'reader_known', 'public'].includes(visibility)) {
      return err(appError('VALIDATION', 'msg.fact.visibility_invalid', 422));
    }

    const project = await uow.execute(async (ports) =>
      ports.project.findByIdForOwner(input.projectId, input.ownerUserId),
    );
    if (!project) {
      return err(appError('NOT_FOUND', 'msg.project.not_found', 404));
    }

    const isCreate = !input.factId;
    const factId = input.factId ?? crypto.randomUUID();
    const payload: JsonObject = {
      factKey,
      statement,
      canonStatus,
      visibility,
      source: { kind: 'foundation' },
    };

    const result = await commit({
      projectId: input.projectId,
      actorUserId: input.ownerUserId,
      origin: 'user',
      baseCanonicalVersion: project.currentCanonicalVersion,
      operationsHash: await sha256Hex(`${factId}|${factKey}|${statement}|${canonStatus}`),
      operations: [
        {
          operationId: crypto.randomUUID(),
          ordinal: 0,
          operationType: isCreate ? 'fact.create' : 'fact.update',
          targetEntityType: 'fact',
          targetEntityId: factId,
          expectedRevision: isCreate ? null : (input.expectedRevision ?? null),
          risk: 'high',
          payload,
        },
      ],
      requestId: crypto.randomUUID(),
    });
    if (!result.ok) return result;

    const fact = await uow.execute(async (ports) =>
      ports.fact.findById(input.projectId, factId),
    );
    if (!fact) {
      return err(appError('NOT_FOUND', 'msg.fact.not_found', 404));
    }
    return ok({ fact, appliedCanonicalVersion: result.value.appliedCanonicalVersion });
  };
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

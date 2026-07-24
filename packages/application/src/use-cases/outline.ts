/**
 * Outline CRUD + outline-downstream guard.
 * Beats with accepted prose reject plain upsert → OUTLINE_DOWNSTREAM_LOCKED.
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { OutlineNodeRecord, JsonObject } from '../ports/types.js';
import type { OutlineEntityType } from '../ports/outline-repo.js';
import { createCommitCanonicalChangeSet } from '../change-set/commit-canonical-change-set.js';

export interface UpsertOutlineNodeInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly entityType: OutlineEntityType;
  readonly nodeId?: string;
  readonly parentId?: string | null;
  readonly title: string;
  readonly ordinal?: number | null;
  readonly narrativeSequence?: number | null;
  readonly purpose?: string;
  readonly expectedRevision?: number | null;
  readonly payload?: JsonObject;
}

export interface UpsertOutlineNodeOutput {
  readonly node: OutlineNodeRecord;
  readonly appliedCanonicalVersion: number;
}

export function createUpsertOutlineNode(
  uow: UnitOfWork,
): (input: UpsertOutlineNodeInput) => Promise<Result<UpsertOutlineNodeOutput, AppError>> {
  const commit = createCommitCanonicalChangeSet(uow);
  return async (input) => {
    const title = input.title.trim();
    if (!title) {
      return err(appError('VALIDATION', 'msg.outline.title_required', 422));
    }

    const project = await uow.execute(async (ports) =>
      ports.project.findByIdForOwner(input.projectId, input.ownerUserId),
    );
    if (!project) {
      return err(appError('NOT_FOUND', 'msg.project.not_found', 404));
    }

    const isCreate = !input.nodeId;
    const nodeId = input.nodeId ?? crypto.randomUUID();

    // Downstream guard: beat with accepted prose cannot plain-update.
    if (!isCreate && input.entityType === 'beat') {
      const beat = await uow.execute(async (ports) =>
        ports.outline.findBeat(input.projectId, nodeId),
      );
      if (beat?.acceptedProseVersionId) {
        return err(
          appError(
            'OUTLINE_DOWNSTREAM_LOCKED',
            'msg.outline.downstream_locked',
            409,
            { beatId: nodeId, acceptedProseVersionId: beat.acceptedProseVersionId },
          ),
        );
      }
    }

    const nodePayload = buildNodePayload(input, title);
    const payload: JsonObject = {
      node: nodePayload,
      ...(input.payload ?? {}),
    };

    const result = await commit({
      projectId: input.projectId,
      actorUserId: input.ownerUserId,
      origin: 'user',
      baseCanonicalVersion: project.currentCanonicalVersion,
      operationsHash: await sha256Hex(
        `${input.entityType}|${nodeId}|${title}|${input.ordinal ?? ''}`,
      ),
      operations: [
        {
          operationId: crypto.randomUUID(),
          ordinal: 0,
          operationType: isCreate ? 'outline.create' : 'outline.update',
          targetEntityType:
            input.entityType === 'roadmap'
              ? 'roadmap'
              : input.entityType === 'arc'
                ? 'arc'
                : input.entityType === 'chapter'
                  ? 'chapter'
                  : 'beat',
          targetEntityId: nodeId,
          expectedRevision: isCreate ? null : (input.expectedRevision ?? null),
          risk: 'medium',
          payload,
        },
      ],
      requestId: crypto.randomUUID(),
    });
    if (!result.ok) return result;

    const node = await uow.execute(async (ports) =>
      ports.outline.findNode(input.projectId, input.entityType, nodeId),
    );
    if (!node) {
      return err(appError('NOT_FOUND', 'msg.outline.not_found', 404));
    }
    return ok({
      node,
      appliedCanonicalVersion: result.value.appliedCanonicalVersion,
    });
  };
}

function buildNodePayload(
  input: UpsertOutlineNodeInput,
  title: string,
): JsonObject {
  if (input.entityType === 'roadmap') {
    return { kind: 'roadmap', title };
  }
  if (input.entityType === 'arc') {
    return {
      kind: 'arc',
      parentId: input.parentId ?? '',
      title,
      ordinal: input.ordinal ?? 0,
    };
  }
  if (input.entityType === 'chapter') {
    return {
      kind: 'chapter',
      parentId: input.parentId ?? '',
      title,
      ordinal: input.ordinal ?? 0,
      narrativeSequence: input.narrativeSequence ?? 0,
    };
  }
  return {
    kind: 'beat',
    parentId: input.parentId ?? '',
    title,
    purpose: input.purpose ?? title,
    ordinal: input.ordinal ?? 0,
    narrativeSequence: input.narrativeSequence ?? 0,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

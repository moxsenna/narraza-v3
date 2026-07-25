/**
 * Character CRUD via change set (user-origin) after project exists.
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { CharacterRecord, JsonObject } from '../ports/types.js';
import { createCommitCanonicalChangeSet } from '../change-set/commit-canonical-change-set.js';

export interface UpsertCharacterInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly characterId?: string;
  readonly displayName: string;
  readonly role: string;
  readonly payload?: JsonObject;
  readonly expectedRevision?: number | null;
}

export interface UpsertCharacterOutput {
  readonly character: CharacterRecord;
  readonly appliedCanonicalVersion: number;
}

export function createUpsertCharacter(
  uow: UnitOfWork,
): (input: UpsertCharacterInput) => Promise<Result<UpsertCharacterOutput, AppError>> {
  const commit = createCommitCanonicalChangeSet(uow);
  return async (input) => {
    const displayName = input.displayName.trim();
    const role = input.role.trim();
    if (!displayName || !role) {
      return err(appError('VALIDATION', 'msg.character.fields_required', 422));
    }

    const project = await uow.execute(async (ports) =>
      ports.project.findByIdForOwner(input.projectId, input.ownerUserId),
    );
    if (!project) {
      return err(appError('NOT_FOUND', 'msg.project.not_found', 404));
    }

    const isCreate = !input.characterId;
    const characterId = input.characterId ?? crypto.randomUUID();
    const payload: JsonObject = {
      displayName,
      role,
      identity: null,
      goal: null,
      motivation: null,
      address: null,
      speechStyle: null,
      ...(input.payload ?? {}),
    };

    const result = await commit({
      projectId: input.projectId,
      actorUserId: input.ownerUserId,
      origin: 'user',
      baseCanonicalVersion: project.currentCanonicalVersion,
      operationsHash: await hashPlaceholder(characterId, displayName),
      operations: [
        {
          operationId: crypto.randomUUID(),
          ordinal: 0,
          operationType: isCreate ? 'character.create' : 'character.update',
          targetEntityType: 'character',
          targetEntityId: characterId,
          expectedRevision: isCreate ? null : (input.expectedRevision ?? null),
          risk: isCreate ? 'low' : 'medium',
          payload,
        },
      ],
      requestId: crypto.randomUUID(),
    });
    if (!result.ok) return result;

    const character = await uow.execute(async (ports) =>
      ports.character.findById(input.projectId, characterId),
    );
    if (!character) {
      return err(appError('NOT_FOUND', 'msg.character.not_found', 404));
    }
    return ok({
      character,
      appliedCanonicalVersion: result.value.appliedCanonicalVersion,
    });
  };
}

/** Stable 64-hex placeholder for user-origin ops until full ops-hash wired. */
async function hashPlaceholder(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join('|'));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

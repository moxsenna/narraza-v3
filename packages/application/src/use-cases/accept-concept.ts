/**
 * acceptConcept (seeded) — M2 exit gate, no AI.
 * Selecting a concept materializes a foundation **draft** (never locked/confirmed)
 * through the single write door (canon +1 once).
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { FoundationRecord, JsonObject } from '../ports/types.js';
import type { ConceptRecord } from '../ports/concept-repo.js';
import { createCommitCanonicalChangeSet } from '../change-set/commit-canonical-change-set.js';

export interface AcceptConceptInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly conceptId: string;
  /** Optional CAS base; defaults to current project version. */
  readonly baseCanonicalVersion?: number;
}

export interface AcceptConceptOutput {
  readonly concept: ConceptRecord;
  readonly foundation: FoundationRecord;
  readonly appliedCanonicalVersion: number;
  readonly changeSetId: string;
}

export function createAcceptConcept(
  uow: UnitOfWork,
): (input: AcceptConceptInput) => Promise<Result<AcceptConceptOutput, AppError>> {
  const commit = createCommitCanonicalChangeSet(uow);
  return async (input) => {
    try {
      // Read path: tenant-scoped lookups only (projectId + owner + concept under project).
      const loaded = await uow.execute(async (ports) => {
        const project = await ports.project.findByIdForOwner(
          input.projectId,
          input.ownerUserId,
        );
        if (!project) {
          throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        }
        const concept = await ports.concept.findConcept(input.projectId, input.conceptId);
        if (!concept) {
          throw asDomain(appError('NOT_FOUND', 'msg.concept.not_found', 404));
        }
        const set = await ports.concept.findSet(input.projectId, concept.conceptSetId);
        if (!set) {
          throw asDomain(appError('NOT_FOUND', 'msg.concept.not_found', 404));
        }
        const existingFoundation = await ports.foundation.findByProjectId(input.projectId);
        return { project, concept, set, existingFoundation };
      });

      if (input.baseCanonicalVersion !== undefined) {
        if (loaded.project.currentCanonicalVersion !== input.baseCanonicalVersion) {
          return err(
            appError('CAS_FAILED', 'msg.changeset.cas_failed', 409, {
              expected: input.baseCanonicalVersion,
              actual: loaded.project.currentCanonicalVersion,
            }),
          );
        }
      }

      // Repeat accept of same selection: no duplicate foundation, no partial state.
      if (
        loaded.existingFoundation &&
        loaded.existingFoundation.status === 'draft' &&
        foundationMatchesConcept(loaded.existingFoundation.payload, loaded.concept)
      ) {
        return ok({
          concept: loaded.concept,
          foundation: loaded.existingFoundation,
          appliedCanonicalVersion: loaded.project.currentCanonicalVersion,
          changeSetId: '',
        });
      }

      // Locked/confirmed foundation cannot be overwritten by concept accept.
      if (
        loaded.existingFoundation &&
        (loaded.existingFoundation.status === 'locked' ||
          loaded.existingFoundation.status === 'confirmed')
      ) {
        return err(
          appError('FOUNDATION_LOCKED', 'msg.foundation.locked', 409, {
            status: loaded.existingFoundation.status,
          }),
        );
      }

      const foundationId = loaded.existingFoundation?.id ?? crypto.randomUUID();
      const foundationPayload = foundationPayloadFromConcept(loaded.concept);
      const expectedRevision = loaded.existingFoundation?.revision ?? null;

      // Ensure foundation row exists before foundation.update apply (create-or-update).
      await uow.execute(async (ports) => {
        if (!loaded.existingFoundation) {
          await ports.foundation.insert({
            id: foundationId,
            projectId: input.projectId,
            status: 'draft',
            payload: foundationPayload,
          });
        }
        await ports.concept.markSetSelected(input.projectId, loaded.concept.conceptSetId);
      });

      const baseVersion =
        input.baseCanonicalVersion ?? loaded.project.currentCanonicalVersion;

      // Re-read project version after prep tx (may be unchanged).
      const projectNow = await uow.execute(async (ports) =>
        ports.project.findByIdForOwner(input.projectId, input.ownerUserId),
      );
      if (!projectNow) {
        return err(appError('NOT_FOUND', 'msg.project.not_found', 404));
      }
      if (projectNow.currentCanonicalVersion !== baseVersion) {
        return err(
          appError('CAS_FAILED', 'msg.changeset.cas_failed', 409, {
            expected: baseVersion,
            actual: projectNow.currentCanonicalVersion,
          }),
        );
      }

      const result = await commit({
        projectId: input.projectId,
        actorUserId: input.ownerUserId,
        origin: 'user',
        baseCanonicalVersion: baseVersion,
        operationsHash: await sha256Hex(
          `accept-concept|${input.conceptId}|${foundationId}|${baseVersion}`,
        ),
        operations: [
          {
            operationId: crypto.randomUUID(),
            ordinal: 0,
            operationType: 'foundation.update',
            targetEntityType: 'foundation',
            // foundation.update target is projectId (1:1 foundation by project).
            targetEntityId: input.projectId,
            expectedRevision,
            risk: 'medium',
            payload: foundationPayload,
          },
        ],
        requestId: crypto.randomUUID(),
      });
      if (!result.ok) return result;

      // Reload foundation after apply.
      const foundation = await uow.execute(async (ports) =>
        ports.foundation.findByProjectId(input.projectId),
      );
      if (!foundation) {
        return err(appError('NOT_FOUND', 'msg.foundation.not_found', 404));
      }
      if (foundation.status !== 'draft' || foundation.lockedAt !== null) {
        return err(
          appError('CHANGE_SET_INVALID', 'msg.concept.accept_bad_state', 500, {
            status: foundation.status,
          }),
        );
      }

      return ok({
        concept: loaded.concept,
        foundation,
        appliedCanonicalVersion: result.value.appliedCanonicalVersion,
        changeSetId: result.value.changeSetId,
      });
    } catch (e) {
      if (isDomain(e)) return err(e.error);
      const message = e instanceof Error ? e.message : String(e);
      return err(
        appError('VALIDATION', 'msg.concept.accept_failed', 500, { message }),
      );
    }
  };
}

export function foundationPayloadFromConcept(concept: ConceptRecord): JsonObject {
  const fromPayload = concept.payload;
  // Prefer structured readiness fields if present in concept payload; else derive draft fields.
  return {
    coreConcept:
      typeof fromPayload.coreConcept === 'string'
        ? fromPayload.coreConcept
        : `${concept.title}: ${concept.synopsis}`,
    conflict: typeof fromPayload.conflict === 'string' ? fromPayload.conflict : null,
    endingDirection:
      typeof fromPayload.endingDirection === 'string' ? fromPayload.endingDirection : null,
    readerPromise:
      typeof fromPayload.readerPromise === 'string' ? fromPayload.readerPromise : null,
    mainCharacter: fromPayload.mainCharacter ?? null,
    relationships: Array.isArray(fromPayload.relationships) ? fromPayload.relationships : [],
    secrets: Array.isArray(fromPayload.secrets) ? fromPayload.secrets : [],
    sourceConceptId: concept.id,
    sourceConceptSetId: concept.conceptSetId,
    sourceConceptTitle: concept.title,
    sourceConceptSynopsis: concept.synopsis,
  };
}

function foundationMatchesConcept(payload: JsonObject, concept: ConceptRecord): boolean {
  return payload.sourceConceptId === concept.id;
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

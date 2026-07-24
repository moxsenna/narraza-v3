/**
 * Foundation draft / confirm / lock (W2.3).
 * - Draft upsert: direct write, no canon bump (pre-canon working state).
 * - Confirm: draft → confirmed.
 * - Lock: readiness guard via core policy; confirmed → locked + audit.
 */
import { foundation as coreFoundation } from '@narraza/core';
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { FoundationRecord, JsonObject } from '../ports/types.js';

export interface UpdateFoundationDraftInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly payload: JsonObject;
  readonly expectedRevision: number | null;
}

export interface ConfirmFoundationInput {
  readonly ownerUserId: string;
  readonly projectId: string;
}

export interface LockFoundationInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  /** Caller must confirm consequences (UI checkbox). */
  readonly acknowledged: boolean;
}

export interface FoundationOutput {
  readonly foundation: FoundationRecord;
}

export function createUpdateFoundationDraft(
  uow: UnitOfWork,
): (input: UpdateFoundationDraftInput) => Promise<Result<FoundationOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        const project = await ports.project.findByIdForOwner(
          input.projectId,
          input.ownerUserId,
        );
        if (!project) {
          throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        }

        const existing = await ports.foundation.findByProjectId(input.projectId);
        if (existing?.status === 'locked') {
          throw asDomain(appError('FOUNDATION_LOCKED', 'msg.foundation.locked', 409));
        }

        if (!existing) {
          const created = await ports.foundation.insert({
            id: ports.allocateId(),
            projectId: input.projectId,
            status: 'draft',
            payload: input.payload,
          });
          return { foundation: created };
        }

        if (existing.status !== 'draft') {
          // confirmed: allow draft-like field edits only via re-open path later;
          // for M2, only draft is freely editable.
          throw asDomain(
            appError('FOUNDATION_LOCKED', 'msg.foundation.not_draft', 409, {
              status: existing.status,
            }),
          );
        }

        const expected = input.expectedRevision ?? existing.revision;
        const updated = await ports.foundation.updateDraft(
          input.projectId,
          input.payload,
          expected,
        );
        if (!updated) {
          throw asDomain(appError('CAS_FAILED', 'msg.foundation.cas_failed', 409));
        }
        return { foundation: updated };
      });
      return ok(outcome);
    } catch (e) {
      if (isDomain(e)) return err(e.error);
      const message = e instanceof Error ? e.message : String(e);
      return err(appError('VALIDATION', 'msg.foundation.update_failed', 500, { message }));
    }
  };
}

export function createConfirmFoundation(
  uow: UnitOfWork,
): (input: ConfirmFoundationInput) => Promise<Result<FoundationOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        const project = await ports.project.findByIdForOwner(
          input.projectId,
          input.ownerUserId,
        );
        if (!project) {
          throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        }
        const existing = await ports.foundation.findByProjectId(input.projectId);
        if (!existing) {
          throw asDomain(appError('NOT_FOUND', 'msg.foundation.not_found', 404));
        }
        if (existing.status === 'locked') {
          throw asDomain(appError('FOUNDATION_LOCKED', 'msg.foundation.locked', 409));
        }
        if (existing.status === 'confirmed') {
          return { foundation: existing };
        }
        const now = await ports.dbNow();
        const confirmed = await ports.foundation.markConfirmed(input.projectId, now);
        if (!confirmed) {
          throw asDomain(appError('CAS_FAILED', 'msg.foundation.cas_failed', 409));
        }
        return { foundation: confirmed };
      });
      return ok(outcome);
    } catch (e) {
      if (isDomain(e)) return err(e.error);
      const message = e instanceof Error ? e.message : String(e);
      return err(appError('VALIDATION', 'msg.foundation.confirm_failed', 500, { message }));
    }
  };
}

export function createLockFoundation(
  uow: UnitOfWork,
): (input: LockFoundationInput) => Promise<Result<FoundationOutput, AppError>> {
  return async (input) => {
    if (!input.acknowledged) {
      return err(appError('VALIDATION', 'msg.foundation.lock_not_acknowledged', 422));
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
        const existing = await ports.foundation.findByProjectId(input.projectId);
        if (!existing) {
          throw asDomain(appError('NOT_FOUND', 'msg.foundation.not_found', 404));
        }
        if (existing.status === 'locked') {
          return { foundation: existing };
        }
        if (existing.status !== 'confirmed') {
          throw asDomain(
            appError('VALIDATION', 'msg.foundation.must_confirm_first', 422, {
              status: existing.status,
            }),
          );
        }

        // Readiness guard (D5) — map payload to core input shape.
        const readinessInput = toReadinessInput(existing.payload);
        let readiness: coreFoundation.ReadinessResult;
        try {
          readiness = coreFoundation.calculateFoundationReadiness(readinessInput);
        } catch {
          throw asDomain(
            appError('FOUNDATION_NOT_READY', 'msg.foundation.not_ready', 422, {
              reason: 'invalid_payload',
            }),
          );
        }
        if (readiness.percent < 100 || readiness.checklist.some((c) => !c.complete)) {
          throw asDomain(
            appError('FOUNDATION_NOT_READY', 'msg.foundation.not_ready', 422, {
              percent: readiness.percent,
              next: readiness.nextRecommendation,
            }),
          );
        }

        const now = await ports.dbNow();
        const locked = await ports.foundation.markLocked(input.projectId, now);
        if (!locked) {
          throw asDomain(appError('CAS_FAILED', 'msg.foundation.cas_failed', 409));
        }
        await ports.audit.append({
          userId: input.ownerUserId,
          action: 'foundation.locked',
          entityType: 'foundation',
          entityId: locked.id,
          metadata: { projectId: input.projectId, percent: readiness.percent },
        });
        return { foundation: locked };
      });
      return ok(outcome);
    } catch (e) {
      if (isDomain(e)) return err(e.error);
      const message = e instanceof Error ? e.message : String(e);
      return err(appError('VALIDATION', 'msg.foundation.lock_failed', 500, { message }));
    }
  };
}

/**
 * Foundation draft payload stores the readiness input fields at the top level
 * (same shape as core FoundationReadinessInput). Core validates exact keys.
 */
export function toReadinessInput(payload: JsonObject): unknown {
  return {
    coreConcept: payload.coreConcept ?? null,
    mainCharacter: payload.mainCharacter ?? null,
    relationships: Array.isArray(payload.relationships) ? payload.relationships : [],
    conflict: payload.conflict ?? null,
    endingDirection: payload.endingDirection ?? null,
    readerPromise: payload.readerPromise ?? null,
    secrets: Array.isArray(payload.secrets) ? payload.secrets : [],
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

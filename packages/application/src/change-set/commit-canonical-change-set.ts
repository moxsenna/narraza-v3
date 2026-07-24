/**
 * Single write door (S2.2 / S4.4 base). One PG transaction via UnitOfWork:
 *   lock project (FOR UPDATE, owner-bound) → assert base version (CAS)
 *   → insert CanonicalChangeSet pending → insert operations
 *   → apply each op in ordinal order → mark applied
 *   → bump project.canonicalVersion += 1 ONCE → AuditEvent + OutboxEvent
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { TxPorts, UnitOfWork } from '../ports/unit-of-work.js';
import {
  applyOperation,
  type CanonicalOpPersist,
} from './apply-operations.js';

export interface CommitChangeSetInput {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly origin: 'user' | 'ai' | 'system';
  readonly baseCanonicalVersion: number;
  readonly operationsHash: string;
  readonly operations: readonly CanonicalOpPersist[];
  readonly requestId: string;
}

export interface CommitChangeSetOutput {
  readonly changeSetId: string;
  readonly appliedCanonicalVersion: number;
}

export function createCommitCanonicalChangeSet(
  uow: UnitOfWork,
): (input: CommitChangeSetInput) => Promise<Result<CommitChangeSetOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports: TxPorts) => {
        const project = await ports.project.lockForUpdate(input.projectId);
        if (!project || project.ownerUserId !== input.actorUserId || project.deletedAt !== null) {
          throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        }
        if (project.currentCanonicalVersion !== input.baseCanonicalVersion) {
          throw asDomain(
            appError('CAS_FAILED', 'msg.changeset.cas_failed', 409, {
              expected: input.baseCanonicalVersion,
              actual: project.currentCanonicalVersion,
            }),
          );
        }
        if (input.operations.length === 0) {
          throw asDomain(appError('CHANGE_SET_INVALID', 'msg.changeset.empty', 422));
        }

        const now = await ports.dbNow();
        const changeSetId = ports.allocateId();

        await ports.changeSet.insertPending({
          id: changeSetId,
          projectId: input.projectId,
          origin: input.origin,
          status: 'pending',
          baseCanonicalVersion: input.baseCanonicalVersion,
          operationsHash: input.operationsHash,
        });

        await ports.changeSet.insertOperations(
          input.operations.map((op) => ({
            id: ports.allocateId(),
            projectId: input.projectId,
            changeSetId,
            ordinal: op.ordinal,
            operationType: op.operationType,
            targetEntityType: op.targetEntityType,
            targetEntityId: op.targetEntityId,
            expectedRevision: op.expectedRevision,
            risk: op.risk,
            schemaVersion: 1,
            payload: op.payload,
          })),
        );

        for (const op of input.operations) {
          const result = await applyOperation(ports, input.projectId, op);
          if (!result.ok) {
            throw asDomain(result.error);
          }
        }

        const appliedCanonicalVersion = input.baseCanonicalVersion + 1;

        const marked = await ports.changeSet.markApplied(
          input.projectId,
          changeSetId,
          appliedCanonicalVersion,
        );
        if (!marked) {
          throw asDomain(appError('CAS_FAILED', 'msg.changeset.cas_failed', 409));
        }

        const bumped = await ports.project.bumpCanonicalVersion(
          input.projectId,
          input.baseCanonicalVersion,
        );
        if (bumped === null) {
          throw asDomain(appError('CAS_FAILED', 'msg.changeset.cas_failed', 409));
        }

        await ports.audit.append({
          userId: input.actorUserId,
          action: 'change_set.applied',
          entityType: 'canonical_change_set',
          entityId: changeSetId,
          metadata: {
            origin: input.origin,
            appliedCanonicalVersion,
            operationsCount: input.operations.length,
          },
        });

        await ports.outbox.append({
          id: ports.allocateId(),
          aggregateType: 'canonical_change_set',
          aggregateId: changeSetId,
          eventType: 'canonical.change_set.applied',
          dedupeKey: `changeset:${changeSetId}:applied`,
          occurredAt: now,
          payload: {
            projectId: input.projectId,
            appliedCanonicalVersion,
            origin: input.origin,
            operationsHash: input.operationsHash,
            requestId: input.requestId,
          },
        });

        return { changeSetId, appliedCanonicalVersion };
      });

      return ok(outcome);
    } catch (e) {
      if (isDomain(e)) return err(e.error);
      const message = e instanceof Error ? e.message : String(e);
      const code =
        typeof e === 'object' && e !== null && 'code' in e
          ? String((e as { code: unknown }).code)
          : undefined;
      return err(
        appError('CHANGE_SET_INVALID', 'msg.changeset.unknown', 500, {
          message,
          code,
        }),
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

export type { CanonicalOpPersist };

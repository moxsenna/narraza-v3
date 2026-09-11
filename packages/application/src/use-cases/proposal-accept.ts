/**
 * Atomic proposal accept (W5.3, S4.4). One PG transaction per R-M5.3:
 *   lock proposal → lock group → lock project (owner-bound, project-first
 *   ordering via group FK cascade) → ownership + status guards → dependency
 *   staleness decision → sibling supersede pre-check → CAS change set
 *   (base = current canon) → apply persisted ops in ordinal order (accept is
 *   last per core DAG) → mark applied → canon +1 exactly once → proposal
 *   accepted + siblings superseded → group accepted → audit + outbox.
 *
 * CAS failure semantics: if the canon base moved, the SAME accept fails
 * with CAS_FAILED; a NEW transaction marks the proposal stale via the
 * conditional `WHERE status='pending'` gate (createMarkStaleProposal).
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { applyOperation, type CanonicalOpPersist } from '../change-set/apply-operations.js';
import { dependencyManifestHashFor, hashOperations } from './proposal-prepare.js';

export interface AcceptProposalInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly proposalId: string;
  /** CAS base; must equal the project's current canonical version. */
  readonly baseCanonicalVersion: number;
  readonly requestId?: string;
}

export interface AcceptProposalOutput {
  readonly proposalId: string;
  readonly changeSetId: string;
  readonly appliedCanonicalVersion: number;
  readonly supersededProposalIds: readonly string[];
}

export function createAcceptProposal(
  uow: UnitOfWork,
): (input: AcceptProposalInput) => Promise<Result<AcceptProposalOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        // 1) Lock project owner-bound first (single serializing row).
        const project = await ports.project.lockForUpdate(input.projectId);
        if (!project || project.ownerUserId !== input.ownerUserId || project.deletedAt !== null) {
          throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        }

        // 2) Proposal + group under lock.
        const proposal = await ports.proposal.findById(input.projectId, input.proposalId);
        if (!proposal) throw asDomain(appError('NOT_FOUND', 'msg.proposal.not_found', 404));
        if (!ports.proposalGroup) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const group = await ports.proposalGroup.findById(input.projectId, proposal.groupId);
        if (!group) throw asDomain(appError('NOT_FOUND', 'msg.proposal.group_not_found', 404));

        // 3) Status guards.
        if (proposal.status === 'superseded') {
          throw asDomain(appError('CONFLICT', 'msg.proposal.superseded', 409));
        }
        if (proposal.status === 'stale') {
          throw asDomain(appError('CONFLICT', 'msg.proposal.stale', 409));
        }
        if (proposal.status !== 'pending') {
          throw asDomain(appError('CONFLICT', 'msg.proposal.not_pending', 409));
        }

        // 4) Read persisted ops back from the proposal's change set. The
        //    accept target beat comes from the prose.accept op itself.
        const changeSet = await ports.changeSet.findById(
          input.projectId,
          proposal.changeSetId ?? '',
        );
        if (!changeSet || changeSet.status !== 'pending') {
          throw asDomain(appError('CHANGE_SET_INVALID', 'msg.changeset.not_pending', 409));
        }
        const persistedOps = await ports.changeSet.listOperations(input.projectId, changeSet.id);
        if (persistedOps.length === 0) {
          throw asDomain(appError('CHANGE_SET_INVALID', 'msg.changeset.empty', 422));
        }
        const operations: readonly CanonicalOpPersist[] = persistedOps.map((op) => ({
          operationId: op.id,
          ordinal: op.ordinal,
          operationType: op.operationType,
          targetEntityType: op.targetEntityType,
          targetEntityId: op.targetEntityId,
          expectedRevision: op.expectedRevision,
          risk: op.risk,
          payload: op.payload,
        }));
        // Hash binding: persisted ops must equal the proposal's declared hash.
        const recomputedHash = hashOperations(operations);
        if (recomputedHash !== proposal.operationsHash) {
          throw asDomain(
            appError('CHANGE_SET_INVALID', 'msg.proposal.operations_hash_mismatch', 422),
          );
        }
        // prose.accept must exist exactly once and be last (core DAG rule).
        const accepts = operations.filter((op) => op.operationType === 'prose.accept');
        const lastOp = operations[operations.length - 1]!;
        if (accepts.length !== 1 || lastOp.operationType !== 'prose.accept') {
          throw asDomain(appError('CHANGE_SET_INVALID', 'msg.proposal.accept_not_last', 422));
        }
        const beatId = lastOp.targetEntityId;

        // 5) Dependency staleness: recompute the group manifest hash against
        //    the live beat revision. Hash mismatch → needs_revalidation.
        const beat = await ports.outline.findBeat(input.projectId, beatId);
        if (!beat) throw asDomain(appError('NOT_FOUND', 'msg.outline.beat_not_found', 404));
        const currentGroupHash = dependencyManifestHashFor(input.projectId, beat.id, beat.revision);
        if (group.dependencyHash !== currentGroupHash) {
          await ports.proposal.setStatus(
            input.projectId,
            proposal.id,
            'pending',
            'needs_revalidation',
          );
          throw asDomain(appError('CONFLICT', 'msg.proposal.needs_revalidation', 409));
        }

        // 6) CAS: canon base must match the caller's expectation.
        if (project.currentCanonicalVersion !== input.baseCanonicalVersion) {
          throw asDomain(
            appError('CAS_FAILED', 'msg.changeset.cas_failed', 409, {
              expected: input.baseCanonicalVersion,
              actual: project.currentCanonicalVersion,
            }),
          );
        }

        // 7) Sibling supersede pre-check (same group, still pending).
        const siblings = await ports.proposal.listPendingInGroup(
          input.projectId,
          proposal.groupId,
          proposal.id,
        );

        // 8) Apply each op through the write-door helpers, ordinal order.
        for (const op of operations) {
          const result = await applyOperation(ports, input.projectId, op);
          if (!result.ok) {
            throw asDomain(result.error);
          }
        }

        // 9) Mark applied + bump canon exactly once.
        const appliedCanonicalVersion = input.baseCanonicalVersion + 1;
        const marked = await ports.changeSet.markApplied(
          input.projectId,
          changeSet.id,
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

        // 10) Proposal accepted, siblings superseded in the SAME tx.
        const accepted = await ports.proposal.setStatus(
          input.projectId,
          proposal.id,
          'pending',
          'accepted',
        );
        if (!accepted) {
          throw asDomain(appError('CAS_FAILED', 'msg.proposal.not_pending', 409));
        }
        const supersededProposalIds: string[] = [];
        for (const sibling of siblings) {
          const done = await ports.proposal.setStatus(
            input.projectId,
            sibling.id,
            'pending',
            'superseded',
          );
          if (done) supersededProposalIds.push(sibling.id);
        }
        await ports.proposalGroup.setStatus(
          input.projectId,
          proposal.groupId,
          'pending',
          'accepted',
        );

        // 11) Audit + outbox.
        const now = await ports.dbNow();
        await ports.audit.append({
          userId: input.ownerUserId,
          action: 'proposal.accepted',
          entityType: 'proposal',
          entityId: proposal.id,
          metadata: {
            groupId: proposal.groupId,
            source: proposal.source,
            appliedCanonicalVersion,
            supersededCount: supersededProposalIds.length,
          },
        });
        await ports.outbox.append({
          id: ports.allocateId(),
          aggregateType: 'proposal',
          aggregateId: proposal.id,
          eventType: 'proposal.accepted',
          dedupeKey: `proposal:${proposal.id}:accepted`,
          occurredAt: now,
          payload: {
            projectId: input.projectId,
            groupId: proposal.groupId,
            appliedCanonicalVersion,
            operationsHash: proposal.operationsHash,
            requestId: input.requestId ?? null,
          },
        });

        return {
          proposalId: proposal.id,
          changeSetId: changeSet.id,
          appliedCanonicalVersion,
          supersededProposalIds,
        };
      });
      return ok(outcome);
    } catch (e) {
      if (typeof e === 'object' && e !== null && '__domain' in e) {
        return err((e as DomainError).error);
      }
      throw e;
    }
  };
}

/**
 * R-M5.3 CAS-fail follow-up: after a failed accept (canon moved), mark the
 * abandoned proposal stale in a NEW transaction, conditional on it still
 * being pending. Idempotent: already-stale proposals resolve to null.
 */
export function createMarkStaleProposal(
  uow: UnitOfWork,
): (input: {
  ownerUserId: string;
  projectId: string;
  proposalId: string;
}) => Promise<Result<{ marked: boolean }, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const proposal = await ports.proposal.findById(input.projectId, input.proposalId);
        if (!proposal) throw asDomain(appError('NOT_FOUND', 'msg.proposal.not_found', 404));
        if (proposal.status !== 'pending') return { marked: false };
        const updated = await ports.proposal.setStatus(
          input.projectId,
          proposal.id,
          'pending',
          'stale',
        );
        return { marked: updated !== null };
      });
      return ok(outcome);
    } catch (e) {
      if (typeof e === 'object' && e !== null && '__domain' in e) {
        return err((e as DomainError).error);
      }
      throw e;
    }
  };
}

class DomainError extends Error {
  readonly __domain = true as const;
  constructor(readonly error: AppError) {
    super(error.publicMessageCode);
  }
}

function asDomain(error: AppError): DomainError {
  return new DomainError(error);
}

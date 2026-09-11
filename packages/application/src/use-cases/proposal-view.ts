/**
 * Public proposal read model (W5.4). Sanitized by construction:
 *  - no raw operations, payloads, hashes, or internal IDs beyond the
 *    proposal token itself;
 *  - per-op projections carry { kind, label, impact, risk } from a static
 *    server-owned map — never model text, never service_restricted data;
 *  - availableActions is derived SERVER-side from live state (status +
 *    dependency currency); the client only renders what it is given.
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { dependencyManifestHashFor } from './proposal-prepare.js';

export interface PublicProposalOp {
  readonly kind: string;
  readonly label: string;
  readonly impact: string;
  readonly risk: 'low' | 'medium' | 'high';
}

export interface PublicProposalView {
  readonly proposalId: string;
  readonly status: 'pending' | 'needs_revalidation' | 'stale' | 'superseded' | 'accepted' | 'rejected';
  readonly source: 'ai' | 'user' | 'system';
  /** 'Diedit kamu' surface lives in the web layer; source is the raw axis. */
  readonly groupKind: string;
  readonly risk: 'low' | 'medium' | 'high';
  readonly highRisk: boolean;
  /** Sanitized prose preview (first 240 chars) for prose proposals. */
  readonly proseExcerpt: string | null;
  readonly operations: readonly PublicProposalOp[];
  readonly availableActions: readonly ('accept' | 'reject')[];
}

const OP_LABELS: Readonly<Record<string, { label: string; impact: string }>> = {
  'prose.version.create': { label: 'Naskah baru', impact: 'Menambahkan versi naskah beat' },
  'prose.accept': { label: 'Jadikan resmi', impact: 'Naskah menjadi cerita resmi beat' },
  'fact.create': { label: 'Fakta baru', impact: 'Menambah fakta kanon' },
  'fact.update': { label: 'Fakta diperbarui', impact: 'Mengubah fakta kanon' },
  'character.create': { label: 'Karakter baru', impact: 'Menambah karakter' },
  'character.update': { label: 'Karakter diperbarui', impact: 'Mengubah data karakter' },
  'outline.create': { label: 'Outline baru', impact: 'Menambah simpul outline' },
  'outline.update': { label: 'Outline diperbarui', impact: 'Mengubah simpul outline' },
  'reveal.create': { label: 'Reveal baru', impact: 'Menjadwalkan reveal' },
  'breadcrumb.create': { label: 'Breadcrumb', impact: 'Menambah petunjuk sebelum reveal' },
};

function publicOp(operationType: string, risk: string): PublicProposalOp {
  const entry = OP_LABELS[operationType];
  return {
    kind: operationType,
    label: entry?.label ?? operationType,
    impact: entry?.impact ?? 'Perubahan cerita resmi',
    risk: risk === 'high' ? 'high' : risk === 'medium' ? 'medium' : 'low',
  };
}

export interface PublicProposalInputRow {
  readonly proposalId: string;
  readonly groupId: string;
  readonly status: string;
  readonly source: string;
  readonly groupKind: string;
  readonly groupStatus: string;
  /** Persisted canonical ops (ordinal order) for this proposal. */
  readonly operations: readonly { readonly operationType: string; readonly risk: string }[];
  /** Live prose content when the proposal creates a prose version. */
  readonly proseContent: string | null;
  /** Whether the group dependency hash still matches live canon. */
  readonly dependencyCurrent: boolean;
}

export function toPublicProposalView(row: PublicProposalInputRow): PublicProposalView {
  const operations = row.operations.map((op) => publicOp(op.operationType, op.risk));
  const highRisk = operations.some((op) => op.risk === 'high');
  const status: PublicProposalView['status'] =
    row.status === 'pending' && !row.dependencyCurrent ? 'needs_revalidation' : (
      row.status === 'accepted'
        ? 'accepted'
        : row.status === 'rejected'
          ? 'rejected'
          : row.status === 'stale'
            ? 'stale'
            : row.status === 'superseded'
              ? 'superseded'
              : 'pending'
    );
  const actions: ('accept' | 'reject')[] = [];
  if (row.groupStatus === 'pending' && row.status === 'pending' && row.dependencyCurrent) {
    actions.push('accept', 'reject');
  }
  return Object.freeze({
    proposalId: row.proposalId,
    status,
    source: row.source === 'user' ? 'user' : row.source === 'system' ? 'system' : 'ai',
    groupKind: row.groupKind,
    risk: highRisk ? 'high' : operations.some((op) => op.risk === 'medium') ? 'medium' : 'low',
    highRisk,
    proseExcerpt:
      row.proseContent === null ? null : row.proseContent.slice(0, 240).trim() || null,
    operations,
    availableActions: actions,
  });
}

export interface GetPendingProposalsInput {
  readonly ownerUserId: string;
  readonly projectId: string;
}

export interface PendingProposalView {
  readonly view: PublicProposalView;
  readonly groupId: string;
  readonly proseVersionId: string | null;
  readonly beatId: string | null;
  readonly baseCanonicalVersion: number;
}

export function createGetPendingProposals(
  uow: UnitOfWork,
): (input: GetPendingProposalsInput) => Promise<Result<readonly PendingProposalView[], AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proposalGroup || !ports.proseVersion) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));

        const groups = await ports.proposalGroup.listPendingByProject(input.projectId);
        const views: PendingProposalView[] = [];
        for (const group of groups) {
          const proposals = await ports.proposal.listPendingInGroup(
            input.projectId,
            group.id,
            '__none__',
          );
          for (const proposal of proposals) {
            const ops = await ports.changeSet.listOperations(
              input.projectId,
              proposal.changeSetId ?? '',
            );
            const acceptOp = [...ops].reverse().find((op) => op.operationType === 'prose.accept');
            const createOp = ops.find((op) => op.operationType === 'prose.version.create');
            let proseContent: string | null = null;
            let beatId: string | null = null;
            if (createOp) {
              const payload = createOp.payload as { beatId?: unknown; content?: unknown };
              beatId = typeof payload.beatId === 'string' ? payload.beatId : null;
              proseContent = typeof payload.content === 'string' ? payload.content : null;
            } else if (acceptOp) {
              const payload = acceptOp.payload as { proseVersionId?: unknown };
              const versionId =
                typeof payload.proseVersionId === 'string' ? payload.proseVersionId : null;
              if (versionId) {
                const version = await ports.proseVersion.findById(input.projectId, versionId);
                if (version) {
                  proseContent = version.content;
                  beatId = version.beatId;
                }
              }
            }

            // Dependency currency: recompute the beat-bound manifest hash
            // with the SAME core function used at prepare time.
            let dependencyCurrent = false;
            if (beatId) {
              const beat = await ports.outline.findBeat(input.projectId, beatId);
              dependencyCurrent =
                beat !== null &&
                group.dependencyHash ===
                  dependencyManifestHashFor(input.projectId, beat.id, beat.revision);
            }

            views.push({
              view: toPublicProposalView({
                proposalId: proposal.id,
                groupId: proposal.groupId,
                status: proposal.status,
                source: proposal.source,
                groupKind: group.kind,
                groupStatus: group.status,
                operations: ops.map((op) => ({
                  operationType: op.operationType,
                  risk: op.risk,
                })),
                proseContent,
                dependencyCurrent,
              }),
              groupId: group.id,
              proseVersionId:
                createOp && (createOp.payload as { content?: unknown }).content !== undefined
                  ? createOp.targetEntityId
                  : null,
              beatId,
              baseCanonicalVersion: project.currentCanonicalVersion,
            });
          }
        }
        return views;
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

export interface RejectProposalInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly proposalId: string;
}

export function createRejectProposal(
  uow: UnitOfWork,
): (input: RejectProposalInput) => Promise<Result<{ rejected: boolean }, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proposalGroup) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const proposal = await ports.proposal.findById(input.projectId, input.proposalId);
        if (!proposal) throw asDomain(appError('NOT_FOUND', 'msg.proposal.not_found', 404));
        if (proposal.status !== 'pending') {
          throw asDomain(appError('CONFLICT', 'msg.proposal.not_pending', 409));
        }
        const rejected = await ports.proposal.setStatus(
          input.projectId,
          proposal.id,
          'pending',
          'rejected',
        );
        if (!rejected) {
          throw asDomain(appError('CONFLICT', 'msg.proposal.not_pending', 409));
        }
        // Group rejected when no pending siblings remain.
        const siblings = await ports.proposal.listPendingInGroup(
          input.projectId,
          proposal.groupId,
          proposal.id,
        );
        if (siblings.length === 0) {
          await ports.proposalGroup.setStatus(
            input.projectId,
            proposal.groupId,
            'pending',
            'rejected',
          );
        }
        await ports.audit.append({
          userId: input.ownerUserId,
          action: 'proposal.rejected',
          entityType: 'proposal',
          entityId: proposal.id,
          metadata: { groupId: proposal.groupId, source: proposal.source },
        });
        return { rejected: true };
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

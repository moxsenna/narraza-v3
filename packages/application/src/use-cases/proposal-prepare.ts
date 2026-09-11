/**
 * Proposal preparation (W5.3). Builds the persistable canonical operation set
 * from a candidate or user-edited prose and inserts Proposal rows bound to a
 * ProposalGroup. Three sources:
 *  - 'ai':      beat.write/repair candidates from M4 candidate groups, ops
 *               re-resolved from live snapshots (tempRefs never persisted).
 *  - 'user':    current working-draft content (source=user, hash authored).
 *  - 'system':  reserved for server-authored flows (explicit only).
 *
 * The persisted Proposal always carries real 64-hex operations_hash and
 * dependency_hash. The prepare step never mutates canon: it only writes
 * proposal_groups + prose_versions (snapshot status) + proposals rows.
 */
import { dependency, operations as coreOperations } from '@narraza/core';
import type { operations as operationsNs } from '@narraza/core';
type ModelSuggestionDraft = operationsNs.ModelSuggestionDraft;
type CanonicalEntitySnapshot = operationsNs.CanonicalEntitySnapshot;
type ResolutionContext = operationsNs.ResolutionContext;
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { CanonicalOpPersist } from '../change-set/apply-operations.js';
import { M5_VALIDATION_POLICY_VERSION } from './prose-validation.js';

const { sha256Hex } = dependency;
const { resolveOperations } = coreOperations;

export const PROPOSAL_DEPENDENCY_POLICY_VERSION = 'dependency-core/v1';

export interface PrepareProseProposalInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly source: 'ai' | 'user';
  /** Required for source='ai': candidate id inside the latest candidate group. */
  readonly candidateId?: string | null;
  /**
   * Overrides candidate/draft content. Required when no candidate/draft
   * exists (user-pasted prose). Never trusted for hashing.
   */
  readonly content?: string | null;
  /**
   * Provenance backpointer for AI prose (GeneratedCandidate.prose_version_id
   * FK binding). The ProseVersion row created here is the generated prose.
   */
  readonly sourceCandidateId?: string | null;
}

export interface PreparedProposal {
  readonly proposalGroupId: string;
  readonly proposalId: string;
  readonly proseVersionId: string;
  readonly proseContentHash: string;
  readonly operationsHash: string;
  readonly dependencyHash: string;
  readonly operations: readonly CanonicalOpPersist[];
}

export interface PrepareProseProposalOutput {
  readonly proposal: PreparedProposal;
}

interface ProposalGroupView {
  readonly id: string;
  readonly kind: string;
  readonly dependencyHash: string;
  readonly candidates: readonly {
    readonly id: string;
    readonly payload: { readonly [key: string]: unknown };
  }[];
}

/**
 * Re-resolve the beat.write operation set for one prose candidate against
 * live canon snapshots. AI candidate payloads carry a model suggestion list
 * (output.suggestions); user prose resolves a bare create+accept pair.
 */
function resolveProseOps(
  contract: 'beat.write' | 'repair',
  candidateId: string,
  extractionRunId: string,
  proseVersionId: string,
  beatId: string,
  content: string,
  suggestions: readonly unknown[],
  allocateEntityId: (localRef: string) => string,
  currentBeatRevision: number,
  beatParentId: string,
  beatOrdinal: number,
  beatNarrativeSequence: number,
): readonly CanonicalOpPersist[] {
  const snapshots: CanonicalEntitySnapshot[] = [
    {
      entityType: 'beat',
      entityId: beatId,
      exists: true,
      deleted: false,
      revision: currentBeatRevision,
      parentId: beatParentId,
      ordinal: beatOrdinal,
      narrativeSequence: beatNarrativeSequence,
    },
  ];
  const context: ResolutionContext = {
    contract,
    candidateId,
    extractionRunId,
    snapshots,
    allocateId: (entityType, localRef) =>
      entityType === 'prose_version' ? proseVersionId : allocateEntityId(localRef),
    allocateOperationId: (localRef) => `op-${sha256Hex(localRef).slice(0, 16)}`,
    allocateFactKey: (localRef) => `fk-${sha256Hex(localRef).slice(0, 12)}`,
  };

  const drafts =
    suggestions.length > 0
      ? suggestions.map((s) => coreOperations.normalizeSuggestion(s as ModelSuggestionDraft))
      : [
          coreOperations.normalizeSuggestion({
            schemaVersion: 1,
            tempRef: 'prose',
            operationType: 'prose.version.create',
            input: { beat: { existingId: beatId }, content },
          }),
          coreOperations.normalizeSuggestion({
            schemaVersion: 1,
            tempRef: 'accept',
            operationType: 'prose.accept',
            input: {
              target: { existingId: beatId },
              proseVersion: { tempRef: 'prose' },
            },
          }),
        ];

  const resolved = resolveOperations(drafts, context);
  return resolved.operations.map((op) => ({
    operationId: op.operationId,
    ordinal: op.ordinal,
    operationType: op.operationType,
    targetEntityType: op.targetEntityType,
    targetEntityId: op.targetId,
    expectedRevision: op.expectedRevision,
    risk: op.risk,
    payload: op.payload as { readonly [key: string]: unknown },
  }));
}

export function createPrepareProseProposal(
  uow: UnitOfWork,
): (input: PrepareProseProposalInput) => Promise<Result<PrepareProseProposalOutput, AppError>> {
  return async (input) => {
    try {
      if (input.source === 'ai' && !input.candidateId) {
        return err(appError('VALIDATION', 'msg.proposal.candidate_required', 422));
      }
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proseVersion || !ports.proposalGroup) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const beat = await ports.outline.findBeat(input.projectId, input.beatId);
        if (!beat) throw asDomain(appError('NOT_FOUND', 'msg.outline.beat_not_found', 404));

        // ---- Resolve prose content + provenance by source -----------------
        let content: string;
        let suggestions: readonly unknown[] = [];
        let sourceCandidateId: string | null = null;
        let group: ProposalGroupView | null = null;
        let contract: 'beat.write' | 'repair' = 'beat.write';

        if (input.source === 'ai') {
          if (!ports.m4ProductRead) {
            throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
          }
          const kinds = ['beat_write_judge', 'safe_repair'];
          let foundContent: string | null = null;
          for (const kind of kinds) {
            const found = await ports.m4ProductRead.findLatestCandidateGroup(input.projectId, kind);
            if (!found) continue;
            const match = found.candidates.find((c) => c.id === input.candidateId);
            if (!match) continue;
            contract = kind === 'safe_repair' ? 'repair' : 'beat.write';
            group = {
              id: found.id,
              kind: found.kind,
              dependencyHash: '',
              candidates: found.candidates,
            };
            const payload = match.payload as {
              output?: { text?: unknown; suggestions?: unknown };
            };
            const text = typeof payload.output?.text === 'string' ? payload.output.text : '';
            if (!text) {
              throw asDomain(appError('NOT_FOUND', 'msg.proposal.candidate_empty', 404));
            }
            foundContent = text;
            suggestions =
              Array.isArray(payload.output?.suggestions) &&
              (payload.output?.suggestions as unknown[]).length > 0
                ? (payload.output.suggestions as unknown[])
                : [];
            sourceCandidateId = input.candidateId!;
            break;
          }
          if (sourceCandidateId === null || foundContent === null) {
            throw asDomain(appError('NOT_FOUND', 'msg.proposal.candidate_not_found', 404));
          }
          content = foundContent;
        } else {
          content = input.content ?? '';
          if (!content.trim()) {
            throw asDomain(appError('VALIDATION', 'msg.proposal.content_required', 422));
          }
        }

        // Group dependency hash: server-authoritative manifest hash over the
        // beat (identity + revision). Model-supplied hashes never persisted.
        const dependencyHash = dependencyManifestHashFor(
          input.projectId,
          input.beatId,
          beat.revision,
        );

        // ---- Immutable prose version (validated snapshot) -----------------
        const proseVersionId = ports.allocateId();
        const contentHash = sha256Hex(content);
        const maxRevision = await ports.proseVersion.maxRevision(input.projectId, input.beatId);
        try {
          await ports.proseVersion.insert({
            id: proseVersionId,
            projectId: input.projectId,
            beatId: input.beatId,
            sourceCandidateId,
            status: 'validated',
            revision: (maxRevision ?? -1) + 1,
            content,
            contentHash,
          });
        } catch (e) {
          if (isUniqueViolation(e)) {
            const retryMax = await ports.proseVersion.maxRevision(input.projectId, input.beatId);
            await ports.proseVersion.insert({
              id: ports.allocateId(),
              projectId: input.projectId,
              beatId: input.beatId,
              sourceCandidateId,
              status: 'validated',
              revision: (retryMax ?? -1) + 1,
              content,
              contentHash,
            });
          } else {
            throw e;
          }
        }

        // ---- Resolve canonical ops against live snapshots -----------------
        const extractionRunId = `extract-${proseVersionId}`;
        let operations: readonly CanonicalOpPersist[];
        try {
          operations = resolveProseOps(
            contract,
            sourceCandidateId ?? 'user',
            extractionRunId,
            proseVersionId,
            input.beatId,
            content,
            suggestions,
            () => ports.allocateId(),
            beat.revision,
            beat.parentId ?? '',
            beat.ordinal ?? 0,
            beat.narrativeSequence ?? 0,
          );
        } catch (e) {
          throw asDomain(
            appError('CHANGE_SET_INVALID', 'msg.proposal.resolve_failed', 422, {
              reason: e instanceof Error ? e.message : String(e),
            }),
          );
        }
        const operationsHash = hashOperations(operations);

        // ---- Proposal group + proposal rows -------------------------------
        let groupId: string;
        if (group) {
          groupId = group.id;
        } else {
          groupId = ports.allocateId();
          await ports.proposalGroup.insert({
            id: groupId,
            projectId: input.projectId,
            kind: 'prose',
            status: 'pending',
            dependencyHash,
            sourceJobId: null,
          });
        }
        const proposalId = ports.allocateId();
        // CanonicalChangeSet FK is NOT NULL: the proposal's change set is
        // created eagerly in pending state with the operations persisted, so
        // accept only needs lock→CAS→apply→bump (ops already stored).
        const changeSetId = ports.allocateId();
        await ports.changeSet.insertPending({
          id: changeSetId,
          projectId: input.projectId,
          origin: input.source,
          status: 'pending',
          baseCanonicalVersion: project.currentCanonicalVersion,
          operationsHash,
        });
        await ports.changeSet.insertOperations(
          operations.map((op) => ({
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
        await ports.proposal.insert({
          id: proposalId,
          projectId: input.projectId,
          groupId,
          source: input.source,
          status: 'pending',
          changeSetId,
          operationsHash,
          dependencyHash,
        });

        return {
          proposalGroupId: groupId,
          proposalId,
          proseVersionId,
          proseContentHash: contentHash,
          operationsHash,
          dependencyHash,
          operations,
        };
      });
      return ok({ proposal: outcome });
    } catch (e) {
      return asResult(e);
    }
  };
}

/** Group dependency hash input: beat identity + revision only (v1 policy). */
export function beatDependencyManifest(
  projectId: string,
  beatId: string,
  beatRevision: number,
): readonly dependency.DependencyEntry[] {
  return [
    {
      entityType: 'beat',
      entityId: `${projectId}:${beatId}`,
      revision: beatRevision,
      deleted: false,
    },
  ];
}

export function dependencyManifestHashFor(
  projectId: string,
  beatId: string,
  beatRevision: number,
): string {
  return dependency.dependencyManifestHash(beatDependencyManifest(projectId, beatId, beatRevision));
}

/** App-layer operations hash identical to core hashCanonicalOperations. */
export function hashOperations(operations: readonly CanonicalOpPersist[]): string {
  const material = operations.map(
    ({
      ordinal,
      operationType,
      targetEntityType,
      targetEntityId,
      expectedRevision,
      risk,
      payload,
    }) => ({
      schemaVersion: 1,
      ordinal,
      operationType,
      targetEntityType,
      targetEntityId,
      expectedRevision,
      risk,
      payload,
    }),
  );
  return dependency.sha256Hex(
    `narraza-canonical-operations:v1\n${dependency.canonicalJson(material)}`,
  );
}

function isUniqueViolation(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    if (code === 'P2002' || code === '23505') return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /unique|duplicate|23505/i.test(msg);
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

function asResult<T>(e: unknown): Result<T, AppError> {
  if (typeof e === 'object' && e !== null && '__domain' in e) {
    return err((e as DomainError).error);
  }
  throw e;
}

// Re-exported for downstream accept/repair use-cases.
export { M5_VALIDATION_POLICY_VERSION };

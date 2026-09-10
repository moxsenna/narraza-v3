/**
 * Working draft autosave + candidate seed + snapshot (W5.1).
 * - Autosave: CAS revision through decideWorkingDraftUpdate; mismatch is a
 *   typed conflict returning the authoritative current revision, zero writes.
 * - Candidate seed: server-fetched GeneratedCandidate content initializes the
 *   draft. Never accept, never canon, never implicit version. Materially edited
 *   drafts are preserved via typed conflict (no silent overwrite).
 * - Snapshot: explicit check creates an immutable ProseVersion from the current
 *   draft with server-computed contentHash and fenced revision allocation.
 */
import { dependency, prose as coreProse } from '@narraza/core';
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ProseVersionRecord, ProseWorkingDraftRecord } from '../ports/prose-repo.js';

export interface SaveWorkingDraftInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly content: string;
  readonly expectedRevision: number | null;
}

export interface SaveWorkingDraftOutput {
  readonly draft: ProseWorkingDraftRecord;
}

export interface DraftConflict {
  readonly currentRevision: number;
  readonly contentHash: string;
}

export function createSaveWorkingDraft(
  uow: UnitOfWork,
): (input: SaveWorkingDraftInput) => Promise<Result<SaveWorkingDraftOutput, AppError>> {
  return async (input) => {
    try {
      const contentHash = dependency.sha256Hex(input.content);
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proseDraft) throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const existing = await ports.proseDraft.findActive(
          input.projectId,
          input.ownerUserId,
          input.beatId,
        );
        if (!existing) {
          if (input.expectedRevision !== null && input.expectedRevision !== 0) {
            throw asConflict(0, '');
          }
          const created = await ports.proseDraft.insert({
            id: ports.allocateId(),
            projectId: input.projectId,
            beatId: input.beatId,
            userId: input.ownerUserId,
            content: input.content,
            contentHash,
          });
          return created;
        }
        const expected = input.expectedRevision ?? existing.revision;
        try {
          coreProse.decideWorkingDraftUpdate({
            currentRevision: existing.revision,
            expectedRevision: expected,
          });
        } catch {
          throw asConflict(existing.revision, existing.contentHash);
        }
        const updated = await ports.proseDraft.updateContent(input.projectId, existing.id, {
          content: input.content,
          contentHash,
          expectedRevision: existing.revision,
        });
        if (!updated) throw asConflict(existing.revision, existing.contentHash);
        return updated;
      });
      return ok({ draft: outcome });
    } catch (e) {
      return asResult(e);
    }
  };
}

export interface SeedDraftFromCandidateInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly candidateId: string;
  readonly beatId: string;
  /** When true, overwrite even a materially edited draft. Default false. */
  readonly allowOverwrite?: boolean;
  /** Expected draft revision when overwriting; required with allowOverwrite. */
  readonly expectedRevision?: number | null;
}

export function createSeedDraftFromCandidate(
  uow: UnitOfWork,
): (input: SeedDraftFromCandidateInput) => Promise<Result<SaveWorkingDraftOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proseDraft || !ports.m4ProductRead) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const content = await findCandidateContent(ports, input.projectId, input.candidateId);
        if (content === null) {
          throw asDomain(appError('NOT_FOUND', 'msg.proposal.candidate_not_found', 404));
        }
        if (!content) throw asDomain(appError('NOT_FOUND', 'msg.proposal.candidate_empty', 404));
        const contentHash = dependency.sha256Hex(content);
        const existing = await ports.proseDraft.findActive(
          input.projectId,
          input.ownerUserId,
          input.beatId,
        );
        if (!existing) {
          return ports.proseDraft.insert({
            id: ports.allocateId(),
            projectId: input.projectId,
            beatId: input.beatId,
            userId: input.ownerUserId,
            content,
            contentHash,
          });
        }
        if (existing.contentHash === contentHash) return existing;
        const materiallyEdited = existing.revision > 0 || existing.content.length > 0;
        if (materiallyEdited && !input.allowOverwrite) {
          throw asConflict(existing.revision, existing.contentHash);
        }
        if (input.allowOverwrite && input.expectedRevision !== existing.revision) {
          throw asConflict(existing.revision, existing.contentHash);
        }
        if (!input.allowOverwrite && !materiallyEdited) {
          // Pristine empty draft (revision 0, empty content): safe reseed.
          const updated = await ports.proseDraft.updateContent(input.projectId, existing.id, {
            content,
            contentHash,
            expectedRevision: existing.revision,
          });
          if (!updated) throw asConflict(existing.revision, existing.contentHash);
          return updated;
        }
        const updated = await ports.proseDraft.updateContent(input.projectId, existing.id, {
          content,
          contentHash,
          expectedRevision: existing.revision,
        });
        if (!updated) throw asConflict(existing.revision, existing.contentHash);
        return updated;
      });
      return ok({ draft: outcome });
    } catch (e) {
      return asResult(e);
    }
  };
}

export interface SnapshotProseVersionInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly sourceCandidateId: string | null;
}

export interface SnapshotProseVersionOutput {
  readonly version: ProseVersionRecord;
}

export function createSnapshotProseVersion(
  uow: UnitOfWork,
): (input: SnapshotProseVersionInput) => Promise<Result<SnapshotProseVersionOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proseDraft || !ports.proseVersion) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const draft = await ports.proseDraft.findActive(
          input.projectId,
          input.ownerUserId,
          input.beatId,
        );
        if (!draft) throw asDomain(appError('NOT_FOUND', 'msg.prose.draft_not_found', 404));
        if (input.sourceCandidateId) {
          const lineage = await findCandidateContent(ports, input.projectId, input.sourceCandidateId);
          if (lineage === null) {
            throw asDomain(appError('NOT_FOUND', 'msg.proposal.candidate_not_found', 404));
          }
        }
        const maxRevision = await ports.proseVersion.maxRevision(input.projectId, input.beatId);
        const revision = (maxRevision ?? -1) + 1;
        try {
          return await ports.proseVersion.insert({
            id: ports.allocateId(),
            projectId: input.projectId,
            beatId: input.beatId,
            sourceCandidateId: input.sourceCandidateId,
            status: 'draft',
            revision,
            content: draft.content,
            contentHash: dependency.sha256Hex(draft.content),
          });
        } catch (e) {
          if (isUniqueViolation(e)) {
            const retryMax = await ports.proseVersion.maxRevision(input.projectId, input.beatId);
            return await ports.proseVersion.insert({
              id: ports.allocateId(),
              projectId: input.projectId,
              beatId: input.beatId,
              sourceCandidateId: input.sourceCandidateId,
              status: 'draft',
              revision: (retryMax ?? -1) + 1,
              content: draft.content,
              contentHash: dependency.sha256Hex(draft.content),
            });
          }
          throw e;
        }
      });
      return ok({ version: outcome });
    } catch (e) {
      return asResult(e);
    }
  };
}

async function findCandidateContent(
  ports: Parameters<Parameters<UnitOfWork['execute']>[0]>[0],
  projectId: string,
  candidateId: string,
): Promise<string | null> {
  const kinds = ['beat_write_judge', 'foundation_generation', 'character_generation', 'outline_generation', 'safe_repair'];
  for (const kind of kinds) {
    const group = await ports.m4ProductRead!.findLatestCandidateGroup(projectId, kind);
    if (!group) continue;
    const match = group.candidates.find((c) => c.id === candidateId);
    if (!match) continue;
    const payload = match.payload as { output?: { text?: unknown } };
    const text = typeof payload.output?.text === 'string' ? payload.output.text : '';
    return text;
  }
  return null;
}

function isUniqueViolation(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    if (code === 'P2002' || code === '23505') return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /unique|duplicate|23505/i.test(msg);
}

class DraftConflictError extends Error {
  readonly __draftConflict = true as const;
  constructor(
    readonly currentRevision: number,
    readonly contentHash: string,
  ) {
    super('msg.prose.draft_conflict');
  }
}

function asConflict(currentRevision: number, contentHash: string): DraftConflictError {
  return new DraftConflictError(currentRevision, contentHash);
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
  if (e instanceof DraftConflictError) {
    const detail: DraftConflict = {
      currentRevision: e.currentRevision,
      contentHash: e.contentHash,
    };
    return err(appError('DRAFT_CONFLICT', 'msg.prose.draft_conflict', 409, detail as unknown as Record<string, unknown>));
  }
  if (e instanceof DomainError) return err(e.error);
  if (typeof e === 'object' && e !== null && '__domain' in e) {
    return err((e as DomainError).error);
  }
  throw e;
}

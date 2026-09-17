'use server';

import {
  createSaveWorkingDraft,
  createSeedDraftFromCandidate,
  createSnapshotProseVersion,
  type JsonObject,
  type M4CandidateGroupView,
  type ProseWorkingDraftRecord,
} from '@narraza/application';
import { assertSceneChapterAccess } from './generation';
import { getUnitOfWork } from './uow';

export type WriteRoomCandidate = Readonly<{
  id: string;
  ordinal: number;
  text: string;
}>;

export type WriteRoomState = Readonly<{
  targetBeatId: string | null;
  targetBeatTitle: string | null;
  draft: ProseWorkingDraftRecord | null;
  candidates: readonly WriteRoomCandidate[];
}>;

function candidateText(payload: JsonObject): string {
  const root = payload['output'];
  const output = root && typeof root === 'object' ? (root as Record<string, unknown>) : null;
  const text = output?.['text'];
  return typeof text === 'string' && text.length > 0 ? text : 'kandidat kosong';
}

/**
 * Write-room read model for a chapter: first open beat (no accepted prose),
 * its active working draft, and the latest beat_write_judge candidates.
 */
export async function getWriteRoomState(
  projectId: string,
  chapterId: string,
  beatIds: readonly { id: string; title: string; accepted: boolean }[],
): Promise<WriteRoomState | null> {
  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return null;

  const target = beatIds.find((beat) => !beat.accepted) ?? null;
  const unitOfWork = getUnitOfWork();
  const [draft, group] = await unitOfWork.execute(async (ports) => {
    const draftRepo = ports.proseDraft;
    const active =
      target && draftRepo ? await draftRepo.findActive(projectId, access.userId, target.id) : null;
    const reader = ports.m4ProductRead;
    const latest: M4CandidateGroupView | null = reader
      ? await reader.findLatestCandidateGroup(projectId, 'beat_write_judge')
      : null;
    return [active, latest] as const;
  });

  const candidates: WriteRoomCandidate[] = (group?.candidates ?? []).map((candidate, index) => ({
    id: candidate.id,
    ordinal: candidate.ordinal ?? index + 1,
    text: candidateText(candidate.payload),
  }));

  return {
    targetBeatId: target?.id ?? null,
    targetBeatTitle: target?.title ?? null,
    draft,
    candidates,
  };
}

export type DraftSeedState =
  | { readonly kind: 'seeded' }
  | { readonly kind: 'no_open_beat'; readonly message: string }
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

const NOT_FOUND_MESSAGE = 'Halaman tidak ditemukan.';

function openBeatId(beats: readonly { id: string }[], acceptedIds: ReadonlySet<string>) {
  return beats.find((beat) => !acceptedIds.has(beat.id))?.id ?? null;
}

export async function seedDraftFromCandidateAction(
  _prev: DraftSeedState | null,
  formData: FormData,
): Promise<DraftSeedState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const candidateId = String(formData.get('candidateId') ?? '');
  const beatIdsJson = String(formData.get('beatIds') ?? '[]');
  const acceptedJson = String(formData.get('acceptedBeatIds') ?? '[]');
  if (!projectId || !chapterId || !candidateId) {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  let beats: readonly { id: string }[] = [];
  let accepted = new Set<string>();
  try {
    const parsedBeats: unknown = JSON.parse(beatIdsJson);
    const parsedAccepted: unknown = JSON.parse(acceptedJson);
    if (Array.isArray(parsedBeats)) {
      beats = parsedBeats.filter(
        (beat): beat is { id: string } =>
          !!beat && typeof beat === 'object' && typeof (beat as { id: unknown }).id === 'string',
      );
    }
    if (Array.isArray(parsedAccepted)) {
      accepted = new Set(parsedAccepted.filter((id): id is string => typeof id === 'string'));
    }
  } catch {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const beatId = openBeatId(beats, accepted);
  if (!beatId) {
    return { kind: 'no_open_beat', message: 'Semua adegan bab ini sudah memiliki naskah resmi.' };
  }

  const seed = createSeedDraftFromCandidate(getUnitOfWork());
  const result = await seed({
    ownerUserId: access.userId,
    projectId,
    candidateId,
    beatId,
  });
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return { kind: 'error', message: NOT_FOUND_MESSAGE };
    return {
      kind: 'conflict',
      message: 'Draft sudah diubah secara material. Muat ulang sebelum menerapkan kandidat.',
    };
  }
  return { kind: 'seeded' };
}

export type DraftSaveState =
  | { readonly kind: 'saved'; readonly revision: number }
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export async function saveWorkingDraftAction(
  projectId: string,
  chapterId: string,
  beatId: string,
  content: string,
  expectedRevision: number | null,
): Promise<DraftSaveState> {
  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const save = createSaveWorkingDraft(getUnitOfWork());
  const result = await save({
    ownerUserId: access.userId,
    projectId,
    beatId,
    content,
    expectedRevision,
  });
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return { kind: 'error', message: NOT_FOUND_MESSAGE };
    return {
      kind: 'conflict',
      message: 'Draft berubah di tempat lain. Muat ulang untuk melihat versi terbaru.',
    };
  }
  return { kind: 'saved', revision: result.value.draft.revision };
}

export async function snapshotProseVersionAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const beatId = String(formData.get('beatId') ?? '');
  if (!projectId || !chapterId || !beatId) return;

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return;

  const snapshot = createSnapshotProseVersion(getUnitOfWork());
  await snapshot({
    ownerUserId: access.userId,
    projectId,
    beatId,
    sourceCandidateId: null,
  });
}

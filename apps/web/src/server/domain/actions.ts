'use server';

import { redirect } from 'next/navigation';
import {
  authorizeActiveUser,
  createAppendIntakeMessage,
  createConfirmFoundation,
  createCreateProject,
  createLockFoundation,
  createUpdateFoundationDraft,
  createUpsertOutlineNode,
  type AppError,
} from '@narraza/application';
import { getCurrentUser } from '../auth/session';
import { getUnitOfWork } from './uow';

async function requireActiveUser() {
  const result = await authorizeActiveUser(async () => {
    const session = await getCurrentUser();
    if (!session) return null;
    return { id: session.userId, status: session.status, email: session.email };
  });
  return result;
}

function publicError(error: AppError): string {
  return error.publicMessageCode;
}

export type ActionState = {
  ok: boolean;
  message?: string;
  projectId?: string;
};

export async function createProjectAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }

  const jalur = String(formData.get('jalur') ?? '');
  const titleRaw = String(formData.get('title') ?? '').trim();

  const createProject = createCreateProject(getUnitOfWork());
  const result = await createProject({
    ownerUserId: auth.value.id,
    jalur,
    ...(titleRaw ? { title: titleRaw } : {}),
  });

  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }

  redirect(`/app/proyek/${result.value.project.id}`);
}

export async function appendIntakeMessageAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const content = String(formData.get('content') ?? '');

  const append = createAppendIntakeMessage(getUnitOfWork());
  const result = await append({
    ownerUserId: auth.value.id,
    projectId,
    content,
  });

  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }

  return { ok: true, projectId };
}

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function formNullable(formData: FormData, key: string): string | null {
  const value = formStr(formData, key);
  return value.length > 0 ? value : null;
}

function formSequence(formData: FormData, key: string): number | null {
  const raw = formStr(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

export async function updateFoundationDraftAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const coreConcept = formNullable(formData, 'coreConcept');
  const conflict = formNullable(formData, 'conflict');
  const endingDirection = formNullable(formData, 'endingDirection');
  const readerPromise = formNullable(formData, 'readerPromise');

  const mainId = formStr(formData, 'mainCharacterId') || 'main';
  const mainIdentity = formNullable(formData, 'mainCharacterIdentity');
  const mainGoal = formNullable(formData, 'mainCharacterGoal');
  const mainMotivation = formNullable(formData, 'mainCharacterMotivation');
  const mainAddress = formNullable(formData, 'mainCharacterAddress');
  const mainSpeech = formNullable(formData, 'mainCharacterSpeechStyle');
  const hasMainFields = [mainIdentity, mainGoal, mainMotivation, mainAddress, mainSpeech].some(
    (v) => v !== null,
  );

  const otherId = formStr(formData, 'relationshipOtherId') || 'other';
  const relDescription = formNullable(formData, 'relationshipDescription');

  const secretTruth = formNullable(formData, 'secretTruth');
  const targetChapterId = formNullable(formData, 'secretTargetChapterId');
  const targetSequence = formSequence(formData, 'secretTargetSequence');
  const bc1ChapterId = formNullable(formData, 'secretBreadcrumb1ChapterId');
  const bc1Sequence = formSequence(formData, 'secretBreadcrumb1Sequence');
  const bc2ChapterId = formNullable(formData, 'secretBreadcrumb2ChapterId');
  const bc2Sequence = formSequence(formData, 'secretBreadcrumb2Sequence');

  const mainCharacter = hasMainFields
    ? {
        id: mainId,
        active: true,
        identity: mainIdentity,
        goal: mainGoal,
        motivation: mainMotivation,
        address: mainAddress,
        speechStyle: mainSpeech,
      }
    : null;

  const relationships =
    relDescription !== null
      ? [
          {
            fromCharacterId: otherId,
            toCharacterId: mainId,
            active: true,
            description: relDescription,
          },
        ]
      : [];

  const breadcrumbPositions = [];
  if (bc1ChapterId !== null && bc1Sequence !== null) {
    breadcrumbPositions.push({ chapterId: bc1ChapterId, sequence: bc1Sequence });
  }
  if (bc2ChapterId !== null && bc2Sequence !== null) {
    breadcrumbPositions.push({ chapterId: bc2ChapterId, sequence: bc2Sequence });
  }
  const secrets =
    secretTruth !== null || targetChapterId !== null || breadcrumbPositions.length > 0
      ? [
          {
            truth: secretTruth,
            targetPosition:
              targetChapterId !== null && targetSequence !== null
                ? { chapterId: targetChapterId, sequence: targetSequence }
                : null,
            breadcrumbPositions,
          },
        ]
      : [];

  const expectedRevisionRaw = formData.get('expectedRevision');
  const expectedRevision =
    expectedRevisionRaw === null || expectedRevisionRaw === '' ? null : Number(expectedRevisionRaw);

  const update = createUpdateFoundationDraft(getUnitOfWork());
  const result = await update({
    ownerUserId: auth.value.id,
    projectId,
    expectedRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
    payload: {
      coreConcept,
      conflict,
      endingDirection,
      readerPromise,
      mainCharacter,
      relationships,
      secrets,
    },
  });

  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, projectId };
}

export async function confirmFoundationAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }
  const projectId = String(formData.get('projectId') ?? '');
  const confirm = createConfirmFoundation(getUnitOfWork());
  const result = await confirm({ ownerUserId: auth.value.id, projectId });
  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, projectId };
}

export async function lockFoundationAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }
  const projectId = String(formData.get('projectId') ?? '');
  const acknowledged = formData.get('acknowledged') === 'on';
  const lock = createLockFoundation(getUnitOfWork());
  const result = await lock({
    ownerUserId: auth.value.id,
    projectId,
    acknowledged,
  });
  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, projectId };
}

export async function createOutlineRoadmapAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }
  const projectId = String(formData.get('projectId') ?? '');
  const title = String(formData.get('title') ?? 'Roadmap');
  const upsert = createUpsertOutlineNode(getUnitOfWork());
  const result = await upsert({
    ownerUserId: auth.value.id,
    projectId,
    entityType: 'roadmap',
    title,
  });
  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, projectId };
}

export async function createOutlineArcAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }
  const projectId = String(formData.get('projectId') ?? '');
  const parentId = String(formData.get('parentId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim() || 'Arc';
  const ordinalRaw = Number(formData.get('ordinal') ?? 0);
  const ordinal = Number.isFinite(ordinalRaw) ? Math.trunc(ordinalRaw) : 0;
  if (!parentId) {
    return { ok: false, message: 'msg.outline.parent_required' };
  }
  const upsert = createUpsertOutlineNode(getUnitOfWork());
  const result = await upsert({
    ownerUserId: auth.value.id,
    projectId,
    entityType: 'arc',
    parentId,
    title,
    ordinal,
  });
  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, projectId };
}

export async function createOutlineChapterAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }
  const projectId = String(formData.get('projectId') ?? '');
  const parentId = String(formData.get('parentId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const ordinalRaw = Number(formData.get('ordinal') ?? 0);
  const ordinal = Number.isFinite(ordinalRaw) ? Math.trunc(ordinalRaw) : 0;
  if (!parentId) {
    return { ok: false, message: 'msg.outline.parent_required' };
  }
  if (!title) {
    return { ok: false, message: 'msg.outline.title_required' };
  }
  const upsert = createUpsertOutlineNode(getUnitOfWork());
  const result = await upsert({
    ownerUserId: auth.value.id,
    projectId,
    entityType: 'chapter',
    parentId,
    title,
    ordinal,
    narrativeSequence: ordinal,
  });
  if (!result.ok) {
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, projectId };
}

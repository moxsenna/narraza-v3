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

export async function updateFoundationDraftAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireActiveUser();
  if (!auth.ok) {
    return { ok: false, message: publicError(auth.error) };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const coreConcept = String(formData.get('coreConcept') ?? '').trim() || null;
  const conflict = String(formData.get('conflict') ?? '').trim() || null;
  const endingDirection = String(formData.get('endingDirection') ?? '').trim() || null;
  const readerPromise = String(formData.get('readerPromise') ?? '').trim() || null;
  const expectedRevisionRaw = formData.get('expectedRevision');
  const expectedRevision =
    expectedRevisionRaw === null || expectedRevisionRaw === ''
      ? null
      : Number(expectedRevisionRaw);

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
      mainCharacter: null,
      relationships: [],
      secrets: [],
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

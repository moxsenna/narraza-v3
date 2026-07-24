import 'server-only';
import {
  authorizeActiveUser,
  projectProgressView,
  type ProjectProgressView,
  type ProjectRecord,
  type FoundationRecord,
  type IntakeMessageRecord,
  type OutlineNodeRecord,
} from '@narraza/application';
import { getCurrentUser } from '../auth/session';
import { getUnitOfWork } from './uow';

async function requireActiveUserId(): Promise<string | null> {
  const result = await authorizeActiveUser(async () => {
    const session = await getCurrentUser();
    if (!session) return null;
    return { id: session.userId, status: session.status, email: session.email };
  });
  return result.ok ? result.value.id : null;
}

export async function listMyProjects(): Promise<readonly ProjectRecord[]> {
  const userId = await requireActiveUserId();
  if (!userId) return [];
  return getUnitOfWork().execute((ports) => ports.project.listByOwner(userId));
}

export async function getMyProject(projectId: string): Promise<ProjectRecord | null> {
  const userId = await requireActiveUserId();
  if (!userId) return null;
  return getUnitOfWork().execute((ports) =>
    ports.project.findByIdForOwner(projectId, userId),
  );
}

export async function getProjectFoundation(
  projectId: string,
): Promise<FoundationRecord | null> {
  const project = await getMyProject(projectId);
  if (!project) return null;
  return getUnitOfWork().execute((ports) => ports.foundation.findByProjectId(projectId));
}

export async function getProjectIntakeMessages(
  projectId: string,
): Promise<readonly IntakeMessageRecord[]> {
  const project = await getMyProject(projectId);
  if (!project) return [];
  return getUnitOfWork().execute(async (ports) => {
    const session = await ports.intake.findSessionByProject(projectId);
    if (!session) return [];
    return ports.intake.listMessages(projectId, session.id);
  });
}

export async function getProjectOutline(
  projectId: string,
): Promise<readonly OutlineNodeRecord[]> {
  const project = await getMyProject(projectId);
  if (!project) return [];
  return getUnitOfWork().execute((ports) => ports.outline.listByProject(projectId));
}

export async function getProjectProgress(
  projectId: string,
): Promise<ProjectProgressView | null> {
  const project = await getMyProject(projectId);
  if (!project) return null;

  return getUnitOfWork().execute(async (ports) => {
    const session = await ports.intake.findSessionByProject(projectId);
    const messages = session
      ? await ports.intake.listMessages(projectId, session.id)
      : [];
    const foundation = await ports.foundation.findByProjectId(projectId);
    const characters = await ports.character.listByProject(projectId);
    const facts = await ports.fact.listByProject(projectId);
    const outline = await ports.outline.listByProject(projectId);
    const chapters = outline.filter((n) => n.entityType === 'chapter');
    const acceptedBeats = outline.filter(
      (n) => n.entityType === 'beat' && n.acceptedProseVersionId !== null,
    );

    return projectProgressView({
      projectStatus: project.status,
      hasIntakeMessages: messages.some((m) => m.role === 'user'),
      foundationStatus: foundation
        ? (foundation.status as 'draft' | 'confirmed' | 'locked')
        : 'none',
      characterCount: characters.length,
      factCount: facts.length,
      chapterCount: chapters.length,
      beatWithAcceptedProseCount: acceptedBeats.length,
    });
  });
}

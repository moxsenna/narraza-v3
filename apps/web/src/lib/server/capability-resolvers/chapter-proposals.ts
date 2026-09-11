import 'server-only';

import {
  authorizeActiveUser,
  createGetPendingProposals,
  type PendingProposalView,
} from '@narraza/application';
import { getCurrentUser } from '../../../server/auth/session';
import { getMyProject, getProjectOutline } from '../../../server/domain/queries';
import { getUnitOfWork } from '../../../server/domain/uow';

export type ChapterProposalsViewModel = Readonly<{
  kind: 'resolved';
  projectTitle: string;
  chapterTitle: string;
  chapterOrdinal: number | null;
  baseCanonicalVersion: number;
  proposals: readonly (PendingProposalView & { readonly sourceLabel: string })[];
}>;

export type ChapterProposalsContext = ChapterProposalsViewModel | { readonly kind: 'not_found' };

/**
 * Tutup Bab read model (W5.4): sanitized PublicProposalView rows for the
 * chapter's beats plus the server-derived action inputs. Only projections
 * cross this boundary — no raw ops, no op data, no hashes (proposal-dto).
 */
export async function resolveChapterProposals(
  projectId: string,
  chapterId: string,
): Promise<ChapterProposalsContext> {
  const auth = await authorizeActiveUser(async () => {
    const session = await getCurrentUser();
    if (!session) return null;
    return { id: session.userId, status: session.status, email: session.email };
  });
  if (!auth.ok) return { kind: 'not_found' };

  const project = await getMyProject(projectId);
  if (!project) return { kind: 'not_found' };
  const outline = await getProjectOutline(projectId);
  const chapterNode = outline.find((node) => node.id === chapterId && node.entityType === 'chapter');
  if (!chapterNode) return { kind: 'not_found' };

  const chapterBeatIds = new Set(
    outline
      .filter((node) => node.entityType === 'beat' && node.parentId === chapterId)
      .map((node) => node.id),
  );

  const getPending = createGetPendingProposals(getUnitOfWork());
  const result = await getPending({ ownerUserId: auth.value.id, projectId });
  if (!result.ok) return { kind: 'not_found' };

  const proposals = result.value
    .filter((row) => row.beatId !== null && chapterBeatIds.has(row.beatId))
    .map((row) => ({
      ...row,
      // Source axis → user-facing label (W5.4: "Diedit kamu").
      sourceLabel: row.view.source === 'user' ? 'Diedit kamu' : 'Usulan Narra',
    }));

  return {
    kind: 'resolved',
    projectTitle: project.title,
    chapterTitle: chapterNode.title,
    chapterOrdinal: chapterNode.ordinal,
    baseCanonicalVersion: result.value[0]?.baseCanonicalVersion ?? project.currentCanonicalVersion,
    proposals,
  };
}

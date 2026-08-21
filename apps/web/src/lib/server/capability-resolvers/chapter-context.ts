import 'server-only';

import { getMyProject, getProjectOutline } from '../../../server/domain/queries';

export type ChapterWritingViewModel = Readonly<{
  kind: 'resolved';
  projectTitle: string;
  chapterTitle: string;
  chapterOrdinal: number | null;
}>;

export type ChapterContext = ChapterWritingViewModel | { readonly kind: 'not_found' };

type ProjectForContext = Readonly<{ title: string }>;
type OutlineNodeForContext = Readonly<{
  entityType: string;
  title: string;
  ordinal: number | null;
  id: string;
}>;

export type ChapterContextDependencies = Readonly<{
  getProject: (projectId: string) => Promise<ProjectForContext | null>;
  getOutline: (projectId: string) => Promise<readonly OutlineNodeForContext[]>;
}>;

const defaultDependencies: ChapterContextDependencies = {
  getProject: getMyProject,
  getOutline: getProjectOutline,
};

export async function resolveChapterContext(
  projectId: string,
  chapterId: string,
  dependencies: ChapterContextDependencies = defaultDependencies,
): Promise<ChapterContext> {
  const project = await dependencies.getProject(projectId);
  if (!project) return { kind: 'not_found' };

  const outline = await dependencies.getOutline(projectId);
  const chapterNode = outline.find(
    (node) => node.id === chapterId && node.entityType === 'chapter',
  );
  if (!chapterNode) return { kind: 'not_found' };

  return {
    kind: 'resolved',
    projectTitle: project.title,
    chapterTitle: chapterNode.title,
    chapterOrdinal: chapterNode.ordinal,
  };
}

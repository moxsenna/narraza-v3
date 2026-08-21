import 'server-only';

import { getMyProject, getProjectOutline } from '../../../server/domain/queries';

export type ProjectWritingChoice = Readonly<{
  title: string;
  ordinal?: number;
}>;

export type ProjectWritingContext =
  | Readonly<{
      kind: 'choose';
      projectTitle: string;
      choices: readonly ProjectWritingChoice[];
    }>
  | Readonly<{
      kind: 'blocked';
      projectTitle: string;
      reason: 'OUTLINE_REQUIRED' | 'NO_CHAPTER_AVAILABLE';
    }>
  | Readonly<{ kind: 'not_found' }>;

type ProjectForContext = Readonly<{ title: string }>;
type OutlineNodeForContext = Readonly<{
  entityType: string;
  title: string;
  ordinal: number | null;
}>;

export type ProjectContextDependencies = Readonly<{
  getProject: (projectId: string) => Promise<ProjectForContext | null>;
  getOutline: (projectId: string) => Promise<readonly OutlineNodeForContext[]>;
}>;

const defaultDependencies: ProjectContextDependencies = {
  getProject: getMyProject,
  getOutline: getProjectOutline,
};

export async function resolveProjectWritingContext(
  projectId: string,
  dependencies: ProjectContextDependencies = defaultDependencies,
): Promise<ProjectWritingContext> {
  const project = await dependencies.getProject(projectId);
  if (!project) return { kind: 'not_found' };

  const outline = await dependencies.getOutline(projectId);
  if (outline.length === 0) {
    return {
      kind: 'blocked',
      projectTitle: project.title,
      reason: 'OUTLINE_REQUIRED',
    };
  }

  const chapterNodes = outline.filter((node) => node.entityType === 'chapter');
  if (chapterNodes.length === 0) {
    return {
      kind: 'blocked',
      projectTitle: project.title,
      reason: 'NO_CHAPTER_AVAILABLE',
    };
  }

  const sortedChapters = [...chapterNodes].sort((a, b) => {
    const aOrdinal = a.ordinal;
    const bOrdinal = b.ordinal;

    if (aOrdinal !== null && bOrdinal !== null) {
      if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    }

    if (aOrdinal === null && bOrdinal === null) {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    }

    return aOrdinal === null ? 1 : -1;
  });

  return {
    kind: 'choose',
    projectTitle: project.title,
    choices: sortedChapters.map((node) => ({
      title: node.title,
      ...(node.ordinal === null ? {} : { ordinal: node.ordinal }),
    })),
  };
}

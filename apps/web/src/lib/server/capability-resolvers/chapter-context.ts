'use server';

import { getMyProject, getProjectFoundation, getProjectOutline } from '../../../server/domain/queries';
import type { ChapterContextResult, ChapterChoiceView } from './types';

/**
 * Locked Chapter Context Resolver — Server-Only Enforcement
 * 
 * Pattern: resolve → choose → blocked (never bypass)
 * 
 * NO first-array fallback. NO localStorage. NO fixture chapterId.
 * NO silent catch-and-render-fixture.
 */
export async function resolveChapterContext(
  projectId: string,
  chapterId: string
): Promise<ChapterContextResult> {
  // Step 1: Verify project ownership
  const project = await getMyProject(projectId);
  
  if (!project) {
    return {
      kind: 'blocked',
      reasonCode: 'no_chapter',
      outlineHref: `/app/proyek/${projectId}/outline`,
    };
  }
  
  // Step 2: Check foundation is locked
  const foundation = await getProjectFoundation(projectId);
  
  if (!foundation || foundation.status !== 'locked') {
    return {
      kind: 'blocked',
      reasonCode: 'foundation_not_locked',
      outlineHref: `/app/proyek/${projectId}/outline`,
    };
  }
  
  // Step 3: Get outline nodes
  const outlineNodes = await getProjectOutline(projectId);
  
  // Step 4: Find specific chapter by its ID field (not chapterId property)
  const chapterNode = outlineNodes.find((node) => node.entityType === 'chapter' && node.id === chapterId);
  
  if (!chapterNode) {
    return {
      kind: 'blocked',
      reasonCode: 'no_writable_chapter',
      outlineHref: `/app/proyek/${projectId}/outline`,
    };
  }
  
  // Step 5: Resolve successfully
  return {
    kind: 'resolved',
    projectId,
    chapterId: chapterNode.id,
    href: `/app/proyek/${projectId}/bab/${chapterNode.id}`,
  };
}

/**
 * List available chapters for user choice
 */
export async function listAvailableChapters(projectId: string): Promise<readonly ChapterChoiceView[]> {
  const project = await getMyProject(projectId);
  
  if (!project) {
    return [];
  }
  
  const foundation = await getProjectFoundation(projectId);
  
  if (!foundation || foundation.status !== 'locked') {
    return [];
  }
  
  const outlineNodes = await getProjectOutline(projectId);
  
  const chapters = outlineNodes
    .filter((node) => node.entityType === 'chapter')
    .map((node) => ({
      id: node.id,
      title: node.title,
      ordinal: node.ordinal ?? undefined,
    })) as readonly ChapterChoiceView[];
  
  return chapters;
}

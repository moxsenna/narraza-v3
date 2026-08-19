'use server';

import { notFound } from 'next/navigation';
import { getMyProject, listMyProjects } from '../../../../domain/queries';
import type { ProjectContextResult, ProjectChoiceView } from './types';

/**
 * Locked Project Context Resolver — Server-Only Enforcement
 * 
 * Pattern: resolve → choose → blocked (never bypass)
 * 
 * NO first-array fallback. NO localStorage. NO fixture projectId.
 * NO silent catch-and-render-fixture.
 */
export async function resolveProjectContext(): Promise<ProjectContextResult> {
  const myProjects = await listMyProjects();
  
  // Case 1: No projects at all
  if (myProjects.length === 0) {
    return {
      kind: 'blocked',
      reasonCode: 'no_project',
      createProjectHref: '/app/proyek/baru',
    };
  }
  
  // Case 2: Multiple projects — present choice (M4+)
  if (myProjects.length > 1) {
    const choices: ProjectChoiceView[] = myProjects.map((p) => ({
      id: p.id,
      title: p.title,
      outlineCount: p.outlineNodes?.length ?? 0,
    }));
    
    return {
      kind: 'choose',
      projects: choices,
    };
  }
  
  // Case 3: Single project — resolved and active
  const [activeProject] = myProjects;
  
  try {
    await getMyProject(activeProject.id);
  } catch (error) {
    // Authorization failure — do NOT fake a fixture project
    // This is hard-coded blocking behavior as required
    throw error;
  }
  
  return {
    kind: 'resolved',
    projectId: activeProject.id,
    href: `/app/proyek/${activeProject.id}`,
  };
}

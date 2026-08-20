import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ProjectAppShell } from '../../../../components/composites/ProjectAppShell';
import { makeProjectIdentityViewModel } from '../../../../lib/frontend/view-model';
import { getMyProject } from '../../../../server/domain/queries';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  return (
    <ProjectAppShell project={makeProjectIdentityViewModel(project.id, project.title)}>
      {children}
    </ProjectAppShell>
  );
}

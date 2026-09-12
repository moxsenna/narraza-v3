import type { ReactNode } from 'react';
import type { ProjectIdentityViewModel } from '../../lib/frontend/view-model';
import { MobileBottomNav } from './MobileBottomNav';
import { ProjectNavigationDrawer } from './ProjectNavigationDrawer';
import { ProjectSidebar } from './ProjectSidebar';

export function ProjectAppShell({
  project,
  children,
}: {
  project: ProjectIdentityViewModel;
  children: ReactNode;
}) {
  return (
    <div data-testid="project-shell" className="mx-auto flex w-full max-w-[1600px]">
      <ProjectSidebar projectId={project.projectId} />
      <div className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] xl:pb-0">
        <div className="flex min-h-[68px] items-center gap-3 border-b border-default bg-surface px-4 sm:px-6">
          <ProjectNavigationDrawer projectId={project.projectId} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted">PROYEK</p>
            <p className="truncate font-bold text-primary">{project.title}</p>
          </div>
        </div>
        {children}
      </div>
      <MobileBottomNav context={{ kind: 'project', projectId: project.projectId }} />
    </div>
  );
}

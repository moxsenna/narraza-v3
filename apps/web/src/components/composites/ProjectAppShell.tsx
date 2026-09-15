import type { ReactNode } from 'react';
import type { ProjectIdentityViewModel } from '../../lib/frontend/view-model';
import { MobileBottomNav } from './MobileBottomNav';
import { ProjectNavigationDrawer } from './ProjectNavigationDrawer';
import { ProjectSidebar } from './ProjectSidebar';

// NOTE: The top header (TopNav: brand, novel switcher, mode tabs, credit
// pill, logout) renders once in app/app/layout.tsx for the whole /app tree,
// so this shell only owns the project-local chrome: desktop sidebar, tablet
// drawer, and mobile bottom nav.

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
        <ProjectNavigationDrawer projectId={project.projectId} />
        {children}
      </div>
      <MobileBottomNav context={{ kind: 'project', projectId: project.projectId }} />
    </div>
  );
}

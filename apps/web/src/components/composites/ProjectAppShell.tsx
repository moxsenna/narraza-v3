import type { ReactNode } from 'react';
import type { ProjectIdentityViewModel } from '../../lib/frontend/view-model';
import { logoutAction } from '../../server/auth/actions';
import { getCurrentUser } from '../../server/auth/session';
import { getCreditSummaryViewForUser } from '../../server/domain/generation';
import { listMyProjects } from '../../server/domain/queries';
import { TopNav, type TopNavMoreItem, type TopNavProject } from '../nav/TopNav';
import { ProjectNavigationDrawer } from './ProjectNavigationDrawer';
import { ProjectSidebar } from './ProjectSidebar';
import { makeShellAccountViewModel } from '../../lib/frontend/view-model';
import {
  CAPABILITIES,
  CAPABILITY_REASON_MESSAGES,
  type CapabilityKey,
} from '../../lib/frontend/capabilities';
import { MobileBottomNav } from './MobileBottomNav';

function projectMoreItems(base: string): readonly TopNavMoreItem[] {
  const linked: ReadonlyArray<{ label: string; capabilityKey: CapabilityKey; href: string }> = [
    { label: 'Chat Narra', capabilityKey: 'project.chat.user-message', href: `${base}/chat` },
    {
      label: 'Karakter',
      capabilityKey: 'project.characters.read',
      href: `${base}/karakter`,
    },
    { label: 'Fakta', capabilityKey: 'project.facts.read', href: `${base}/fakta` },
    {
      label: 'Jadwal Rahasia',
      capabilityKey: 'project.secrets.read',
      href: `${base}/rahasia`,
    },
    { label: 'Kredit & Penggunaan', capabilityKey: 'app.credit.view', href: '/app/kredit' },
  ];
  const gated: ReadonlyArray<{ label: string; capabilityKey: CapabilityKey }> = [
    { label: 'Naskah', capabilityKey: 'project.manuscript.view' },
    { label: 'Cek Cerita', capabilityKey: 'chapter.check.run' },
    { label: 'Pengaturan', capabilityKey: 'app.settings.view' },
  ];

  return [
    ...linked.map((item) => ({ label: item.label, href: item.href })),
    ...gated.map((item) => ({
      label: item.label,
      reason: CAPABILITY_REASON_MESSAGES[CAPABILITIES[item.capabilityKey].reasonCode],
    })),
  ];
}

export async function ProjectAppShell({
  project,
  children,
}: {
  project: ProjectIdentityViewModel;
  children: ReactNode;
}) {
  const base = `/app/proyek/${encodeURIComponent(project.projectId)}`;
  const user = await getCurrentUser();
  const credit = user ? await getCreditSummaryViewForUser(user.userId) : null;
  const projects = await listMyProjects();

  const allProjects: readonly TopNavProject[] = projects.map((item) => ({
    id: item.id,
    title: item.title,
  }));

  return (
    <div data-testid="project-shell" className="mx-auto w-full max-w-[1600px]">
      <TopNav
        account={user ? makeShellAccountViewModel(user.email) : null}
        logoutAction={logoutAction}
        credit={credit}
        currentProject={{ id: project.projectId, title: project.title }}
        allProjects={allProjects}
        moreItems={projectMoreItems(base)}
      />
      <div className="flex w-full">
        <ProjectSidebar projectId={project.projectId} />
        <div className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] xl:pb-0">
          <ProjectNavigationDrawer projectId={project.projectId} />
          {children}
        </div>
      </div>
      <MobileBottomNav context={{ kind: 'project', projectId: project.projectId }} />
    </div>
  );
}

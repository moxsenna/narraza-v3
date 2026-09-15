import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { TopNav, type TopNavMoreItem, type TopNavProject } from '../../components/nav/TopNav';
import {
  CAPABILITIES,
  CAPABILITY_REASON_MESSAGES,
  type CapabilityKey,
} from '../../lib/frontend/capabilities';
import { makeShellAccountViewModel } from '../../lib/frontend/view-model';
import { APP_MESSAGES_ID } from '../../messages/app-id';
import { logoutAction } from '../../server/auth/actions';
import { getCurrentUser } from '../../server/auth/session';
import { getCreditSummaryViewForUser } from '../../server/domain/generation';
import { getMyProject, listMyProjects } from '../../server/domain/queries';

function globalMoreItems(): readonly TopNavMoreItem[] {
  const settingsReason = CAPABILITY_REASON_MESSAGES[CAPABILITIES['app.settings.view'].reasonCode];
  return [
    {
      label: 'Kredit & Penggunaan',
      href: '/app/kredit',
    },
    { label: 'Pengaturan', reason: settingsReason },
  ];
}

function projectMoreItems(base: string): readonly TopNavMoreItem[] {
  const linked: ReadonlyArray<{ label: string; href: string }> = [
    { label: 'Chat Narra', href: `${base}/chat` },
    { label: 'Karakter', href: `${base}/karakter` },
    { label: 'Fakta', href: `${base}/fakta` },
    { label: 'Jadwal Rahasia', href: `${base}/rahasia` },
    { label: 'Kredit & Penggunaan', href: '/app/kredit' },
  ];
  const gated: ReadonlyArray<{ label: string; capabilityKey: CapabilityKey }> = [
    { label: 'Naskah', capabilityKey: 'project.manuscript.view' },
    { label: 'Cek Cerita', capabilityKey: 'chapter.check.run' },
    { label: 'Pengaturan', capabilityKey: 'app.settings.view' },
  ];

  return [
    ...linked,
    ...gated.map((item) => ({
      label: item.label,
      reason: CAPABILITY_REASON_MESSAGES[CAPABILITIES[item.capabilityKey].reasonCode],
    })),
  ];
}

function projectIdFromPathname(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'app' || segments[1] !== 'proyek') return null;
  const candidate = segments[2];
  if (!candidate || candidate === 'baru' || candidate === 'impor') return null;
  try {
    return decodeURIComponent(candidate);
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/masuk');

  // Same CreditSummaryView source as /app/kredit (D6): one snapshot contract
  // for the header chip and the credit page. The session above is the single
  // shell auth authority; the loader only takes the authenticated userId.
  const credit = await getCreditSummaryViewForUser(user.userId);
  const projects = await listMyProjects();

  // Single TopNav for the whole /app tree (global + project shells share it,
  // so there is exactly one header, one credit chip, one logout). The active
  // project resolves owner-scoped from the middleware pathname header.
  const pathname = (await headers()).get('x-pathname') ?? '/app';
  const activeProjectId = projectIdFromPathname(pathname);
  const activeProject = activeProjectId ? await getMyProject(activeProjectId) : null;

  const allProjects: readonly TopNavProject[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
  }));
  const currentProject = activeProject
    ? { id: activeProject.id, title: activeProject.title }
    : null;
  const moreItems = activeProject
    ? projectMoreItems(`/app/proyek/${encodeURIComponent(activeProject.id)}`)
    : globalMoreItems();

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-primary">
      <a
        href="#app-main-content"
        className="fixed top-2 left-2 z-[var(--z-overlay)] -translate-y-20 rounded-md bg-surface px-4 py-3 font-semibold text-brand-strong shadow-lg focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-strong"
      >
        {APP_MESSAGES_ID.common.skipToContent}
      </a>
      <TopNav
        account={makeShellAccountViewModel(user.email)}
        logoutAction={logoutAction}
        credit={credit}
        currentProject={currentProject}
        allProjects={allProjects}
        moreItems={moreItems}
      />
      <div id="app-main-content">{children}</div>
    </div>
  );
}

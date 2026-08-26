import {
  CAPABILITIES,
  CAPABILITY_REASON_MESSAGES,
  type CapabilityKey,
} from '../../lib/frontend/capabilities';
import { RouteAwareNavLink, type RouteNavigationActivationHandler } from './RouteAwareNavLink';

export type ProjectNavigationItem = Readonly<{
  label: string;
  capabilityKey: CapabilityKey;
  href?: string;
}>;
export type ProjectNavigationGroup = Readonly<{
  label: string;
  items: readonly ProjectNavigationItem[];
}>;

export function buildProjectNavigation(projectId: string): readonly ProjectNavigationGroup[] {
  const base = `/app/proyek/${encodeURIComponent(projectId)}`;

  return [
    {
      label: 'PERSIAPAN',
      items: [
        { label: 'Beranda', capabilityKey: 'project.home.view', href: base },
        {
          label: 'Chat Narra',
          capabilityKey: 'project.chat.user-message',
          href: `${base}/chat`,
        },
        {
          label: 'Fondasi',
          capabilityKey: 'project.foundation.manage',
          href: `${base}/fondasi`,
        },
        {
          label: 'Karakter',
          capabilityKey: 'project.characters.read',
          href: `${base}/karakter`,
        },
      ],
    },
    {
      label: 'PERENCANAAN',
      items: [
        {
          label: 'Rencana Cerita',
          capabilityKey: 'project.outline.create',
          href: `${base}/outline`,
        },
        {
          label: 'Jadwal Rahasia',
          capabilityKey: 'project.secrets.read',
          href: `${base}/rahasia`,
        },
        { label: 'Fakta', capabilityKey: 'project.facts.read', href: `${base}/fakta` },
      ],
    },
    {
      label: 'PENULISAN',
      items: [
        { label: 'Naskah', capabilityKey: 'project.manuscript.view' },
        { label: 'Tulis', capabilityKey: 'project.write.resume' },
      ],
    },
    {
      label: 'PEMERIKSAAN',
      items: [{ label: 'Cek Cerita', capabilityKey: 'chapter.check.run' }],
    },
    {
      label: 'PUBLIKASI',
      items: [{ label: 'Paket Publish', capabilityKey: 'project.publish.view' }],
    },
    {
      label: 'LAINNYA',
      items: [
        { label: 'Kredit & Penggunaan', capabilityKey: 'app.credit.view' },
        { label: 'Pengaturan', capabilityKey: 'app.settings.view' },
      ],
    },
  ] as const;
}

export function ProjectNavigation({
  projectId,
  labelledBy,
  idPrefix,
  onNavigate,
}: {
  projectId: string;
  labelledBy?: string;
  idPrefix: string;
  onNavigate?: RouteNavigationActivationHandler;
}) {
  return (
    <nav
      aria-label={labelledBy ? undefined : 'Navigasi proyek'}
      aria-labelledby={labelledBy}
      className="p-4"
    >
      {buildProjectNavigation(projectId).map((group) => {
        const headingId = `${idPrefix}-${group.label.toLocaleLowerCase('id-ID')}`;
        return (
          <section key={group.label} aria-labelledby={headingId} className="mb-6">
            <h2 id={headingId} className="px-3 text-xs font-bold text-muted">
              {group.label}
            </h2>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => {
                const capability = CAPABILITIES[item.capabilityKey];
                const reason = CAPABILITY_REASON_MESSAGES[capability.reasonCode];
                return (
                  <li key={item.capabilityKey}>
                    {item.href ? (
                      <RouteAwareNavLink
                        href={item.href}
                        className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-secondary hover:bg-brand-soft"
                        activeClassName="bg-brand-soft text-primary"
                        {...(onNavigate ? { onNavigateActivation: onNavigate } : {})}
                      >
                        {item.label}
                      </RouteAwareNavLink>
                    ) : (
                      <div aria-disabled="true" className="rounded-md px-3 py-2 text-muted">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-1 block text-xs">{reason}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

export function ProjectSidebar({ projectId }: { projectId: string }) {
  return (
    <aside
      data-testid="project-sidebar"
      className="hidden w-64 shrink-0 border-r border-default bg-surface xl:block"
    >
      <div className="sticky top-[68px] max-h-[calc(100vh-68px)] overflow-y-auto">
        <ProjectNavigation projectId={projectId} idPrefix="sidebar-nav" />
      </div>
    </aside>
  );
}

import {
  CAPABILITIES,
  CAPABILITY_REASON_MESSAGES,
  type CapabilityKey,
} from '../../lib/frontend/capabilities';
import { MobileMoreControl } from './MobileMoreControl';
import { RouteAwareNavLink } from './RouteAwareNavLink';

type Context = { kind: 'global' } | { kind: 'project'; projectId: string };
type MobileItem = Readonly<{ label: string; capabilityKey: CapabilityKey; href?: string }>;

export function MobileBottomNav({ context }: { context: Context }) {
  const base =
    context.kind === 'project' ? `/app/proyek/${encodeURIComponent(context.projectId)}` : null;
  const items: readonly MobileItem[] = [
    {
      label: 'Beranda',
      capabilityKey: base ? 'project.home.view' : 'app.dashboard.view',
      href: base ?? '/app',
    },
    {
      label: 'Rencana',
      capabilityKey: 'project.outline.create',
      ...(base ? { href: `${base}/outline` } : {}),
    },
    { label: 'Tulis', capabilityKey: 'project.write.resume' },
    { label: 'Cek', capabilityKey: 'chapter.check.run' },
  ];

  return (
    <nav
      aria-label="Navigasi aplikasi mobile"
      className="fixed inset-x-0 bottom-0 z-[var(--z-header)] grid grid-cols-5 border-t border-default bg-surface pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      {items.map((item) => {
        const capability = CAPABILITIES[item.capabilityKey];
        const reason = base
          ? CAPABILITY_REASON_MESSAGES[capability.reasonCode]
          : CAPABILITY_REASON_MESSAGES.PROJECT_CONTEXT_REQUIRED;
        return item.href ? (
          <RouteAwareNavLink
            key={item.capabilityKey}
            className="flex min-h-11 items-center justify-center px-2 text-xs font-semibold"
            activeClassName="bg-brand-soft text-primary"
            href={item.href}
          >
            {item.label}
          </RouteAwareNavLink>
        ) : (
          <span
            key={item.capabilityKey}
            aria-disabled="true"
            className="flex min-h-11 flex-col items-center justify-center px-1 text-muted"
          >
            <span className="text-xs">{item.label}</span>
            <span className="text-[10px] leading-tight">{reason}</span>
          </span>
        );
      })}
      <MobileMoreControl context={context} />
    </nav>
  );
}

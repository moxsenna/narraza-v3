import {
  CAPABILITIES,
  CAPABILITY_REASON_MESSAGES,
  type CapabilityKey,
} from '../../lib/frontend/capabilities';
import { MobileMoreControl } from './MobileMoreControl';
import { MobileNavIcon } from './MobileNavIcon';
import { RouteAwareNavLink } from './RouteAwareNavLink';

type Context = { kind: 'global' } | { kind: 'project'; projectId: string };
type MobileItem = Readonly<{
  label: string;
  icon: 'home' | 'plan' | 'write' | 'check';
  capabilityKey: CapabilityKey;
  href?: string;
}>;

export function MobileBottomNav({ context }: { context: Context }) {
  const base =
    context.kind === 'project' ? `/app/proyek/${encodeURIComponent(context.projectId)}` : null;
  const items: readonly MobileItem[] = [
    {
      label: 'Beranda',
      icon: 'home',
      capabilityKey: base ? 'project.home.view' : 'app.dashboard.view',
      href: base ?? '/app',
    },
    {
      label: 'Rencana',
      icon: 'plan',
      capabilityKey: 'project.outline.create',
      ...(base ? { href: `${base}/outline` } : {}),
    },
    {
      label: 'Tulis',
      icon: 'write',
      capabilityKey: 'project.write.resume',
      ...(base ? { href: `${base}/tulis` } : {}),
    },
    { label: 'Cek', icon: 'check', capabilityKey: 'chapter.check.run' },
  ];

  return (
    <nav
      aria-label="Navigasi aplikasi mobile"
      className="fixed inset-x-0 bottom-0 z-[var(--z-header)] grid min-h-[72px] grid-cols-5 border-t border-default bg-surface/98 px-1 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(36,23,30,0.06)] backdrop-blur xl:hidden"
    >
      {items.map((item) => {
        const capability = CAPABILITIES[item.capabilityKey];
        const reason = base
          ? CAPABILITY_REASON_MESSAGES[capability.reasonCode]
          : CAPABILITY_REASON_MESSAGES.PROJECT_CONTEXT_REQUIRED;
        return item.href ? (
          <RouteAwareNavLink
            key={item.capabilityKey}
            className="group flex min-h-11 flex-col items-center justify-start gap-[3px] px-1 text-ink-300"
            activeClassName="text-brand-800"
            href={item.href}
          >
            <span className="flex h-[30px] w-11 items-center justify-center rounded-pill transition-colors group-aria-[current=page]:bg-brand-100 group-aria-[current=page]:text-brand-700">
              <MobileNavIcon name={item.icon} />
            </span>
            <span className="text-[10px] leading-none font-semibold group-aria-[current=page]:font-bold">
              {item.label}
            </span>
          </RouteAwareNavLink>
        ) : (
          <span
            key={item.capabilityKey}
            aria-disabled="true"
            title={reason}
            className="flex min-h-11 flex-col items-center justify-start gap-[3px] px-1 text-ink-300"
          >
            <span className="flex h-[30px] w-11 items-center justify-center">
              <MobileNavIcon name={item.icon} />
            </span>
            <span className="text-[10px] leading-none font-semibold">{item.label}</span>
            <span className="sr-only">{reason}</span>
          </span>
        );
      })}
      <MobileMoreControl context={context} />
    </nav>
  );
}

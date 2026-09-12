'use client';

import {
  CAPABILITIES,
  CAPABILITY_REASON_MESSAGES,
  type CapabilityKey,
} from '../../lib/frontend/capabilities';
import { logoutAction } from '../../server/auth/actions';
import { Button } from '../primitives';
import { BottomSheet } from './BottomSheet';
import { RouteAwareNavLink } from './RouteAwareNavLink';

type Context = { kind: 'global' } | { kind: 'project'; projectId: string };
type SheetItem = Readonly<{ label: string; capabilityKey: CapabilityKey; href?: string }>;

export function MobileMoreSheet({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  context: Context;
}) {
  const base =
    context.kind === 'project' ? `/app/proyek/${encodeURIComponent(context.projectId)}` : null;
  const items: readonly SheetItem[] = base
    ? [
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
        {
          label: 'Jadwal Rahasia',
          capabilityKey: 'project.secrets.read',
          href: `${base}/rahasia`,
        },
        { label: 'Fakta', capabilityKey: 'project.facts.read', href: `${base}/fakta` },
        { label: 'Naskah', capabilityKey: 'project.manuscript.view' },
        { label: 'Paket Publish', capabilityKey: 'project.publish.view' },
        { label: 'Kredit & Penggunaan', capabilityKey: 'app.credit.view', href: '/app/kredit' },
        { label: 'Pengaturan', capabilityKey: 'app.settings.view' },
      ]
    : [
        // Global shell has no project context: keep account routes reachable.
        { label: 'Kredit & Penggunaan', capabilityKey: 'app.credit.view', href: '/app/kredit' },
        { label: 'Pengaturan', capabilityKey: 'app.settings.view' },
      ];

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Lainnya"
      description="Navigasi dan akun"
    >
      <nav aria-label="Navigasi lainnya">
        <ul className="space-y-1">
          {items.map((item) => {
            const capability = CAPABILITIES[item.capabilityKey];
            const reason = CAPABILITY_REASON_MESSAGES[capability.reasonCode];
            return (
              <li key={item.capabilityKey}>
                {item.href ? (
                  <RouteAwareNavLink
                    className="flex min-h-11 items-center rounded-md px-3 font-semibold text-secondary"
                    activeClassName="bg-brand-soft text-primary"
                    href={item.href}
                    onNavigateActivation={() => onOpenChange(false)}
                  >
                    {item.label}
                  </RouteAwareNavLink>
                ) : (
                  <div aria-disabled="true" className="rounded-md px-3 py-2 text-muted">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs">{reason}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <form action={logoutAction} className="mt-4 border-t border-default pt-4">
        <Button type="submit" variant="secondary" className="w-full">
          Keluar
        </Button>
      </form>
    </BottomSheet>
  );
}

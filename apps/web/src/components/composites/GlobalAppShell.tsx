import type { ReactNode } from 'react';
import { MobileBottomNav } from './MobileBottomNav';

export function GlobalAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 pb-[calc(72px+env(safe-area-inset-bottom))] xl:pb-0">
      <div data-testid="global-shell">{children}</div>
      <MobileBottomNav context={{ kind: 'global' }} />
    </div>
  );
}

import type { ShellAccountViewModel } from '../../lib/frontend/view-model';
import { Button } from '../primitives';
import { BrandMark } from './BrandMark';

export function AppHeader({
  account,
  logoutAction,
}: {
  account: ShellAccountViewModel;
  logoutAction: () => Promise<void>;
}) {
  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-default bg-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[1600px] items-center gap-3 px-3 sm:px-6">
        <BrandMark href="/app" />
        <span className="ml-auto hidden min-h-11 items-center rounded-pill border border-default bg-canvas px-4 text-sm font-semibold text-secondary sm:inline-flex">
          Kredit — segera hadir
        </span>
        <span
          aria-label={`Akun: ${account.email}`}
          title={account.email}
          className="flex size-11 items-center justify-center rounded-pill bg-brand-ink text-sm font-bold text-white"
        >
          {account.initial}
        </span>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Keluar
          </Button>
        </form>
      </div>
    </header>
  );
}

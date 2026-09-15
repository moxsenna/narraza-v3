import type { ShellAccountViewModel } from '../../lib/frontend/view-model';
import type { CreditSummaryDisplayView } from '../../lib/frontend/credit-display';
import { Button } from '../primitives';
import { BrandMark } from './BrandMark';
import { CreditChip } from './HeaderCreditChip';

export function AppHeader({
  account,
  logoutAction,
  credit,
}: {
  account: ShellAccountViewModel;
  logoutAction: () => Promise<void>;
  credit: CreditSummaryDisplayView | null;
}) {
  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-default bg-surface">
      <div className="flex min-h-[68px] items-center gap-3 px-3 sm:px-6">
        <div className="flex items-center gap-2">
          <BrandMark href="/app" />
          <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-strong">
            v3 OS
          </span>
        </div>

        <div className="hidden items-center gap-1.5 rounded-pill border border-status-success-soft bg-status-success-soft px-3 py-1 text-xs font-bold text-status-success lg:flex">
          <span className="size-1.5 rounded-pill bg-status-success" aria-hidden="true" />
          <span>Alur Konsisten (100%)</span>
        </div>

        {credit ? (
          <CreditChip credit={credit} />
        ) : (
          <span className="ml-auto hidden min-h-11 items-center rounded-pill border border-default bg-canvas px-4 text-sm text-secondary sm:inline-flex">
            Kredit — segera hadir
          </span>
        )}
        <span
          aria-label={`Akun: ${account.email}`}
          title={account.email}
          className="flex size-10 items-center justify-center rounded-pill bg-brand-ink text-sm font-bold text-white shadow-xs"
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

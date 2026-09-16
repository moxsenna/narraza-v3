import Link from 'next/link';
import type { CreditSummaryDisplayView } from '../../lib/frontend/credit-display';
import type { ShellAccountViewModel } from '../../lib/frontend/view-model';
import { RouteAwareNavLink } from '../composites/RouteAwareNavLink';
import { MoreMenu } from './MoreMenu';
import { NovelSwitcher } from './NovelSwitcher';

import type { TopNavMoreItem, TopNavProject } from './topnav-types';

export type { TopNavMoreItem, TopNavProject };

export interface TopNavProps {
  account?: ShellAccountViewModel | null;
  credit?: CreditSummaryDisplayView | null;
  currentProject?: TopNavProject | null;
  allProjects?: readonly TopNavProject[];
  moreItems?: readonly TopNavMoreItem[];
  logoutAction?: () => Promise<void>;
  continuityScore?: number;
}

export function TopNav({
  account,
  credit,
  currentProject,
  allProjects = [],
  moreItems = [],
  logoutAction,
  continuityScore = 100,
}: TopNavProps) {
  const projectId = currentProject?.id;
  const projectBase = projectId ? `/app/proyek/${encodeURIComponent(projectId)}` : null;

  // Credit display adhering to D6 (1 credit = Rp10 / MICRO_IDR_PER_CREDIT).
  // availableCredits already carries the floor rule from the application layer.
  const availableCredits = credit?.availableCredits ?? 0;
  const creditIdr = (availableCredits * 10).toLocaleString('id-ID');

  const modeTabs = projectBase
    ? [
        { label: 'Ruang Tulis', href: `${projectBase}/tulis` },
        { label: 'Rencana Bab', href: `${projectBase}/outline` },
        { label: 'Fondasi Cerita', href: `${projectBase}/fondasi` },
        { label: 'Paket Publish', href: `${projectBase}/publish` },
      ]
    : [];

  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-default bg-white text-primary">
      <div className="mx-auto flex h-[60px] w-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:px-6">
        {/* Left: Brand & Novel Switcher */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/app" className="group flex shrink-0 items-center gap-2">
            <div
              className="flex size-7 items-center justify-center rounded-[5px_5px_10px_5px] bg-brand-600 shadow-sm transition-transform group-hover:scale-105"
              aria-hidden="true"
            />
            <span className="hidden font-heading text-lg font-extrabold tracking-tight text-brand-900 min-[420px]:inline">
              Narraza
            </span>
          </Link>

          <div className="hidden h-5 w-[1px] shrink-0 bg-default md:block" aria-hidden="true" />

          <div className="hidden md:block">
            <NovelSwitcher current={currentProject ?? null} all={allProjects} />
          </div>
        </div>

        {/* Center: Mode Tabs + Lainnya */}
        {modeTabs.length > 0 && (
          <nav
            aria-label="Navigasi mode produksi"
            className="hidden items-center gap-1 rounded-[10px] bg-surface-soft p-1 lg:flex"
          >
            {modeTabs.map((tab) => (
              <RouteAwareNavLink
                key={tab.label}
                href={tab.href}
                match="prefix"
                className="rounded-[7px] px-3.5 py-1.5 text-xs font-semibold text-muted transition-all hover:text-primary"
                activeClassName="border border-default bg-white font-bold text-primary shadow-xs"
              >
                {tab.label}
              </RouteAwareNavLink>
            ))}
            <MoreMenu items={moreItems} />
          </nav>
        )}

        {/* Right: Continuity, Credit Pill, Avatar */}
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <div
            title="Pemeriksaan alur deterministik & non-AI validator"
            className="hidden items-center gap-1.5 rounded-full border border-status-success-soft bg-status-success-soft px-2.5 py-1 text-[11px] font-bold text-status-success md:flex"
          >
            <span className="size-1.5 rounded-full bg-status-success" aria-hidden="true" />
            <span>Alur Konsisten ({continuityScore}%)</span>
          </div>

          <Link
            href="/app/kredit"
            data-testid="header-credit-chip"
            aria-label={`Saldo kredit: ${availableCredits} kredit (Rp${creditIdr}). Buka halaman kredit.`}
            className="flex items-center gap-1.5 rounded-full border border-default bg-white px-2.5 py-1.5 text-xs font-bold text-primary shadow-xs transition-colors hover:border-brand-700 hover:bg-brand-soft sm:px-3"
          >
            <span className="text-brand-700" aria-hidden="true">
              ✦
            </span>
            <span className="tabular-nums">{availableCredits.toLocaleString('id-ID')}</span>
            <span className="hidden sm:inline">Kredit</span>
            <span className="hidden text-[11px] font-normal text-muted md:inline">
              (Rp{creditIdr})
            </span>
          </Link>

          {account && (
            <div className="flex items-center gap-2">
              <span
                title={account.email}
                className="hidden size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-xs sm:flex"
              >
                {account.initial}
              </span>
              {logoutAction && (
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-lg border border-default px-2.5 py-1 text-xs font-semibold text-muted hover:bg-canvas hover:text-primary"
                  >
                    Keluar
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

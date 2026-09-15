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
        { label: 'Alkitab Cerita', href: `${projectBase}/fondasi` },
        { label: 'Paket Publish', href: `${projectBase}/publish` },
      ]
    : [];

  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-[#E2E8F0] bg-white text-[#0F172A]">
      <div className="mx-auto flex h-[60px] w-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:px-6">
        {/* Left: Brand & Novel Switcher */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/app" className="group flex shrink-0 items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-[7px] bg-[#881337] shadow-sm transition-transform group-hover:scale-105">
              <span className="font-heading text-base font-extrabold text-white">N</span>
            </div>
            <span className="font-heading text-lg font-extrabold tracking-tight text-[#881337]">
              Narraza
            </span>
            <span className="rounded-full bg-[#FFE4E6] px-1.5 py-0.5 font-body text-[10px] font-bold text-[#9F1239]">
              v3 OS
            </span>
          </Link>

          <div className="hidden h-5 w-[1px] shrink-0 bg-[#E2E8F0] md:block" aria-hidden="true" />

          <div className="hidden md:block">
            <NovelSwitcher current={currentProject ?? null} all={allProjects} />
          </div>
        </div>

        {/* Center: Mode Tabs + Lainnya */}
        {modeTabs.length > 0 && (
          <nav
            aria-label="Navigasi mode produksi"
            className="hidden items-center gap-1 rounded-[10px] bg-[#F1F5F9] p-1 lg:flex"
          >
            {modeTabs.map((tab) => (
              <RouteAwareNavLink
                key={tab.label}
                href={tab.href}
                match="prefix"
                className="rounded-[7px] px-3.5 py-1.5 text-xs font-semibold text-[#64748B] transition-all hover:text-[#0F172A]"
                activeClassName="border border-[#E2E8F0] bg-white font-bold text-[#0F172A] shadow-xs"
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
            className="hidden items-center gap-1.5 rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#047857] md:flex"
          >
            <span className="size-1.5 rounded-full bg-[#059669]" aria-hidden="true" />
            <span>Alur Konsisten ({continuityScore}%)</span>
          </div>

          <Link
            href="/app/kredit"
            data-testid="top-nav-credit-pill"
            aria-label={`Saldo kredit: ${availableCredits} kredit (Rp${creditIdr}). Buka halaman kredit.`}
            className="flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-bold text-[#0F172A] shadow-xs transition-colors hover:border-[#BE123C] hover:bg-[#FFF5F8]"
          >
            <span className="text-[#BE123C]" aria-hidden="true">
              ✦
            </span>
            <span className="tabular-nums">{availableCredits.toLocaleString('id-ID')} Kredit</span>
            <span className="hidden text-[11px] font-normal text-[#64748B] sm:inline">
              (Rp{creditIdr})
            </span>
          </Link>

          {account && (
            <div className="flex items-center gap-2">
              <span
                title={account.email}
                className="flex size-8 items-center justify-center rounded-full bg-[#881337] font-body text-xs font-bold text-white shadow-xs"
              >
                {account.initial}
              </span>
              {logoutAction && (
                <form action={logoutAction} className="hidden sm:block">
                  <button
                    type="submit"
                    className="rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-xs font-semibold text-[#64748B] hover:bg-[#F8F9FA] hover:text-[#0F172A]"
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

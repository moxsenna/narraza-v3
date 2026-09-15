'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { CreditSummaryDisplayView } from '../../lib/frontend/credit-display';
import type { ShellAccountViewModel } from '../../lib/frontend/view-model';

export type TopNavProject = Readonly<{
  id: string;
  title: string;
  meta?: string;
}>;

export interface TopNavProps {
  account?: ShellAccountViewModel | null;
  credit?: CreditSummaryDisplayView | null;
  currentProject?: TopNavProject | null;
  allProjects?: readonly TopNavProject[];
  logoutAction?: () => Promise<void>;
  continuityScore?: number;
}

export function TopNav({
  account,
  credit,
  currentProject,
  allProjects = [],
  logoutAction,
  continuityScore = 100,
}: TopNavProps) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const projectId = currentProject?.id;
  const projectBase = projectId ? `/app/proyek/${encodeURIComponent(projectId)}` : null;

  // Credit calculation adhering to D6 (1 credit = Rp10 / MICRO_IDR_PER_CREDIT)
  const availableCredits = credit?.availableCredits ?? 0;
  const creditIdr = (availableCredits * 10).toLocaleString('id-ID');

  const modeTabs = projectBase
    ? [
        { label: 'Ruang Tulis', href: `${projectBase}/tulis` },
        { label: 'Rencana Bab', href: `${projectBase}/outline` },
        { label: 'Alkitab Cerita', href: `${projectBase}/fondasi` },
        { label: 'Paket Publish', href: `${projectBase}/publish` },
      ]
    : [
        { label: 'Ruang Tulis', href: '/app' },
        { label: 'Rencana Bab', href: '/app' },
        { label: 'Alkitab Cerita', href: '/app' },
        { label: 'Paket Publish', href: '/app' },
      ];

  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-[#E2E8F0] bg-white text-[#0F172A]">
      <div className="mx-auto flex h-[60px] w-full max-w-[1600px] items-center justify-between px-3 sm:px-6">
        {/* Left Section: Brand & Novel Switcher */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/app" className="group flex items-center gap-2">
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

          <div className="hidden h-5 w-[1px] bg-[#E2E8F0] md:block" aria-hidden="true" />

          {/* Novel Switcher Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-expanded={dropdownOpen}
              className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8F9FA] px-2.5 py-1.5 text-xs font-semibold text-[#0F172A] transition-colors hover:border-[#CBD5E1] hover:bg-white"
            >
              <span className="size-2.5 rounded-[3px] bg-[#881337]" aria-hidden="true" />
              <span className="max-w-[140px] truncate sm:max-w-[200px]">
                {currentProject?.title ?? 'Pilih Proyek'}
              </span>
              {currentProject?.meta && (
                <span className="hidden text-[#64748B] sm:inline">• {currentProject.meta}</span>
              )}
              <span className="text-[10px] text-[#94A3B8]">▾</span>
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute top-full left-0 z-20 mt-1.5 w-64 rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-lg">
                  <div className="px-2.5 py-1.5 text-[11px] font-bold text-[#64748B]">
                    PROYEK NOVEL
                  </div>
                  <div className="max-h-60 space-y-0.5 overflow-y-auto">
                    {allProjects.length === 0 ? (
                      <div className="px-2.5 py-2 text-xs text-[#94A3B8]">
                        Belum ada proyek lain
                      </div>
                    ) : (
                      allProjects.map((p) => (
                        <Link
                          key={p.id}
                          href={`/app/proyek/${p.id}`}
                          onClick={() => setDropdownOpen(false)}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                            p.id === currentProject?.id
                              ? 'bg-[#FFE4E6] font-bold text-[#881337]'
                              : 'text-[#334155] hover:bg-[#F8F9FA]'
                          }`}
                        >
                          <span className="size-2 shrink-0 rounded-full bg-[#881337]" />
                          <span className="truncate">{p.title}</span>
                        </Link>
                      ))
                    )}
                  </div>
                  <div className="mt-1 border-t border-[#F1F5F9] pt-1">
                    <Link
                      href="/app/proyek/baru"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#881337] hover:bg-[#FFE4E6]"
                    >
                      <span>+</span>
                      <span>Mulai Proyek Baru</span>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Mode Tabs */}
        <nav
          aria-label="Navigasi mode produksi"
          className="hidden items-center gap-1 rounded-[10px] bg-[#F1F5F9] p-1 lg:flex"
        >
          {modeTabs.map((tab) => {
            const isActive =
              pathname === tab.href || (tab.href !== '/app' && pathname.startsWith(tab.href));

            return (
              <Link
                key={tab.label}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-[7px] px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'border border-[#E2E8F0] bg-white font-bold text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Status Koherensi, Credit Pill, Avatar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Continuity Health Badge */}
          <div
            title="Pemeriksaan alur deterministik & non-AI validator"
            className="hidden items-center gap-1.5 rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#047857] md:flex"
          >
            <span className="size-1.5 rounded-full bg-[#059669]" aria-hidden="true" />
            <span>Alur Konsisten ({continuityScore}%)</span>
          </div>

          {/* Credit Balance Pill (D6: Rp10 / kredit) */}
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

          {/* User Avatar & Logout */}
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

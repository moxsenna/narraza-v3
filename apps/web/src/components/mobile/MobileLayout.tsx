'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BottomSheet } from '../composites/BottomSheet';

export interface MobileLayoutProps {
  children: ReactNode;
  projectId?: string;
  projectTitle?: string;
  authorInitials?: string;
  availableCredits?: number;
  stickyAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    secondaryLabel?: string;
    onSecondaryClick?: () => void;
  } | null;
  inspectorContent?: ReactNode;
}

export function MobileLayout({
  children,
  projectId,
  projectTitle = 'Serpihan Janji',
  authorInitials = 'DN',
  availableCredits = 240,
  stickyAction,
  inspectorContent,
}: MobileLayoutProps) {
  const pathname = usePathname();
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const base = projectId ? `/app/proyek/${encodeURIComponent(projectId)}` : null;

  // Credit calculation adhering to D6 (1 credit = Rp10)
  const creditIdr = (availableCredits * 10).toLocaleString('id-ID');

  const navItems = [
    {
      id: 'home',
      label: 'Beranda',
      href: base ?? '/app',
      icon: (active: boolean) => (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      id: 'plan',
      label: 'Rencana',
      href: base ? `${base}/outline` : '/app',
      icon: (active: boolean) => (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <line x1="6" x2="6" y1="3" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      ),
    },
    {
      id: 'write',
      label: 'Tulis',
      href: base ? `${base}/tulis` : '/app',
      icon: (active: boolean) => (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <line x1="16" x2="2" y1="8" y2="22" />
          <line x1="17.5" x2="9" y1="15" y2="15" />
        </svg>
      ),
    },
    {
      id: 'check',
      label: 'Cek',
      onClick: () => setInspectorOpen(true),
      icon: (active: boolean) => (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      ),
    },
    {
      id: 'publish',
      label: 'Publish',
      href: base ? `${base}/publish` : '/app',
      icon: (active: boolean) => (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA] text-[#0F172A]">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E2E8F0] bg-white px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#FFE4E6] text-xs font-bold text-[#881337] ring-1 ring-[#BE123C]/30">
            {authorInitials}
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#BE123C] uppercase tracking-wide">
              {projectTitle}
            </p>
            <p className="font-heading text-xs font-bold text-[#0F172A]">Ruang Penulisan</p>
          </div>
        </div>

        <Link
          href="/app/kredit"
          aria-label={`Saldo kredit: ${availableCredits} kredit (Rp${creditIdr})`}
          className="flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8F9FA] px-2.5 py-1 text-xs font-bold text-[#0F172A] shadow-2xs hover:border-[#BE123C]"
        >
          <span className="text-[#BE123C]">✦</span>
          <span>{availableCredits}</span>
          <span className="text-[10px] text-[#64748B] font-normal">Kredit</span>
        </Link>
      </header>

      {/* Main Content Area with bottom padding to clear sticky actions and capsule */}
      <main className="flex-1 pb-32">{children}</main>

      {/* Sticky Primary Action Bar (if specified) */}
      {stickyAction && (
        <div className="fixed inset-x-0 bottom-20 z-40 px-4">
          <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-[#FDA4AF] bg-[#881337] p-2 text-white shadow-lg">
            {stickyAction.href ? (
              <Link
                href={stickyAction.href}
                className="flex flex-1 items-center justify-center rounded-xl bg-white py-2.5 text-xs font-bold text-[#881337] shadow-xs active:scale-[0.98]"
              >
                {stickyAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={stickyAction.onClick}
                className="flex flex-1 items-center justify-center rounded-xl bg-white py-2.5 text-xs font-bold text-[#881337] shadow-xs active:scale-[0.98]"
              >
                {stickyAction.label}
              </button>
            )}

            {stickyAction.secondaryLabel && (
              <button
                type="button"
                onClick={stickyAction.onSecondaryClick ?? (() => setInspectorOpen(true))}
                className="rounded-xl border border-[#FDA4AF] px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                {stickyAction.secondaryLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation Capsule (5 Tabs) */}
      <div className="fixed inset-x-0 bottom-2 z-50 px-3 pb-[env(safe-area-inset-bottom)]">
        <nav
          aria-label="Navigasi ponsel"
          className="mx-auto flex h-[58px] max-w-sm items-center justify-around rounded-[29px] border border-[#E2E8F0] bg-white/95 px-1.5 py-1 shadow-[0_8px_24px_rgba(15,23,42,0.1)] backdrop-blur-md"
        >
          {navItems.map((item) => {
            const isActive =
              item.href &&
              (pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href)));

            const content = (
              <div
                className={`flex flex-col items-center justify-center gap-0.5 rounded-[20px] px-3 py-1 transition-colors ${
                  isActive ? 'bg-[#FFE4E6] text-[#881337]' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {item.icon(Boolean(isActive))}
                <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
              </div>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex-1 text-center"
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="flex-1 text-center"
              >
                {content}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Inspector Bottom-Sheet */}
      <BottomSheet
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        title="Narra Story Intelligence"
        description="Pemeriksaan alur, kontinuitas rahasia, dan suara karakter."
      >
        {inspectorContent ? (
          inspectorContent
        ) : (
          <div className="space-y-4">
            {/* Continuity Health */}
            <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-3 text-xs">
              <div className="flex items-center justify-between font-bold text-[#047857]">
                <span>Status Kontinuitas Alur</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[#059669]">100% Lolos</span>
              </div>
              <p className="mt-1 text-[11px] text-[#065F46]">
                Semua beat dan rahasia cerita aman pada posisinya tanpa deteksi plot hole.
              </p>
            </div>

            {/* Quick Character Guidance */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-[#64748B] uppercase">
                Fakta Tokoh di Adegan
              </p>
              <div className="rounded-lg border border-[#E2E8F0] p-2.5 text-xs">
                <p className="font-bold text-[#0F172A]">Maya</p>
                <p className="text-[#64748B]">Sopan, tertekan, waspada • Menjaga rahasia peti</p>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] p-2.5 text-xs">
                <p className="font-bold text-[#0F172A]">Bu Ratna</p>
                <p className="text-[#64748B]">
                  Dingin, cermat, penuh selidik • Mencurigai gerak-gerik Maya
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="w-full rounded-xl bg-[#881337] py-2.5 text-xs font-bold text-white shadow-xs"
            >
              Tutup Panel
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

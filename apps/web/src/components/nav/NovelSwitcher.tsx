'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { TopNavProject } from './topnav-types';

export function NovelSwitcher({
  current,
  all,
}: {
  current: TopNavProject | null;
  all: readonly TopNavProject[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8F9FA] px-2.5 py-1.5 text-xs font-semibold text-[#0F172A] transition-colors hover:border-[#CBD5E1] hover:bg-white"
      >
        <span className="size-2.5 rounded-[3px] bg-[#881337]" aria-hidden="true" />
        <span className="max-w-[140px] truncate sm:max-w-[200px]">
          {current?.title ?? 'Pilih Proyek'}
        </span>
        {current?.meta && <span className="hidden text-[#64748B] sm:inline">• {current.meta}</span>}
        <span className="text-[10px] text-[#94A3B8]" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="listbox"
            aria-label="Pilih proyek novel"
            className="absolute top-full left-0 z-20 mt-1.5 w-64 rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-lg"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-bold text-[#64748B]">PROYEK NOVEL</div>
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {all.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-[#94A3B8]">Belum ada proyek lain</div>
              ) : (
                all.map((p) => (
                  <Link
                    key={p.id}
                    href={`/app/proyek/${p.id}`}
                    onClick={() => setOpen(false)}
                    aria-selected={p.id === current?.id}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                      p.id === current?.id
                        ? 'bg-[#FFE4E6] font-bold text-[#881337]'
                        : 'text-[#334155] hover:bg-[#F8F9FA]'
                    }`}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full bg-[#881337]"
                      aria-hidden="true"
                    />
                    <span className="truncate">{p.title}</span>
                  </Link>
                ))
              )}
            </div>
            <div className="mt-1 border-t border-[#F1F5F9] pt-1">
              <Link
                href="/app/proyek/baru"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#881337] hover:bg-[#FFE4E6]"
              >
                <span aria-hidden="true">+</span>
                <span>Mulai Proyek Baru</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

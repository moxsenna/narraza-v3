'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { TopNavMoreItem } from './topnav-types';

export function MoreMenu({ items }: { items: readonly TopNavMoreItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-[7px] px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-primary"
      >
        Lainnya ▾
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label="Navigasi lainnya"
            className="absolute top-full right-0 z-20 mt-1.5 w-60 rounded-xl border border-default bg-white p-1.5 shadow-lg"
          >
            {items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2.5 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-canvas hover:text-brand-600"
                >
                  {item.label}
                </Link>
              ) : (
                <div
                  key={item.label}
                  role="menuitem"
                  aria-disabled="true"
                  title={item.reason}
                  className="rounded-lg px-2.5 py-2 text-muted"
                >
                  <span className="block text-xs font-semibold">{item.label}</span>
                  {item.reason && <span className="mt-0.5 block text-[11px]">{item.reason}</span>}
                </div>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

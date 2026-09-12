'use client';

import { useState } from 'react';
import { MobileMoreSheet } from './MobileMoreSheet';
import { MobileNavIcon } from './MobileNavIcon';

type Context = { kind: 'global' } | { kind: 'project'; projectId: string };

export function MobileMoreControl({ context }: { context: Context }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="group flex min-h-11 min-w-11 flex-col items-center justify-start gap-[3px] px-1 text-ink-300"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="flex h-[30px] w-11 items-center justify-center rounded-pill transition-colors group-aria-[expanded=true]:bg-brand-100 group-aria-[expanded=true]:text-brand-700">
          <MobileNavIcon name="more" />
        </span>
        <span className="text-[10px] leading-none font-semibold group-aria-[expanded=true]:font-bold group-aria-[expanded=true]:text-brand-800">
          Lainnya
        </span>
      </button>
      <MobileMoreSheet open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}

'use client';

import { useState } from 'react';
import { MobileMoreSheet } from './MobileMoreSheet';

type Context = { kind: 'global' } | { kind: 'project'; projectId: string };

export function MobileMoreControl({ context }: { context: Context }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="min-h-11 min-w-11 px-2 text-xs font-semibold"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Lainnya
      </button>
      <MobileMoreSheet open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}

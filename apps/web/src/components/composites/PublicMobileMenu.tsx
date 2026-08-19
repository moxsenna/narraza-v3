'use client';

import { useEffect, useRef, useState } from 'react';
import { IconButton, LinkButton } from '../primitives';

export function PublicMobileMenu({
  links,
}: {
  links: readonly (readonly [label: string, href: string])[];
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previouslyFocused.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('a')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const cancel = (event: Event) => {
      event.preventDefault();
      setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const close = () => {
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    };

    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('keydown', keydown);
    dialog.addEventListener('close', close);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('keydown', keydown);
      dialog.removeEventListener('close', close);
    };
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="min-h-11 rounded-md border border-default bg-surface px-3 font-semibold text-primary"
        onClick={() => setOpen(true)}
      >
        Menu
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Navigasi utama mobile"
        className="m-0 ml-auto min-h-dvh w-[min(320px,calc(100%-48px))] max-w-none bg-surface p-0 text-primary backdrop:bg-brand-ink/40"
      >
        <div className="flex justify-end border-b border-default p-3">
          <IconButton aria-label="Tutup menu" onClick={() => setOpen(false)}>
            ×
          </IconButton>
        </div>
        <nav aria-label="Navigasi utama mobile" className="flex flex-col gap-2 p-4">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="flex min-h-11 items-center rounded-md px-3 font-semibold hover:bg-brand-soft"
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <LinkButton href="/masuk" variant="secondary" onClick={() => setOpen(false)}>
            Masuk
          </LinkButton>
          <LinkButton href="/daftar" onClick={() => setOpen(false)}>
            Mulai gratis
          </LinkButton>
        </nav>
      </dialog>
    </>
  );
}

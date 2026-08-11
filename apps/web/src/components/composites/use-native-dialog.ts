'use client';

import { useEffect, useRef, type RefObject } from 'react';

export function useNativeDialog({
  open,
  onOpenChange,
  initialFocusRef,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): RefObject<HTMLDialogElement | null> {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  openRef.current = open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previouslyFocused.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      queueMicrotask(() => {
        (
          initialFocusRef?.current ??
          dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ??
          dialog
        ).focus();
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      if (openRef.current) onOpenChange(false);
    };
    const onClose = () => {
      if (openRef.current) onOpenChange(false);
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    };
  }, [onOpenChange]);

  return dialogRef;
}

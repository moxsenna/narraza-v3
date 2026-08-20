'use client';

import { useEffect, useRef, type RefObject } from 'react';

type CloseCycle = {
  generation: number;
  focusOrigin: HTMLElement | null;
  focusRestored: boolean;
};

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
  const onOpenChangeRef = useRef(onOpenChange);
  const generation = useRef(0);
  const activeGeneration = useRef<number | null>(null);
  const requestedCloseGeneration = useRef<number | null>(null);
  const pendingProgrammaticCloses = useRef<CloseCycle[]>([]);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  openRef.current = open;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      const openingGeneration = ++generation.current;
      activeGeneration.current = openingGeneration;
      requestedCloseGeneration.current = null;
      previouslyFocused.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      queueMicrotask(() => {
        if (
          dialogRef.current !== dialog ||
          activeGeneration.current !== openingGeneration ||
          !dialog.open
        ) {
          return;
        }
        (
          initialFocusRef?.current ??
          dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ??
          dialog
        ).focus();
      });
    } else if (!open && dialog.open) {
      const closingGeneration = activeGeneration.current;
      if (closingGeneration !== null) {
        previouslyFocused.current?.focus();
        pendingProgrammaticCloses.current.push({
          generation: closingGeneration,
          focusOrigin: previouslyFocused.current,
          focusRestored: true,
        });
      }
      activeGeneration.current = null;
      requestedCloseGeneration.current = null;
      previouslyFocused.current = null;
      dialog.close();
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      const currentGeneration = activeGeneration.current;
      if (
        openRef.current &&
        currentGeneration !== null &&
        requestedCloseGeneration.current !== currentGeneration
      ) {
        requestedCloseGeneration.current = currentGeneration;
        onOpenChangeRef.current(false);
      }
    };
    const onClose = () => {
      const programmaticCycle = pendingProgrammaticCloses.current.shift();
      if (programmaticCycle) {
        if (!programmaticCycle.focusRestored) programmaticCycle.focusOrigin?.focus();
        return;
      }

      const closingGeneration = activeGeneration.current;
      if (closingGeneration === null) return;

      const focusOrigin = previouslyFocused.current;
      activeGeneration.current = null;
      requestedCloseGeneration.current = null;
      previouslyFocused.current = null;
      if (openRef.current) onOpenChangeRef.current(false);
      focusOrigin?.focus();
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    };
  }, []);

  return dialogRef;
}

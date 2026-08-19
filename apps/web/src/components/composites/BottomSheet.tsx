'use client';

import { useId, type ReactNode } from 'react';
import { IconButton } from '../primitives';
import { useNativeDialog } from './use-native-dialog';

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useNativeDialog({ open, onOpenChange });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      className="mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-xl bg-surface p-0 text-primary shadow-lg md:m-auto md:w-[min(560px,calc(100%-32px))] md:rounded-xl"
    >
      <div className="flex max-h-[85dvh] flex-col pb-[env(safe-area-inset-bottom)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-default p-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-secondary">
              {description}
            </p>
          </div>
          <IconButton
            aria-label="Tutup"
            data-dialog-initial-focus
            onClick={() => onOpenChange(false)}
          >
            ×
          </IconButton>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}

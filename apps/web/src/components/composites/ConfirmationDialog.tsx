'use client';

import { useId, useRef } from 'react';
import { Button, IconButton } from '../primitives';
import { useNativeDialog } from './use-native-dialog';

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Batal',
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm(): void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ref = useNativeDialog({ open, onOpenChange, initialFocusRef: cancelRef });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      className="m-auto w-[min(560px,calc(100%-32px))] rounded-xl bg-surface p-0 text-primary shadow-lg"
    >
      <div className="p-6">
        <div className="flex justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <IconButton aria-label="Tutup" onClick={() => onOpenChange(false)}>
            ×
          </IconButton>
        </div>
        <p id={descriptionId} className="mt-3 text-secondary">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

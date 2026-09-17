'use client';

import { useState } from 'react';

import { Button } from '../primitives';

/** Clipboard copy without navigation. Falls back to a message when denied. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    setDone(false);
    setFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="secondary" onClick={copy}>
        {done ? 'Tersalin ✓' : label}
      </Button>
      {failed && (
        <span role="alert" className="text-xs font-semibold text-status-danger">
          Penyalinan ditolak browser. Salin manual dari teks di bawah.
        </span>
      )}
    </span>
  );
}

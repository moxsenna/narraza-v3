'use client';

import { useState } from 'react';
import { BottomSheet } from '../../../../../components/composites/BottomSheet';

const signalLabels = ['Ide utama', 'Tokoh', 'Konflik', 'Suasana', 'Rahasia', 'Arah akhir'] as const;

export function SignalPanel({ signalCount }: { signalCount: number }) {
  const boundedCount = Math.min(6, Math.max(0, signalCount));

  return (
    <div aria-label="Sinyal cerita" className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-primary">Sinyal cerita</h2>
          <span className="text-xs font-bold text-brand-strong">{boundedCount} dari 6</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-soft"
          role="progressbar"
          aria-label="Sinyal cerita terkumpul"
          aria-valuemin={0}
          aria-valuemax={6}
          aria-valuenow={boundedCount}
        >
          <div
            className="h-full rounded-pill bg-brand-strong"
            style={{ width: `${(boundedCount / 6) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          Jumlah ini mengikuti jawaban yang sudah kamu simpan. Penangkapan isi otomatis belum
          tersedia.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {signalLabels.map((label, index) => {
          const collected = index < boundedCount;
          return (
            <div key={label} className="rounded-lg border border-default bg-surface px-3 py-3">
              <p className="text-[11px] font-bold tracking-wide text-muted">
                {label.toUpperCase()}
              </p>
              <p
                className={`mt-1 text-sm ${collected ? 'font-semibold text-primary' : 'text-muted'}`}
              >
                {collected ? 'Ada jawaban tersimpan' : 'Belum ada jawaban'}
              </p>
            </div>
          );
        })}
      </div>

      <p className="rounded-lg bg-brand-soft px-3 py-3 text-xs leading-5 text-brand-ink">
        Semua sinyal masih draft. Cerita resmi baru berubah setelah kamu meninjau dan mengunci
        fondasi.
      </p>
    </div>
  );
}

export function StorySignalsSheet({ signalCount }: { signalCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-pill border border-default bg-brand-soft px-3 text-xs font-bold text-brand-ink lg:hidden"
      >
        Sinyal {signalCount}/6
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Sinyal cerita"
        description="Ringkasan jawaban yang sudah tersimpan."
      >
        <SignalPanel signalCount={signalCount} />
      </BottomSheet>
    </>
  );
}

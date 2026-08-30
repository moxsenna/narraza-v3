'use client';

import type { ReactNode } from 'react';

export type CreditQuoteCardState = 'quoted' | 'expired' | 'error' | 'insufficient';

/**
 * Generic credit quote card for every D4 paid action (W3.5-A).
 * Presentational only: the mounting action owns its confirm/requote forms
 * through the footer slot. Server-derived numbers only; no micro-IDR values,
 * no quote internals, no hashes.
 */
export function CreditQuoteCard({
  actionTitle,
  state,
  maxCredits,
  availableCredits,
  message,
  footer,
}: {
  actionTitle: string;
  state: CreditQuoteCardState;
  maxCredits: number;
  availableCredits: number;
  message?: string | undefined;
  footer?: ReactNode | undefined;
}) {
  const insufficient = state === 'insufficient' || availableCredits < maxCredits;

  return (
    <section
      aria-label={`Konfirmasi ${actionTitle}`}
      className="rounded-2xl border border-border-default bg-surface p-5 sm:p-6"
      data-testid="credit-quote-card"
    >
      <h3 className="text-base font-bold text-text-primary">Konfirmasi sebelum mulai</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {actionTitle} akan dimulai setelah kamu konfirmasi. Kredit ditahan sesuai biaya maksimal di
        bawah.
      </p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-[0.08em] text-text-muted">BIAYA MAKSIMAL</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-text-primary">
            {maxCredits}
            <span className="ml-1 text-sm font-semibold text-text-secondary">kredit</span>
          </p>
        </div>
        <p className="pb-1 text-xs font-semibold text-text-muted">Penawaran berlaku 10 menit</p>
      </div>

      <dl className="mt-4 space-y-1 border-t border-border-default pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Saldo tersedia</dt>
          <dd className="font-bold tabular-nums text-text-primary">{availableCredits} kredit</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Setelah ditahan</dt>
          <dd className="font-bold tabular-nums text-text-primary">
            {Math.max(availableCredits - maxCredits, 0)} kredit
          </dd>
        </div>
      </dl>

      {state === 'expired' && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-status-warning-soft p-3 text-sm font-semibold text-status-warning"
        >
          {message ?? 'Penawaran sudah kedaluwarsa. Minta penawaran baru untuk melanjutkan.'}
        </p>
      )}
      {state === 'insufficient' && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-status-warning-soft p-3 text-sm font-semibold text-status-warning"
        >
          {message ?? 'Saldo kreditmu belum cukup untuk proses ini.'}
        </p>
      )}
      {state === 'error' && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-status-danger-soft p-3 text-sm font-semibold text-status-danger"
        >
          {message ?? 'Proses tidak dapat dilanjutkan. Coba lagi sebentar.'}
        </p>
      )}
      {insufficient && state === 'quoted' && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-status-warning-soft p-3 text-sm font-semibold text-status-warning"
        >
          Saldo kreditmu belum cukup untuk proses ini.
        </p>
      )}

      {footer && <div className="mt-5">{footer}</div>}
    </section>
  );
}

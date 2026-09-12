import Link from 'next/link';

import { GlobalAppShell } from '../../../components/composites/GlobalAppShell';
import { getMyCreditSummaryView } from '../../../server/domain/generation';

export const dynamic = 'force-dynamic';

const SUMMARY_CARDS = [
  {
    key: 'available',
    title: 'Kredit tersedia',
    hint: 'Dapat dipakai untuk aksi berbayar.',
  },
  {
    key: 'held',
    title: 'Kredit ditahan',
    hint: 'Ditahan untuk proses yang sedang berjalan.',
  },
  {
    key: 'reconciling',
    title: 'Sedang dicocokkan',
    hint: 'Masih dicocokkan setelah proses berakhir.',
  },
] as const;

export default async function KreditPage() {
  const credit = await getMyCreditSummaryView();
  const values: Record<(typeof SUMMARY_CARDS)[number]['key'], number> = {
    available: credit?.availableCredits ?? 0,
    held: credit?.heldCredits ?? 0,
    reconciling: credit?.reconcilingCredits ?? 0,
  };

  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="rounded-2xl border border-border-default bg-surface p-6 sm:p-8">
          <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">AKUN</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
            Kredit &amp; penggunaan
          </h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            Pantau kredit yang dapat dipakai, sedang ditahan, dan masih dicocokkan dari satu sumber
            yang sama dengan indikator di kepala halaman.
          </p>

          {credit?.lowBalance && (
            <div
              className="mt-6 rounded-xl border border-status-warning bg-status-warning-soft p-4"
              data-testid="credit-low-balance"
            >
              <p className="text-sm font-bold leading-6 text-status-warning">
                Saldo kreditmu rendah
              </p>
              <p className="mt-1 text-sm leading-6 text-status-warning">
                Aksi berbayar berikutnya mungkin tidak dapat dikonfirmasi sampai saldomu bertambah.
              </p>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="credit-summary">
            {SUMMARY_CARDS.map((card) => (
              <div
                key={card.key}
                className="rounded-xl border border-border-default bg-surface p-4"
                data-testid={`credit-${card.key}`}
              >
                <dt className="text-xs font-extrabold tracking-[0.08em] text-text-muted">
                  {card.title.toUpperCase()}
                </dt>
                <dd className="mt-2 text-3xl font-extrabold tabular-nums text-text-primary">
                  {values[card.key]}
                </dd>
                <p className="mt-1 text-xs leading-5 text-text-secondary">{card.hint}</p>
              </div>
            ))}
          </dl>

          {credit && credit.heldCredits > 0 && (
            <p
              className="mt-4 text-sm leading-6 text-text-secondary"
              data-testid="credit-held-context"
            >
              Ada kredit ditahan untuk proses yang sedang berjalan. Nilainya menyesuaikan saat
              proses selesai.
            </p>
          )}
          {credit && credit.reconcilingCredits > 0 && (
            <p
              className="mt-2 text-sm leading-6 text-text-secondary"
              data-testid="credit-reconciling-context"
            >
              Ada kredit yang sedang dicocokkan dengan hasil proses yang baru berakhir. Nilai
              akhirnya akan tampil setelah pencocokan selesai.
            </p>
          )}

          <section className="mt-8 border-t border-border-default pt-6">
            <h2 className="text-base font-bold text-text-primary">Riwayat penggunaan</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Riwayat pemakaian akan tersedia setelah ada proses berbayar yang selesai di akunmu.
            </p>
          </section>

          <Link
            href="/app"
            className="mt-8 inline-flex min-h-11 items-center rounded-xl border border-border-active bg-surface px-5 text-sm font-bold text-action-primary"
          >
            Kembali ke dashboard
          </Link>
        </section>
      </main>
    </GlobalAppShell>
  );
}

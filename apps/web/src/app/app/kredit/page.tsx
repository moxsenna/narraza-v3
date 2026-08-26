import Link from 'next/link';

import { GlobalAppShell } from '../../../components/composites/GlobalAppShell';

export default function KreditPage() {
  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="rounded-2xl border border-border-default bg-surface p-6 sm:p-8">
          <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">AKUN</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
            Kredit & penggunaan
          </h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            Informasi kredit belum tersedia di akunmu saat ini.
          </p>
          <div className="mt-6 rounded-xl border border-border-default bg-status-info-soft p-4">
            <p className="text-sm leading-6 text-status-info">
              Kamu tidak perlu melakukan apa pun untuk sekarang.
            </p>
          </div>
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

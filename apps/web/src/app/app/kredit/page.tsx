import Link from 'next/link';

import { CapabilityNotice } from '../../../components/composites/CapabilityNotice';
import { GlobalAppShell } from '../../../components/composites/GlobalAppShell';
import { PageHeader } from '../../../components/composites/PageHeader';
import { Card } from '../../../components/primitives';
import { CAPABILITIES } from '../../../lib/frontend/capabilities';

const summaries = [
  {
    title: 'Kredit tersedia',
    description: 'Jumlah yang dapat dipakai akan muncul setelah ringkasan akun tersedia.',
  },
  {
    title: 'Kredit ditahan',
    description: 'Kredit untuk proses yang masih berjalan akan dipisahkan dengan jelas.',
  },
  {
    title: 'Sedang dicocokkan',
    description: 'Pemakaian yang belum selesai dicocokkan tidak dianggap sebagai saldo tersedia.',
  },
] as const;

export default function KreditPage() {
  const capability = CAPABILITIES['app.credit.view'];

  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <PageHeader
          eyebrow="AKUN"
          title="Kredit & penggunaan"
          description="Pantau kredit yang dapat dipakai, sedang ditahan, dan masih dicocokkan tanpa angka perkiraan palsu."
        />
        <div className="mt-6">
          <CapabilityNotice
            notice={{ capabilityKey: capability.key, reasonCode: 'BACKEND_NOT_AVAILABLE' }}
          />
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Ringkasan kredit">
          {summaries.map((summary) => (
            <Card key={summary.title}>
              <p className="text-sm font-bold text-primary">{summary.title}</p>
              <p className="mt-3 text-sm leading-6 text-secondary">{summary.description}</p>
              <p
                className="mt-5 text-2xl font-bold text-muted"
                aria-label={`${summary.title} belum tersedia`}
              >
                —
              </p>
            </Card>
          ))}
        </section>

        <Card className="mt-6">
          <h2 className="text-lg font-bold text-primary">Riwayat penggunaan</h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Informasi kredit belum tersedia di akunmu saat ini.
          </p>
          <div className="mt-5 rounded-md border border-default bg-surface-soft p-4">
            <p className="text-sm leading-6 text-secondary">
              Kamu tidak perlu melakukan apa pun untuk sekarang.
            </p>
          </div>
        </Card>

        <Link
          href="/app"
          className="mt-8 inline-flex min-h-11 items-center rounded-md border border-active bg-surface px-5 text-sm font-bold text-brand-strong"
        >
          Kembali ke dashboard
        </Link>
      </main>
    </GlobalAppShell>
  );
}

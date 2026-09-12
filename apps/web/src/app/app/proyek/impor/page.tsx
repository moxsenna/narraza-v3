import Link from 'next/link';

import { CapabilityNotice } from '../../../../components/composites/CapabilityNotice';
import { GlobalAppShell } from '../../../../components/composites/GlobalAppShell';
import { PageHeader } from '../../../../components/composites/PageHeader';
import { Card } from '../../../../components/primitives';
import { CAPABILITIES } from '../../../../lib/frontend/capabilities';

export default function ImporProyekPage() {
  const capability = CAPABILITIES['app.project.import'];

  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <PageHeader
          eyebrow="BUAT PROYEK"
          title="Mulai dari draft yang sudah ada"
          description="Jalur ini direncanakan untuk membantu menata draft lama tanpa mengubahnya diam-diam."
        />
        <div className="mt-6">
          <CapabilityNotice
            notice={{ capabilityKey: capability.key, reasonCode: 'IMPORT_OUT_OF_SCOPE' }}
          />
        </div>
        <Card className="mt-6">
          <h2 className="text-lg font-bold text-primary">Draftmu tetap aman</h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Impor draft belum tersedia pada rilis ini. Halaman ini tidak menerima berkas, tidak
            menganalisis cerita, dan tidak menyimpan perubahan.
          </p>
          <Link
            href="/app/proyek/baru"
            className="mt-6 inline-flex min-h-11 items-center rounded-md border border-active bg-surface px-5 text-sm font-bold text-brand-strong"
          >
            Pilih cara lain membuat proyek
          </Link>
        </Card>
      </main>
    </GlobalAppShell>
  );
}

import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../components/composites/CapabilityNotice';
import { PageHeader } from '../../../../../components/composites/PageHeader';
import { Badge, Button, Card } from '../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../lib/frontend/capabilities';
import { getMyProject } from '../../../../../server/domain/queries';

export default async function KonsepPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const capability = CAPABILITIES['project.concept.choose'];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        eyebrow="PERSIAPAN"
        title="Pilih Konsep Cerita"
        description={`${project.title} belum memiliki pilihan konsep yang bisa dipilih. Berikut bentuk pilihan yang akan tersedia setelah penyusunan konsep didukung.`}
      />
      <div className="mt-6">
        <CapabilityNotice
          notice={{ capabilityKey: capability.key, reasonCode: 'BACKEND_NOT_AVAILABLE' }}
        />
      </div>

      <section className="mt-8" aria-labelledby="concept-directions-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="concept-directions-title" className="text-xl font-bold text-primary">
              Tiga arah cerita
            </h2>
            <p className="mt-1 text-sm leading-6 text-secondary">
              Setiap kartu kelak memuat premis, konflik utama, daya tarik, dan suasana cerita.
            </p>
          </div>
          <Button disabled>{capability.primaryAction.label}</Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {['Arah pertama', 'Arah kedua', 'Arah ketiga'].map((label, index) => (
            <Card key={label} className="flex min-h-64 flex-col">
              <div className="flex items-center justify-between gap-3">
                <Badge tone="brand">Pilihan {index + 1}</Badge>
                <span className="text-xs font-semibold text-muted">Belum disusun</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-primary">{label}</h3>
              <p className="mt-3 text-sm leading-6 text-secondary">
                Isi konsep tidak dibuat sebelum proses penyusunan nyata tersedia.
              </p>
              <div className="mt-auto pt-6">
                <Button className="w-full" variant="secondary" disabled>
                  Pilih konsep ini
                </Button>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Pemilihan konsep belum tersedia. Fondasi ceritamu tidak akan berubah.
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

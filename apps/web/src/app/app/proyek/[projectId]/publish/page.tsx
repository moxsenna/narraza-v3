import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../components/composites/CapabilityNotice';
import { Badge, Button, Card } from '../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../lib/frontend/capabilities';
import { getMyProject } from '../../../../../server/domain/queries';

export const dynamic = 'force-dynamic';

export default async function ProjectPublishPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const capability = CAPABILITIES['project.publish.view'];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">PUBLIKASI</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Paket Publish Proyek</h1>
          <p className="mt-2 text-sm font-semibold text-secondary">{project.title}</p>
        </div>
        <Badge tone="info">Tidak mengubah cerita resmi</Badge>
      </header>

      <div className="mt-6">
        <CapabilityNotice
          notice={{ capabilityKey: capability.key, reasonCode: 'ACCEPTED_PROSE_REQUIRED' }}
        />
      </div>

      <section className="mt-8 grid gap-5 lg:grid-cols-2" aria-label="Status paket publish proyek">
        <Card>
          <h2 className="text-lg font-bold text-primary">Status per bab</h2>
          <p className="mt-3 text-sm leading-6 text-secondary">
            Status tulisan resmi dan artifact publish per bab belum tersedia dari read model proyek.
            Tidak ada status contoh yang ditampilkan.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-primary">Paket proyek</h2>
          <p className="mt-3 text-sm leading-6 text-secondary">
            Belum ada artifact publish yang dapat disalin atau diekspor untuk proyek ini.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button disabled>Salin paket</Button>
            <Button variant="secondary" disabled>
              Ekspor paket
            </Button>
          </div>
        </Card>
      </section>
    </main>
  );
}

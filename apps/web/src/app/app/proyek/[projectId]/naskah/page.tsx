import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../components/composites/CapabilityNotice';
import { Badge, Card } from '../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../lib/frontend/capabilities';
import { getMyProject } from '../../../../../server/domain/queries';

export const dynamic = 'force-dynamic';

export default async function ProjectNaskahPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const capability = CAPABILITIES['project.manuscript.view'];
  const outlineHref = `/app/proyek/${encodeURIComponent(projectId)}/outline`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">
            NASKAH PROYEK
          </p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Naskah</h1>
          <p className="mt-2 text-sm font-semibold text-secondary">{project.title}</p>
        </div>
        <Badge tone="warning">Belum tersedia</Badge>
      </header>

      <div className="mt-6">
        <CapabilityNotice
          notice={{
            capabilityKey: capability.key,
            reasonCode: 'ACCEPTED_PROSE_REQUIRED',
            nextAction: { label: 'Tinjau rencana cerita', href: outlineHref },
          }}
        />
      </div>

      <section className="mt-8" aria-labelledby="project-manuscript-empty">
        <Card className="py-12 text-center sm:py-16">
          <h2
            id="project-manuscript-empty"
            className="font-serif text-2xl font-semibold text-primary"
          >
            Belum ada naskah proyek yang dapat ditampilkan
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-secondary">
            Ringkasan bab dan tulisan resmi memerlukan read model naskah yang belum tersedia.
            Halaman ini tidak membuat contoh naskah atau memilih bab sebagai pengganti.
          </p>
          <Link
            href={outlineHref}
            className="mt-6 inline-flex min-h-11 items-center rounded-md border border-active bg-surface px-4 text-sm font-bold text-brand-strong"
          >
            Tinjau rencana cerita
          </Link>
        </Card>
      </section>
    </main>
  );
}

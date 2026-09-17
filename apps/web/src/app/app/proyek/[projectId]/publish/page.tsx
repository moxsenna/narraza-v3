import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '../../../../../components/primitives';
import { getMyProject, getProjectOutline } from '../../../../../server/domain/queries';

export const dynamic = 'force-dynamic';

export default async function ProjectPublishPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const outline = await getProjectOutline(projectId);
  const chapters = outline
    .filter((node) => node.entityType === 'chapter')
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const rows = chapters.map((chapter) => {
    const beats = outline.filter(
      (node) => node.entityType === 'beat' && node.parentId === chapter.id,
    );
    return {
      id: chapter.id,
      title: chapter.title,
      accepted: beats.filter((beat) => beat.acceptedProseVersionId).length,
      total: beats.length,
    };
  });
  const ready = rows.filter((row) => row.accepted > 0);

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

      <section className="mt-8" aria-label="Status paket publish proyek">
        {rows.length === 0 ? (
          <Card>
            <h2 className="text-lg font-bold text-primary">Belum ada bab</h2>
            <p className="mt-3 text-sm leading-6 text-secondary">
              Susun outline dulu. Paket publish dibuat per bab dari adegan yang sudah resmi.
            </p>
            <div className="mt-5">
              <Link
                href={`/app/proyek/${encodeURIComponent(projectId)}/outline`}
                className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-xs hover:bg-brand-700"
              >
                Ke Rencana Bab
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <Card key={row.id}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-primary">{row.title}</h2>
                  <Badge tone={row.accepted > 0 ? 'success' : 'warning'}>
                    {row.accepted}/{row.total} resmi
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-secondary">
                  {row.accepted > 0
                    ? 'Bab ini memiliki adegan resmi. Buka halaman bab untuk paketnya.'
                    : 'Belum ada adegan resmi pada bab ini.'}
                </p>
                <div className="mt-5">
                  <Link
                    href={`/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(row.id)}/publish`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-default bg-surface px-4 text-sm font-semibold text-secondary hover:bg-surface-soft"
                  >
                    Buka paket bab
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
        {ready.length === 0 && rows.length > 0 && (
          <p className="mt-4 text-sm leading-6 text-secondary">
            Belum ada artifact publish yang dapat disalin atau diekspor untuk proyek ini.
          </p>
        )}
      </section>
    </main>
  );
}

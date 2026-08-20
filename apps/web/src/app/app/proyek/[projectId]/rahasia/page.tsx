import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';
import { getUnitOfWork } from '../../../../../server/domain/uow';

export default async function RevealPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const { reveals, breadcrumbs } = await getUnitOfWork().execute((ports) =>
    ports.reveal.listByProject(projectId),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Jadwal Rahasia</h1>
      <p className="mt-2 text-sm text-text-muted">
        Pengungkapan rahasia yang akan terjadi di akhir cerita.
      </p>
      <section className="mt-8">
        <h2 className="font-bold">Poin Rahasia</h2>
        <ul className="mt-3 space-y-2">
          {reveals.length === 0 ? (
            <li className="text-sm text-text-muted">Belum ada rencana rahasia.</li>
          ) : (
            reveals.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-border-default bg-surface px-4 py-3 text-sm"
              >
                Fakta rahasia · Bab {r.targetSequence}
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="font-bold">Titik Pemicu</h2>
        <ul className="mt-3 space-y-2">
          {breadcrumbs.length === 0 ? (
            <li className="text-sm text-text-muted">Tidak ada pemicu tambahan.</li>
          ) : (
            breadcrumbs.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-border-default bg-surface px-4 py-3 text-sm"
              >
                Pengungkapan bab {b.sequence}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}

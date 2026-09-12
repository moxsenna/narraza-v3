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
  const breadcrumbsByReveal = new Map<string, number>();
  for (const breadcrumb of breadcrumbs)
    breadcrumbsByReveal.set(
      breadcrumb.revealId,
      (breadcrumbsByReveal.get(breadcrumb.revealId) ?? 0) + 1,
    );

  return (
    <main className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-6 sm:py-9">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-strong">
        ← {project.title}
      </Link>
      <p className="mt-4 text-xs font-extrabold tracking-[0.12em] text-brand-strong">PERENCANAAN</p>
      <h1 className="mt-2 text-3xl font-bold">Jadwal Rahasia</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
        Jadwal Rahasia menjaga kapan petunjuk boleh muncul dan kapan jawaban boleh terbuka.
      </p>
      <div className="mt-5 rounded-xl border border-default bg-brand-soft p-4 text-sm leading-6 text-brand-ink">
        <strong>Catatan pribadimu.</strong> Isi rahasia dijaga sebagai bahan perencanaan pemilik
        proyek dan tidak ditampilkan sebagai arahan mentah untuk penulisan.
      </div>

      <section className="mt-7" aria-labelledby="secret-timeline">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="secret-timeline" className="text-lg font-bold">
            Linimasa pengungkapan
          </h2>
          <span className="text-sm text-muted">{reveals.length} rahasia</span>
        </div>
        {reveals.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-default bg-surface p-8 text-center">
            <h3 className="font-bold">Belum ada jadwal rahasia</h3>
            <p className="mt-2 text-sm text-secondary">
              Rencana pengungkapan yang tersimpan akan muncul di linimasa ini.
            </p>
          </div>
        ) : (
          <ol className="relative mt-4 space-y-4 border-l-2 border-brand-200 pl-5">
            {reveals.map((reveal) => (
              <li
                key={reveal.id}
                className="relative rounded-xl border border-default bg-surface p-5 before:absolute before:-left-[27px] before:top-6 before:size-3 before:rounded-full before:bg-brand-strong"
              >
                <p className="text-xs font-bold tracking-wide text-brand-strong">
                  TARGET BAB {reveal.targetSequence}
                </p>
                <h3 className="mt-2 font-bold text-primary">Pengungkapan utama</h3>
                <p className="mt-2 text-sm text-secondary">
                  {breadcrumbsByReveal.get(reveal.id) ?? 0} petunjuk tersimpan sebelum jawaban
                  dibuka.
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

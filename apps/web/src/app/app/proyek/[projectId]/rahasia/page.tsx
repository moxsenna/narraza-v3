import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';
import { getUnitOfWork } from '../../../../../server/domain/uow';

export default async function RevealPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
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
      <h1 className="mt-4 font-serif text-3xl font-semibold">Jadwal rahasia</h1>
      <p className="mt-2 text-sm text-[#76656d]">
        Reveal + breadcrumbs (author_private). Truth tidak pernah ke writer packet.
      </p>
      <section className="mt-8">
        <h2 className="font-bold">Reveal</h2>
        <ul className="mt-3 space-y-2">
          {reveals.length === 0 ? (
            <li className="text-sm text-[#76656d]">Belum ada reveal.</li>
          ) : (
            reveals.map((r) => (
              <li key={r.id} className="rounded-xl border border-[#e8dce1] bg-white px-4 py-3 text-sm">
                fact {r.factId.slice(0, 8)}… · seq {r.targetSequence}
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="font-bold">Breadcrumbs</h2>
        <ul className="mt-3 space-y-2">
          {breadcrumbs.length === 0 ? (
            <li className="text-sm text-[#76656d]">Belum ada breadcrumb.</li>
          ) : (
            breadcrumbs.map((b) => (
              <li key={b.id} className="rounded-xl border border-[#e8dce1] bg-white px-4 py-3 text-sm">
                reveal {b.revealId.slice(0, 8)}… · seq {b.sequence}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}

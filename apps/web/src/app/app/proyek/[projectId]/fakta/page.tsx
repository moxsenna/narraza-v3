import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';
import { getUnitOfWork } from '../../../../../server/domain/uow';

export default async function FactPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const facts = await getUnitOfWork().execute((ports) => ports.fact.listByProject(projectId));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Fakta Cerita</h1>
      <p className="mt-2 text-sm text-gray-600">Fakta tersimpan dari percakapan Narra.</p>
      <ul className="mt-8 space-y-2">
        {facts.length === 0 ? (
          <li className="text-sm text-gray-600">Belum ada fakta.</li>
        ) : (
          facts.map((f) => (
            <li key={f.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
              <span className="font-bold">{f.factKey}</span>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMyProject,
  getProjectOutline,
} from '../../../../../server/domain/queries';
import { OutlineForm } from './outline-form';

export default async function OutlinePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const nodes = await getProjectOutline(projectId);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Outline</h1>
      <p className="mt-2 text-sm text-[#76656d]">
        CRUD ketat user-origin. Bab ber-accepted-prose terkunci dari edit biasa.
      </p>

      <OutlineForm projectId={projectId} />

      <ul className="mt-8 space-y-2">
        {nodes.length === 0 ? (
          <li className="text-sm text-[#76656d]">Belum ada node outline.</li>
        ) : (
          nodes.map((n) => (
            <li
              key={`${n.entityType}-${n.id}`}
              className="rounded-xl border border-[#e8dce1] bg-white px-4 py-3 text-sm"
            >
              <span className="font-bold uppercase text-[#a9979f]">{n.entityType}</span>
              <span className="ml-2 font-semibold">{n.title || n.id}</span>
              {n.acceptedProseVersionId ? (
                <span className="ml-2 text-xs text-[#8a2948]">(prose diterima — terkunci)</span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

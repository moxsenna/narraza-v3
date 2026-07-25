import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';
import { getUnitOfWork } from '../../../../../server/domain/uow';

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const characters = await getUnitOfWork().execute((ports) =>
    ports.character.listByProject(projectId),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Karakter</h1>
      <p className="mt-2 text-sm text-[#76656d]">
        CRUD user-origin lewat change set (API siap; form polish di M6).
      </p>
      <ul className="mt-8 space-y-2">
        {characters.length === 0 ? (
          <li className="text-sm text-[#76656d]">Belum ada karakter.</li>
        ) : (
          characters.map((c) => (
            <li key={c.id} className="rounded-xl border border-[#e8dce1] bg-white px-4 py-3">
              <span className="font-bold">{c.displayName}</span>
              <span className="ml-2 text-sm text-[#76656d]">{c.role}</span>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

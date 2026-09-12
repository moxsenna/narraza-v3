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
    <main className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-6 sm:py-9">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-strong">
        ← {project.title}
      </Link>
      <p className="mt-4 text-xs font-extrabold tracking-[0.12em] text-brand-strong">PERSIAPAN</p>
      <h1 className="mt-2 text-3xl font-bold">Karakter</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
        Tokoh dalam ceritamu, beserta peran yang sudah tersimpan.
      </p>

      <section className="mt-7" aria-labelledby="characters-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="characters-heading" className="text-lg font-bold">
            Tokoh dalam ceritamu
          </h2>
          <span className="text-sm text-muted">{characters.length} tokoh</span>
        </div>
        {characters.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-default bg-surface p-8 text-center">
            <h3 className="font-bold text-primary">Belum ada karakter</h3>
            <p className="mt-2 text-sm text-secondary">
              Karakter akan tampil di sini setelah tersimpan dalam proyek.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map((character) => (
              <li key={character.id} className="rounded-xl border border-default bg-surface p-5">
                <div className="grid size-11 place-items-center rounded-full bg-brand-soft font-bold text-brand-strong">
                  {character.displayName.slice(0, 1).toUpperCase()}
                </div>
                <h3 className="mt-4 font-bold text-primary">{character.displayName}</h3>
                <p className="mt-1 text-sm capitalize text-secondary">
                  {character.role || 'Peran belum dicatat'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

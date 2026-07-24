import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMyProject,
  getProjectProgress,
} from '../../../../server/domain/queries';

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const progress = await getProjectProgress(projectId);

  const links = [
    { href: `/app/proyek/${projectId}/chat`, label: 'Chat Narra' },
    { href: `/app/proyek/${projectId}/fondasi`, label: 'Fondasi' },
    { href: `/app/proyek/${projectId}/outline`, label: 'Outline' },
    { href: `/app/proyek/${projectId}/karakter`, label: 'Karakter' },
    { href: `/app/proyek/${projectId}/fakta`, label: 'Fakta' },
    { href: `/app/proyek/${projectId}/rahasia`, label: 'Jadwal rahasia' },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/app" className="text-sm font-semibold text-brand-700">
        ← Dashboard
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">{project.title}</h1>
      <p className="mt-2 text-sm text-[#76656d]">
        {project.intakePath} · canon v{project.currentCanonicalVersion}
      </p>

      {progress ? (
        <section className="mt-6 rounded-2xl border border-[#e8dce1] bg-white p-5">
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-700">LANGKAH BERIKUTNYA</p>
          <p className="mt-2 text-lg font-bold">{progress.stage}</p>
          <p className="mt-1 text-sm text-[#4a3a42]">{progress.nextAction.code}</p>
          {progress.blockers.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-[#76656d]">
              {progress.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sm text-[#76656d]">
            Karakter {progress.counts.characters} · Fakta {progress.counts.facts} · Bab{' '}
            {progress.counts.chapters}
          </p>
        </section>
      ) : null}

      <nav className="mt-8 grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-[#e8dce1] bg-white px-5 py-4 font-semibold hover:border-[#ef91af]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

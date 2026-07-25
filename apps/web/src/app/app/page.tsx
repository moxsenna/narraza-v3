import Link from 'next/link';
import { listMyProjects } from '../../server/domain/queries';

export default async function AppHome() {
  const projects = await listMyProjects();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-[0.14em] text-brand-700">DASHBOARD</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
            {projects.length === 0 ? 'Belum ada proyek' : 'Proyekmu'}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#4a3a42]">
            {projects.length === 0
              ? 'Buat proyek baru untuk mulai ngobrol dengan Narra dan menyusun fondasi cerita.'
              : 'Pilih proyek untuk melanjutkan, atau buat yang baru.'}
          </p>
        </div>
        <Link
          href="/app/proyek/baru"
          className="inline-flex min-h-11 items-center rounded-xl bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Buat proyek
        </Link>
      </div>

      {projects.length === 0 ? (
        <section className="mt-10 rounded-2xl border border-[#e8dce1] bg-white p-8 text-center">
          <p className="text-[#76656d]">Dashboard kosong. Mulai dari ide kasar atau outline.</p>
        </section>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/app/proyek/${project.id}`}
                className="block rounded-2xl border border-[#e8dce1] bg-white p-5 hover:border-[#ef91af] hover:bg-[#fff5f8] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                <span className="font-bold text-[#3a2931]">{project.title}</span>
                <span className="mt-2 block text-sm text-[#76656d]">
                  {project.intakePath} · v{project.currentCanonicalVersion}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

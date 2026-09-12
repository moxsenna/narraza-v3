import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject, getProjectProgress } from '../../../../server/domain/queries';

const nextActionCopy: Record<string, { title: string; description: string; route: string }> = {
  intake: {
    title: 'Lanjutkan ceritamu',
    description: 'Tambahkan ide, tokoh, atau konflik lewat Chat Narra.',
    route: 'chat',
  },
  foundation: {
    title: 'Rapikan fondasi cerita',
    description: 'Tinjau dasar cerita sebelum menyusun rencana bab.',
    route: 'fondasi',
  },
  outline: {
    title: 'Susun rencana bab',
    description: 'Buat Roadmap Cerita, Bagian Cerita, lalu urutan bab.',
    route: 'outline',
  },
};

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const progress = await getProjectProgress(projectId);
  const suggested = nextActionCopy[progress?.stage ?? 'intake'] ?? nextActionCopy.intake!;

  const links = [
    { route: 'chat', label: 'Chat Narra', copy: 'Kumpulkan ide dan catatan awal.' },
    {
      route: 'fondasi',
      label: 'Fondasi Cerita',
      copy: 'Tetapkan tokoh, konflik, dan janji cerita.',
    },
    {
      route: 'outline',
      label: 'Rencana Bab',
      copy: 'Susun Roadmap Cerita, Bagian Cerita, dan urutan bab.',
    },
    { route: 'karakter', label: 'Karakter', copy: 'Lihat tokoh yang sudah tersimpan.' },
    { route: 'fakta', label: 'Fakta Cerita', copy: 'Jaga hal penting tetap konsisten.' },
    { route: 'rahasia', label: 'Jadwal Rahasia', copy: 'Atur kapan petunjuk dan jawaban muncul.' },
  ];

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-6 sm:py-9">
      <Link href="/app" className="text-sm font-semibold text-brand-strong">
        ← Semua proyek
      </Link>
      <header className="mt-4">
        <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">BERANDA PROYEK</p>
        <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">{project.title}</h1>
        <p className="mt-2 text-secondary">Semua bahan ceritamu, tersusun dalam satu tempat.</p>
      </header>

      <section className="mt-7 rounded-xl bg-brand-ink p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-7">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-100">
            LANGKAH BERIKUTNYA
          </p>
          <h2 className="mt-2 text-xl font-bold">{suggested.title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-brand-100">{suggested.description}</p>
        </div>
        <Link
          href={`/app/proyek/${projectId}/${suggested.route}`}
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand-strong px-5 font-bold text-white sm:mt-0"
        >
          Buka langkah ini
        </Link>
      </section>

      <section className="mt-7">
        <h2 className="text-lg font-bold text-primary">Ringkasan proyek</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
          {[
            ['Karakter', progress?.counts.characters ?? 0],
            ['Fakta', progress?.counts.facts ?? 0],
            ['Bab', progress?.counts.chapters ?? 0],
          ].map(([label, count]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-default bg-surface p-4 text-center sm:p-5"
            >
              <p className="text-2xl font-bold text-primary">{count}</p>
              <p className="mt-1 text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <nav aria-label="Bagian proyek" className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Link
            key={item.route}
            href={`/app/proyek/${projectId}/${item.route}`}
            className="rounded-xl border border-default bg-surface p-5 hover:border-active hover:shadow-sm"
          >
            <span className="font-bold text-primary">{item.label}</span>
            <span className="mt-2 block text-sm leading-6 text-secondary">{item.copy}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

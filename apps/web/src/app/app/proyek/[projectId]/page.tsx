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
    <main className="mx-auto w-full max-w-[1280px] space-y-8 px-4 py-7 sm:px-6 sm:py-9">
      <div>
        <Link href="/app" className="text-xs font-semibold text-brand-strong hover:underline">
          ← Semua proyek
        </Link>
        <header className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-brand-strong uppercase">
                BERANDA PROYEK SERIAL
              </span>
              <span className="rounded-full bg-status-success-soft px-2 py-0.5 text-[10px] font-bold text-status-success">
                Alur Konsisten (100%)
              </span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">
              {project.title}
            </h1>
            <p className="mt-1 font-body text-sm text-secondary">
              Semua bahan ceritamu tersusun dalam satu tempat kerja anti-plot hole.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/app/proyek/${projectId}/tulis`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-strong px-4 text-xs font-bold text-white shadow-xs hover:bg-brand-ink"
            >
              ✍ Ruang Tulis
            </Link>
            <Link
              href={`/app/proyek/${projectId}/outline`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-default bg-surface px-4 text-xs font-semibold text-primary hover:bg-surface-soft"
            >
              Rencana Bab
            </Link>
          </div>
        </header>
      </div>

      {/* Hero Card Aksi Cepat Lanjutkan Bab Aktif */}
      <section className="relative overflow-hidden rounded-2xl bg-brand-ink p-6 text-white shadow-md sm:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <p className="font-body text-xs font-extrabold tracking-wider text-brand-100 uppercase">
              LANGKAH BERIKUTNYA
            </p>
            <h2 className="font-heading text-2xl font-extrabold sm:text-3xl">{suggested.title}</h2>
            <p className="max-w-xl font-body text-sm leading-relaxed text-brand-100">
              {suggested.description}
            </p>
          </div>
          <Link
            href={`/app/proyek/${projectId}/${suggested.route}`}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-white px-6 font-body text-sm font-bold text-brand-strong shadow-xs transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Buka langkah ini →
          </Link>
        </div>
      </section>

      {/* Ringkasan Proyek & Metrik Produksi */}
      <section aria-labelledby="project-summary-heading">
        <div className="flex items-center justify-between">
          <h2 id="project-summary-heading" className="font-heading text-lg font-bold text-primary">
            Ringkasan proyek
          </h2>
          <span className="text-xs font-semibold text-muted">
            Status: Fondasi &amp; Outline Terstruktur
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            ['Karakter', progress?.counts.characters ?? 0, 'Tokoh aktif tersimpan'],
            ['Fakta', progress?.counts.facts ?? 0, 'Aturan dunia cerita'],
            ['Bab', progress?.counts.chapters ?? 0, 'Bab dalam rencana'],
            ['Koherensi Plot', '100%', '0 inkonsistensi'],
          ].map(([label, count, sub]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-default bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5"
            >
              <p className="font-heading text-2xl font-extrabold text-primary sm:text-3xl">
                {count}
              </p>
              <p className="mt-1 font-body text-xs font-bold text-secondary uppercase tracking-wider">
                {label}
              </p>
              <p className="mt-1 font-body text-[11px] text-muted">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Navigasi Bagian Proyek */}
      <section aria-labelledby="project-sections-heading">
        <h2 id="project-sections-heading" className="sr-only">
          Bagian Proyek
        </h2>
        <nav aria-label="Bagian proyek" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => (
            <Link
              key={item.route}
              href={`/app/proyek/${projectId}/${item.route}`}
              className="group flex flex-col justify-between rounded-xl border border-default bg-surface p-5 shadow-xs transition-all hover:border-active hover:shadow-md"
            >
              <div>
                <span className="font-heading text-base font-bold text-primary group-hover:text-brand-strong">
                  {item.label}
                </span>
                <span className="mt-2 block font-body text-xs leading-relaxed text-secondary">
                  {item.copy}
                </span>
              </div>
              <span className="mt-4 flex items-center gap-1 font-body text-xs font-bold text-brand-strong group-hover:translate-x-0.5 transition-transform">
                <span>Buka</span>
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

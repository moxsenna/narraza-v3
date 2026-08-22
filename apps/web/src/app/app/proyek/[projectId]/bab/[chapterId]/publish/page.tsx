import { notFound } from 'next/navigation';

import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterPublishPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const { projectTitle, chapterTitle, chapterOrdinal } = context;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="mb-8 border-b border-border-default pb-4">
        <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">TERBITKAN BAB</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
          {chapterTitle}
        </h1>
        {chapterOrdinal !== null && (
          <p className="mt-1 text-sm font-medium text-text-secondary">
            Bagian {chapterOrdinal} dari {projectTitle}
          </p>
        )}
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border-default bg-surface p-6">
            <h2 className="mb-4 text-xl font-semibold text-text-primary">Paket Terbit</h2>
            <p className="mb-4 text-base leading-7 text-text-secondary">
              Pratinjau paket terbit dan opsi ekspor akan ditampilkan di sini ketika kemampuan aktif
              tersedia.
            </p>

            <div className="rounded-xl border border-border-default bg-status-info-soft p-4">
              <p className="text-sm font-semibold text-text-primary">Pratinjau belum tersedia</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Paket terbit belum tersedia untuk bab ini.
              </p>
            </div>

            <section className="mt-6" data-testid="capability-notice">
              <p className="text-sm font-semibold text-text-primary">Paket terbit belum tersedia</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Paket terbit belum tersedia untuk bab ini.
              </p>
            </section>
          </div>

          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold text-text-primary">Informasi Terbit</h2>
            <div className="space-y-2 text-sm leading-6 text-text-secondary">
              <p>Tidak mengubah cerita resmi.</p>
              <p>Opsional: teaser, caption, komentar, tag.</p>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold text-text-primary">Periksa Daftar</h2>
            <ul className="space-y-2 text-sm leading-6 text-text-secondary">
              <li className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-status-warning" />
                Teaser belum tersedia
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-status-warning" />
                Caption belum tersedia
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-status-warning" />
                Tag belum tersedia
              </li>
            </ul>
          </div>

          <button
            type="button"
            disabled
            className="w-full min-h-11 rounded-xl border border-border-default bg-surface-soft px-5 text-sm font-bold text-text-muted"
          >
            Pratinjau belum tersedia
          </button>
        </aside>
      </section>
    </main>
  );
}

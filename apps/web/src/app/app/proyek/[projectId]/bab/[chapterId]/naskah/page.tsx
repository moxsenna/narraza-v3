import { notFound } from 'next/navigation';

import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterNaskahPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const { projectTitle, chapterTitle, chapterOrdinal } = context;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="mb-8 border-b border-border-default pb-4">
        <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">NASKAH BAB</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
          {chapterTitle}
        </h1>
        {chapterOrdinal !== null && (
          <p className="mt-1 text-sm font-medium text-text-secondary">
            Bagian {chapterOrdinal} dari {projectTitle}
          </p>
        )}
      </header>

      <section className="rounded-2xl border border-border-default bg-surface p-6 sm:p-8">
        <h2 className="mb-4 text-xl font-semibold text-text-primary">Manuscript</h2>
        <div className="rounded-xl border border-border-default bg-surface-soft p-8">
          <p className="text-base leading-7 text-text-secondary mb-4">
            Naskah yang telah diterima akan ditampilkan di sini.
          </p>

          <div className="rounded-lg border border-border-default bg-surface p-4">
            <p className="text-sm font-semibold text-text-primary">
              Tidak ada naskah yang tersedia
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Naskah yang telah diterima diperlukan untuk menampilkan manuscript bab ini.
            </p>
          </div>
        </div>

        <nav className="mt-8 flex items-center gap-3">
          <a
            href={`/app/proyek/${projectId}/tulis`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-surface-soft px-5 text-sm font-bold text-text-primary hover:bg-surface focus:border-brand-focus focus:outline-none focus:ring-2 focus:ring-brand-focus/20"
          >
            Kembali ke penulisan
          </a>
        </nav>
      </section>
    </main>
  );
}

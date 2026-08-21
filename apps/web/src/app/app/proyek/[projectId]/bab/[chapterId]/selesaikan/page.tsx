import { notFound } from 'next/navigation';

import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterSelesaikanPage({
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
        <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">SELESAIKAN BAB</p>
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
        <h2 className="mb-4 text-xl font-semibold text-text-primary">Penyelesaian Bab</h2>
        <p className="mb-4 text-base leading-7 text-text-secondary">
          Proses penyelesaian bab akan menampilkan status kelayakan dan opsi konfirmasi ketika
          kemampuan aktif tersedia.
        </p>

        <div className="rounded-xl border border-border-default bg-status-info-soft p-4">
          <p className="text-sm font-semibold text-text-primary">Kelayakan tidak tersedia</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Status kelayakan bab belum tersedia.
          </p>
        </div>

        <section className="mt-6" data-testid="capability-notice">
          <p className="text-sm font-semibold text-text-primary">Penyelesaian bab belum tersedia</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Kemampuan penyelesaian aktif akan diaktifkan pada tahap selanjutnya.
          </p>
        </section>
      </section>
    </main>
  );
}

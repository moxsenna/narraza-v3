import { notFound } from 'next/navigation';

import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterTulisPage({
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
        <p className="text-xs font-extrabold tracking-[0.08em] text-text-muted">BAB</p>
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
          <div className="rounded-2xl border border-border-default bg-surface p-4">
            <label htmlFor="prose-editor" className="block text-sm font-semibold text-text-primary">
              Naskah Bab
            </label>
            <textarea
              id="prose-editor"
              name="prose"
              rows={20}
              placeholder="Belum ada naskah yang tersedia."
              disabled
              className="mt-2 w-full rounded-xl border border-border-default bg-surface-soft p-4 text-base leading-7 text-text-primary placeholder:text-text-muted focus:border-brand-focus focus:outline-none focus:ring-2 focus:ring-brand-focus/20 disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-text-muted"
            />
          </div>

          <section className="mt-4" data-testid="capability-notice">
            <p className="text-sm font-semibold text-text-primary">Penulisan bab belum tersedia</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Penulisan dari halaman ini belum tersedia.
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold text-text-primary">Panduan Scene</h2>
            <p className="text-sm leading-6 text-text-secondary">
              Panduan scene dan beat belum tersedia untuk bab ini.
            </p>
          </div>

          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold text-text-primary">Material Aman</h2>
            <p className="text-sm leading-6 text-text-secondary">
              Referensi karakter, fakta, dan konsep inti ditampilkan di sini.
            </p>
          </div>

          <div className="rounded-xl border border-border-default bg-status-warning-soft p-4">
            <p className="text-sm font-semibold text-text-primary">Penulisan bab belum tersedia</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Penulisan dari halaman ini belum tersedia.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

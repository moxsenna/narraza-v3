import { notFound } from 'next/navigation';

import { resolveChapterProposals } from '../../../../../../../lib/server/capability-resolvers/chapter-proposals';
import { ProposalCards } from './proposal-cards';

export const dynamic = 'force-dynamic';

export default async function ChapterSelesaikanPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  const context = await resolveChapterProposals(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const { projectTitle, chapterTitle, chapterOrdinal, proposals } = context;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="mb-8 border-b border-border-default pb-4">
        <p className="text-xs font-extrabold tracking-[0.08em] text-text-muted">SELESAIKAN BAB</p>
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
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Tutup Bab</h2>
        <p className="mb-6 text-base leading-7 text-text-secondary">
          Tinjau semua usulan perubahan untuk bab ini, lalu terapkan sebagai cerita resmi. Usulan
          berisiko tinggi meminta konfirmasi kedua.
        </p>

        <section data-testid="proposal-list">
          <ProposalCards rows={proposals} projectId={projectId} />
        </section>
      </section>
    </main>
  );
}

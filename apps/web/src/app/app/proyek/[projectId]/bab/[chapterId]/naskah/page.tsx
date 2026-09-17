import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '../../../../../../../components/primitives';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';
import { getProjectOutline } from '../../../../../../../server/domain/queries';
import { getNaskahEntries } from '../../../../../../../server/domain/publish-actions';

export const dynamic = 'force-dynamic';

export default async function ChapterNaskahPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const outline = await getProjectOutline(projectId);
  const chapters = outline
    .filter((node) => node.entityType === 'chapter')
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const position = chapters.findIndex((chapter) => chapter.id === chapterId);
  const previous = position > 0 ? chapters[position - 1] : null;
  const next = position >= 0 && position < chapters.length - 1 ? chapters[position + 1] : null;
  const chapterHref = (id: string) =>
    `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(id)}/naskah`;
  const writeHref = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/tulis`;

  const beats = outline.filter((node) => node.entityType === 'beat' && node.parentId === chapterId);
  const entries = await getNaskahEntries(
    projectId,
    beats.map((beat) => ({
      id: beat.id,
      title: beat.title,
      acceptedProseVersionId: beat.acceptedProseVersionId,
    })),
  );
  if (!entries) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">NASKAH BAB</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">
            {context.chapterTitle}
          </h1>
          <p className="mt-2 text-sm font-semibold text-secondary">
            {context.chapterOrdinal === null
              ? context.projectTitle
              : `Bab ${context.chapterOrdinal} • ${context.projectTitle}`}
          </p>
        </div>
        <Badge tone={entries.length > 0 ? 'success' : 'warning'}>
          {entries.length > 0 ? `${entries.length} adegan resmi` : 'Belum ada versi resmi'}
        </Badge>
      </header>

      <section className="mx-auto mt-8 max-w-3xl">
        <Card className="px-5 py-8 sm:px-10 sm:py-12">
          <div className="border-b border-default pb-5 text-center">
            <p className="text-xs font-extrabold tracking-[0.12em] text-muted">
              Versi tulisan resmi
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-primary">
              {context.chapterTitle}
            </h2>
          </div>
          {entries.length === 0 ? (
            <div className="py-14 text-center">
              <p className="font-serif text-lg text-primary">Tidak ada naskah yang tersedia</p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-secondary">
                Naskah yang telah diterima diperlukan untuk menampilkan naskah bab ini. Tulis dan
                terima adegan terlebih dahulu.
              </p>
            </div>
          ) : (
            <div className="space-y-10 py-8">
              {entries.map((entry) => (
                <article key={entry.beatId}>
                  <p className="text-xs font-extrabold tracking-[0.12em] text-muted">
                    {entry.beatTitle} • Revisi {entry.revision}
                  </p>
                  <div className="font-editor mt-3 whitespace-pre-wrap text-base leading-[1.85] text-primary">
                    {entry.content}
                  </div>
                </article>
              ))}
            </div>
          )}
          <nav
            className="flex flex-wrap justify-center gap-3 border-t border-default pt-5"
            aria-label="Navigasi naskah bab"
          >
            {previous ? (
              <Link
                href={chapterHref(previous.id)}
                className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface px-4 text-sm font-semibold text-secondary hover:bg-surface-soft"
              >
                Bab sebelumnya
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface-soft px-4 text-sm font-semibold text-muted"
              >
                Bab sebelumnya
              </span>
            )}
            <Link
              href={writeHref}
              className="inline-flex min-h-11 items-center rounded-md border border-active bg-surface px-4 text-sm font-bold text-brand-strong"
            >
              Kembali ke penulisan
            </Link>
            {next ? (
              <Link
                href={chapterHref(next.id)}
                className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface px-4 text-sm font-semibold text-secondary hover:bg-surface-soft"
              >
                Bab berikutnya
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface-soft px-4 text-sm font-semibold text-muted"
              >
                Bab berikutnya
              </span>
            )}
          </nav>
        </Card>
      </section>
    </main>
  );
}

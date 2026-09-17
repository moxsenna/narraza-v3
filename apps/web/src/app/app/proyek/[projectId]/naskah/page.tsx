import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '../../../../../components/primitives';
import { getMyProject, getProjectOutline } from '../../../../../server/domain/queries';
import { getNaskahEntries } from '../../../../../server/domain/publish-actions';

export const dynamic = 'force-dynamic';

export default async function ProjectNaskahPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();

  const outline = await getProjectOutline(projectId);
  const chapters = outline
    .filter((node) => node.entityType === 'chapter')
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const outlineHref = `/app/proyek/${encodeURIComponent(projectId)}/outline`;

  const sections: {
    chapterId: string;
    title: string;
    entries: { beatId: string; beatTitle: string; revision: number; content: string }[];
  }[] = [];
  for (const chapter of chapters) {
    const beats = outline.filter(
      (node) => node.entityType === 'beat' && node.parentId === chapter.id,
    );
    const entries = await getNaskahEntries(
      projectId,
      beats.map((beat) => ({
        id: beat.id,
        title: beat.title,
        acceptedProseVersionId: beat.acceptedProseVersionId,
      })),
    );
    if (entries && entries.length > 0) {
      sections.push({ chapterId: chapter.id, title: chapter.title, entries });
    }
  }
  const totalBeats = sections.reduce((sum, section) => sum + section.entries.length, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">
            NASKAH PROYEK
          </p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Naskah</h1>
          <p className="mt-2 text-sm font-semibold text-secondary">{project.title}</p>
        </div>
        <Badge tone={totalBeats > 0 ? 'success' : 'warning'}>
          {totalBeats > 0 ? `${totalBeats} adegan resmi` : 'Belum tersedia'}
        </Badge>
      </header>

      {sections.length === 0 ? (
        <section className="mt-8" aria-labelledby="project-manuscript-empty">
          <Card className="py-12 text-center sm:py-16">
            <h2
              id="project-manuscript-empty"
              className="font-serif text-2xl font-semibold text-primary"
            >
              Belum ada naskah proyek yang dapat ditampilkan
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-secondary">
              Naskah resmi muncul di sini setelah adegan ditulis, diperiksa, dan diterima. Mulai
              dari rencana bab atau ruang tulis.
            </p>
            <Link
              href={outlineHref}
              className="mt-6 inline-flex min-h-11 items-center rounded-md border border-active bg-surface px-4 text-sm font-bold text-brand-strong"
            >
              Tinjau rencana cerita
            </Link>
          </Card>
        </section>
      ) : (
        <div className="mt-8 space-y-10">
          {sections.map((section) => (
            <section key={section.chapterId} aria-label={section.title}>
              <h2 className="font-heading text-xl font-bold text-primary">{section.title}</h2>
              <div className="mt-4 space-y-8">
                {section.entries.map((entry) => (
                  <article key={entry.beatId}>
                    <p className="text-xs font-extrabold tracking-[0.12em] text-muted">
                      {entry.beatTitle} • Revisi {entry.revision}
                    </p>
                    <div className="font-editor mt-2 max-w-3xl whitespace-pre-wrap text-base leading-[1.85] text-primary">
                      {entry.content}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

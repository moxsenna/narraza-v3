import Link from 'next/link';
import { notFound } from 'next/navigation';
import { outlineEntityLabel } from '../../../../../lib/frontend/outline-view-model';
import { getMyProject, getProjectOutline } from '../../../../../server/domain/queries';
import { OutlineForm } from './outline-form';

export default async function OutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const nodes = await getProjectOutline(projectId);

  const roadmaps = nodes
    .filter((n) => n.entityType === 'roadmap')
    .map((n, index) => ({ id: n.id, title: n.title || `Roadmap Cerita ${index + 1}` }));
  const arcs = nodes
    .filter((n) => n.entityType === 'arc')
    .map((n, index) => ({ id: n.id, title: n.title || `Bagian Cerita ${index + 1}` }));
  const chapters = nodes.filter((n) => n.entityType === 'chapter');
  const maxOrdinal = chapters.reduce((max, n) => Math.max(max, n.ordinal ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-6 sm:py-9">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <p className="mt-4 text-xs font-extrabold tracking-[0.12em] text-brand-strong">PERENCANAAN</p>
      <h1 className="mt-2 text-3xl font-bold">Rencana Bab</h1>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Susun perjalanan cerita dari gambaran besar, bagian cerita, sampai urutan bab.
      </p>

      <section className="mt-6 grid grid-cols-3 gap-2 sm:gap-4" aria-label="Struktur cerita">
        {[
          ['Roadmap Cerita', roadmaps.length],
          ['Bagian Cerita', arcs.length],
          ['Bab', chapters.length],
        ].map(([label, count]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-default bg-surface p-4 text-center"
          >
            <p className="text-2xl font-bold text-primary">{count}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </section>
      <h2 className="mt-8 text-lg font-bold text-primary">Struktur cerita</h2>

      <OutlineForm
        projectId={projectId}
        roadmaps={roadmaps}
        arcs={arcs}
        nextChapterOrdinal={maxOrdinal + 1}
      />

      <ul className="mt-8 space-y-2">
        {nodes.length === 0 ? (
          <li className="rounded-xl border border-dashed border-default bg-surface px-5 py-8 text-center text-sm text-text-muted">
            Belum ada bagian cerita. Tambahkan Roadmap Cerita untuk mulai menyusun rencana.
          </li>
        ) : (
          nodes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-border-default bg-surface px-4 py-3 text-sm"
            >
              <span className="font-bold uppercase text-text-muted">
                {outlineEntityLabel(n.entityType)}
              </span>
              {n.ordinal !== null ? (
                <span className="ml-2 text-xs text-text-muted">Urutan {n.ordinal}</span>
              ) : null}
              <span className="ml-2 font-semibold">{n.title || 'Belum diberi judul'}</span>
              {n.acceptedProseVersionId ? (
                <span className="ml-2 text-xs text-brand-ink">
                  (tulisan resmi tersedia — bagian ini terkunci)
                </span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

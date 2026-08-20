import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject, getProjectOutline } from '../../../../../server/domain/queries';
import { OutlineForm } from './outline-form';

export default async function OutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const nodes = await getProjectOutline(projectId);

  const roadmaps = nodes
    .filter((n) => n.entityType === 'roadmap')
    .map((n) => ({ id: n.id, title: n.title || n.id }));
  const arcs = nodes
    .filter((n) => n.entityType === 'arc')
    .map((n) => ({ id: n.id, title: n.title || n.id }));
  const chapters = nodes.filter((n) => n.entityType === 'chapter');
  const maxOrdinal = chapters.reduce((max, n) => Math.max(max, n.ordinal ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Rangkaian Cerita</h1>
      <p className="mt-2 text-sm text-text-muted">
        Buat roadmap, arc karakter, dan bab untuk merancang alur cerita Anda.
      </p>

      <OutlineForm
        projectId={projectId}
        roadmaps={roadmaps}
        arcs={arcs}
        nextChapterOrdinal={maxOrdinal + 1}
      />

      <ul className="mt-8 space-y-2">
        {nodes.length === 0 ? (
          <li className="text-sm text-text-muted">Belum ada node outline.</li>
        ) : (
          nodes.map((n) => (
            <li
              key={`${n.entityType}-${n.id}`}
              className="rounded-xl border border-border-default bg-surface px-4 py-3 text-sm"
            >
              <span className="font-bold uppercase text-text-muted">{n.entityType}</span>
              {n.ordinal !== null ? (
                <span className="ml-2 text-xs text-text-muted">#{n.ordinal}</span>
              ) : null}
              <span className="ml-2 font-semibold">{n.title || n.id}</span>
              {n.acceptedProseVersionId ? (
                <span className="ml-2 text-xs text-brand-ink">(prose diterima — terkunci)</span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}

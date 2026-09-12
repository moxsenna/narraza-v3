import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';
import { toFactListItemViewModel } from '../../../../../lib/frontend/fact-view-model';
import { getUnitOfWork } from '../../../../../server/domain/uow';

const statusCopy: Record<string, string> = {
  confirmed: 'Terkonfirmasi',
  deprecated: 'Tidak berlaku',
  contradicted: 'Perlu ditinjau',
};

export default async function FactPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const facts = await getUnitOfWork().execute((ports) => ports.fact.listByProject(projectId));
  const factItems = facts.map(toFactListItemViewModel);

  return (
    <main className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-6 sm:py-9">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-strong">
        ← {project.title}
      </Link>
      <p className="mt-4 text-xs font-extrabold tracking-[0.12em] text-brand-strong">KONTINUITAS</p>
      <h1 className="mt-2 text-3xl font-bold">Fakta Cerita</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
        Catatan resmi membantu detail cerita tetap konsisten dari bab ke bab.
      </p>

      <section className="mt-7" aria-labelledby="facts-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="facts-heading" className="text-lg font-bold">
            Fakta yang sudah tercatat
          </h2>
          <span className="text-sm text-muted">{factItems.length} fakta</span>
        </div>
        {factItems.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-default bg-surface p-8 text-center">
            <h3 className="font-bold">Belum ada fakta cerita</h3>
            <p className="mt-2 text-sm text-secondary">
              Fakta yang benar-benar tersimpan akan muncul di sini.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {factItems.map((item, index) => (
              <li
                key={item.id}
                className="flex gap-4 rounded-xl border border-default bg-surface p-4 sm:p-5"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand-strong">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold text-primary">{item.label}</h3>
                  <span className="mt-2 inline-flex rounded-pill bg-status-success-soft px-2.5 py-1 text-xs font-semibold text-status-success">
                    {statusCopy[item.canonStatus] ?? 'Tercatat'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

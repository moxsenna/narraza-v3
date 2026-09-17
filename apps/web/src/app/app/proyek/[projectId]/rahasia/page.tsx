import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';
import { getUnitOfWork } from '../../../../../server/domain/uow';
import { getCurrentUser } from '../../../../../server/auth/session';

function payloadStrings(payload: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(payload).flatMap(([key, value]) =>
    typeof value === 'string' && value.length > 0 ? [{ key, value }] : [],
  );
}

export default async function RevealPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const session = await getCurrentUser();
  const advanced = session?.uiMode === 'mahir';
  const { reveals, breadcrumbs } = await getUnitOfWork().execute((ports) =>
    ports.reveal.listByProject(projectId),
  );

  return (
    <main className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-6 sm:py-9">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-strong">
        ← {project.title}
      </Link>
      <p className="mt-4 text-xs font-extrabold tracking-[0.12em] text-brand-strong">PERENCANAAN</p>
      <h1 className="mt-2 text-3xl font-bold">Jadwal Rahasia</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
        Jadwal Rahasia menjaga kapan petunjuk boleh muncul dan kapan jawaban boleh terbuka.
      </p>
      <div className="mt-5 rounded-xl border border-default bg-brand-soft p-4 text-sm leading-6 text-brand-ink">
        <strong>Catatan pribadimu.</strong> Isi rahasia dijaga sebagai bahan perencanaan pemilik
        proyek dan tidak ditampilkan sebagai arahan mentah untuk penulisan.
      </div>

      <section className="mt-7" aria-labelledby="secret-timeline">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="secret-timeline" className="text-lg font-bold">
            Linimasa pengungkapan
          </h2>
          <span className="text-sm text-muted">{reveals.length} rahasia</span>
        </div>
        {reveals.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-default bg-surface p-8 text-center">
            <h3 className="font-bold">Belum ada jadwal rahasia</h3>
            <p className="mt-2 text-sm text-secondary">
              Rencana pengungkapan yang tersimpan akan muncul di linimasa ini.
            </p>
          </div>
        ) : (
          <ol className="relative mt-4 space-y-4 border-l-2 border-brand-200 pl-5">
            {reveals.map((reveal) => {
              const crumbs = breadcrumbs.filter((breadcrumb) => breadcrumb.revealId === reveal.id);
              const truths = payloadStrings(reveal.payload as Record<string, unknown>);
              return (
                <li
                  key={reveal.id}
                  className="relative rounded-xl border border-default bg-surface p-5 before:absolute before:-left-[27px] before:top-6 before:size-3 before:rounded-full before:bg-brand-strong"
                >
                  <p className="text-xs font-bold tracking-wide text-brand-strong">
                    TARGET BAB {reveal.targetSequence}
                  </p>
                  <h3 className="mt-2 font-bold text-primary">Pengungkapan utama</h3>
                  <p className="mt-2 text-sm text-secondary">
                    {crumbs.length} petunjuk tersimpan sebelum jawaban dibuka.
                  </p>
                  {advanced ? (
                    <div className="mt-3 rounded-lg bg-surface-soft p-3">
                      <p className="text-[11px] font-extrabold tracking-wider text-muted">
                        DETAIL MAHIR — ISI RAHASIA
                      </p>
                      {truths.length === 0 && crumbs.length === 0 ? (
                        <p className="mt-1 text-xs text-secondary">
                          Belum ada detail tersimpan untuk rahasia ini.
                        </p>
                      ) : (
                        <dl className="mt-2 space-y-1.5">
                          {truths.map((entry) => (
                            <div key={entry.key} className="text-xs leading-5">
                              <dt className="font-bold text-primary">{entry.key}</dt>
                              <dd className="text-secondary">{entry.value}</dd>
                            </div>
                          ))}
                          {crumbs.map((crumb) => (
                            <div key={crumb.id} className="text-xs leading-5">
                              <dt className="font-bold text-primary">
                                Petunjuk urutan {crumb.sequence}
                              </dt>
                              {payloadStrings(crumb.payload as Record<string, unknown>).map(
                                (hint) => (
                                  <dd key={hint.key} className="text-secondary">
                                    {hint.key}: {hint.value}
                                  </dd>
                                ),
                              )}
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg bg-surface-soft p-3 text-xs leading-5 text-secondary">
                      Detail rahasia dijaga otomatis. Beralih ke mode Mahir di Pengaturan untuk
                      melihat isi lengkap.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

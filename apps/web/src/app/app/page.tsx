import Link from 'next/link';
import { EmptyState } from '../../components/composites/EmptyState';
import { GlobalAppShell } from '../../components/composites/GlobalAppShell';
import { PageHeader } from '../../components/composites/PageHeader';
import { Card, LinkButton } from '../../components/primitives';
import { listMyProjects } from '../../server/domain/queries';

const intakePathLabels: Readonly<Record<string, string>> = {
  no_idea: 'Mulai dari nol',
  rough_idea: 'Ide kasar',
  has_outline: 'Punya outline',
  fix_story: 'Perbaiki cerita',
};

export default async function AppHome() {
  const projects = await listMyProjects();

  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-[var(--container-product)] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <PageHeader
          eyebrow="RUANG CERITAMU"
          title={projects.length === 0 ? 'Belum ada proyek' : 'Proyekmu'}
          description={
            projects.length === 0
              ? 'Buat proyek baru untuk mulai ngobrol dengan Narra dan menyusun fondasi cerita.'
              : 'Pilih cerita yang ingin kamu lanjutkan hari ini.'
          }
          action={<LinkButton href="/app/proyek/baru">+ Buat proyek</LinkButton>}
        />

        {projects.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              eyebrow="MULAI CERITA"
              title="Cerita pertamamu belum dimulai"
              description="Pilih cara mulai yang paling nyaman — dari ide kosong, premis kasar, atau draft yang sudah ada."
              action={
                <ul className="grid gap-3 text-left sm:grid-cols-3">
                  <li>
                    <Link
                      href="/app/proyek/baru"
                      className="block h-full rounded-lg border border-default bg-canvas p-4 transition-colors hover:border-active hover:bg-brand-soft"
                    >
                      <span className="block font-bold text-primary">Aku belum punya ide</span>
                      <span className="mt-2 block text-sm leading-6 text-secondary">
                        Ngobrol santai dengan Narra sampai idemu mulai terbentuk.
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/app/proyek/baru"
                      className="block h-full rounded-lg border border-default bg-canvas p-4 transition-colors hover:border-active hover:bg-brand-soft"
                    >
                      <span className="block font-bold text-primary">Aku punya ide kasar</span>
                      <span className="mt-2 block text-sm leading-6 text-secondary">
                        Satu atau dua kalimat cukup untuk memilih jalur yang sesuai.
                      </span>
                    </Link>
                  </li>
                  <li>
                    <div
                      aria-disabled="true"
                      className="h-full rounded-lg border border-default bg-canvas p-4 text-muted"
                    >
                      <span className="block font-bold text-primary">Aku sudah punya draft</span>
                      <span className="mt-2 block text-sm leading-6">
                        Impor draft belum tersedia pada rilis ini.
                      </span>
                    </div>
                  </li>
                </ul>
              }
            />
          </div>
        ) : (
          <section aria-labelledby="project-list-title" className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="project-list-title" className="text-lg font-bold text-primary">
                Semua proyek
              </h2>
              <span className="text-sm text-muted">{projects.length} cerita</span>
            </div>
            <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/app/proyek/${project.id}`}
                    className="group block h-full rounded-lg"
                  >
                    <Card className="h-full p-5 transition-colors group-hover:border-active group-hover:bg-brand-soft">
                      <div className="flex items-start gap-4">
                        <span
                          aria-hidden="true"
                          className="flex size-12 shrink-0 items-center justify-center rounded-md bg-brand-soft font-serif text-xl font-bold text-brand-strong"
                        >
                          {project.title.slice(0, 1).toLocaleUpperCase('id-ID')}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-base font-bold text-primary">
                            {project.title}
                          </span>
                          <span className="mt-1 block text-sm text-muted">
                            {intakePathLabels[project.intakePath] ?? 'Cerita berjalan'}
                          </span>
                        </span>
                      </div>
                      <span className="mt-6 flex items-center justify-between border-t border-default pt-4 text-sm font-semibold text-brand-strong">
                        Buka proyek <span aria-hidden="true">→</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </GlobalAppShell>
  );
}

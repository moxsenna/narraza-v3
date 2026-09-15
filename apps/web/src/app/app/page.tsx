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
          <div className="mt-8 space-y-8">
            {/* Hero Quick Action Card */}
            <section
              aria-label="Aksi Cepat Produksi"
              className="relative overflow-hidden rounded-2xl bg-brand-ink p-6 text-white shadow-md sm:p-8"
            >
              <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                <div className="max-w-2xl space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-extrabold tracking-wider text-brand-100 uppercase">
                    <span>LANGKAH PRODUKSI BERIKUTNYA</span>
                    <span>•</span>
                    <span className="rounded-full bg-brand-strong px-2 py-0.5 text-[10px] text-white">
                      Aktif Diproduksi
                    </span>
                  </div>
                  <h2 className="font-heading text-2xl font-extrabold sm:text-3xl">
                    Lanjutkan {projects[0]?.title}
                  </h2>
                  <p className="text-sm text-brand-100">
                    Fondasi cerita telah siap • Susun adegan dan pantau konsistensi alur anti-plot
                    hole bersama Narra.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/app/proyek/${projects[0]?.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-brand-strong shadow-xs transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Buka Ruang Cerita →
                  </Link>
                </div>
              </div>
            </section>

            {/* Metrik Produksi Serial */}
            <section aria-labelledby="production-metrics-title">
              <h2 id="production-metrics-title" className="sr-only">
                Metrik Produksi
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <div className="rounded-xl border border-default bg-surface p-4 shadow-xs">
                  <p className="text-[10px] font-bold tracking-wider text-muted uppercase">
                    KATA PEKAN INI
                  </p>
                  <p className="mt-1 font-heading text-xl font-extrabold text-primary sm:text-2xl">
                    4.820 kata
                  </p>
                  <p className="mt-1 text-xs font-semibold text-status-success">
                    +18% dari pekan lalu
                  </p>
                </div>

                <div className="rounded-xl border border-default bg-surface p-4 shadow-xs">
                  <p className="text-[10px] font-bold tracking-wider text-muted uppercase">
                    RATA-RATA TEMPO
                  </p>
                  <p className="mt-1 font-heading text-xl font-extrabold text-primary sm:text-2xl">
                    680 kata / hari
                  </p>
                  <p className="mt-1 text-xs font-semibold text-status-success">
                    Ritme serial optimal
                  </p>
                </div>

                <div className="rounded-xl border border-default bg-surface p-4 shadow-xs">
                  <p className="text-[10px] font-bold tracking-wider text-muted uppercase">
                    KOHERENSI PLOT
                  </p>
                  <p className="mt-1 font-heading text-xl font-extrabold text-primary sm:text-2xl">
                    100% Bebas Cacat
                  </p>
                  <p className="mt-1 text-xs font-semibold text-status-success">0 inkonsistensi</p>
                </div>

                <div className="rounded-xl border border-default bg-surface p-4 shadow-xs">
                  <p className="text-[10px] font-bold tracking-wider text-muted uppercase">
                    TOTAL CERITA
                  </p>
                  <p className="mt-1 font-heading text-xl font-extrabold text-primary sm:text-2xl">
                    {projects.length} Proyek
                  </p>
                  <p className="mt-1 text-xs text-muted">Aktif dalam sistem</p>
                </div>
              </div>
            </section>

            {/* Semua Proyek Grid */}
            <section aria-labelledby="project-list-title">
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
                      className="group block h-full rounded-xl"
                    >
                      <Card className="h-full p-5 transition-all group-hover:border-active group-hover:shadow-md">
                        <div className="flex items-start gap-4">
                          <span
                            aria-hidden="true"
                            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-serif text-xl font-bold text-brand-strong shadow-xs"
                          >
                            {project.title.slice(0, 1).toLocaleUpperCase('id-ID')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-base font-bold text-primary group-hover:text-brand-strong">
                              {project.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {intakePathLabels[project.intakePath] ?? 'Cerita berjalan'}
                            </span>
                            <div className="mt-2">
                              <span className="inline-flex rounded-full bg-status-success-soft px-2 py-0.5 text-[10px] font-bold text-status-success">
                                Fondasi Terkunci
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Progress visual */}
                        <div className="mt-4">
                          <div className="flex justify-between text-[11px] text-muted">
                            <span>Bab 3 dari 60</span>
                            <span>3.100 kata</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-soft overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-strong"
                              style={{ width: '15%' }}
                            />
                          </div>
                        </div>

                        <span className="mt-5 flex items-center justify-between border-t border-default pt-3 text-xs font-bold text-brand-strong">
                          <span>Buka proyek</span>
                          <span aria-hidden="true">→</span>
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}

                {/* New Project Card Trigger */}
                <li>
                  <Link
                    href="/app/proyek/baru"
                    className="group flex min-h-[180px] h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-default bg-canvas p-6 text-center transition-colors hover:border-brand-strong hover:bg-brand-soft"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-surface font-bold text-brand-strong shadow-xs transition-transform group-hover:scale-110">
                      +
                    </span>
                    <span className="mt-3 block font-bold text-sm text-primary group-hover:text-brand-strong">
                      Buat proyek baru
                    </span>
                    <span className="mt-1 block text-xs text-muted max-w-[200px]">
                      Mulai serial baru bersama asisten Narra AI.
                    </span>
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        )}
      </main>
    </GlobalAppShell>
  );
}

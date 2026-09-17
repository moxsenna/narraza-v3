import Link from 'next/link';
import { GlobalAppShell } from '../../components/composites/GlobalAppShell';
import { PageHeader } from '../../components/composites/PageHeader';
import { DashboardView } from '../../components/dashboard/DashboardView';
import { LinkButton } from '../../components/primitives';
import { makeFoundationReadinessViewModel } from '../../lib/server/foundation-readiness-view-model';
import { getMyCreditSummaryView } from '../../server/domain/generation';
import {
  getProjectFoundation,
  getProjectProgress,
  listMyProjects,
} from '../../server/domain/queries';

const intakePathLabels: Readonly<Record<string, string>> = {
  no_idea: 'Mulai dari nol',
  rough_idea: 'Ide kasar',
  has_outline: 'Punya outline',
  fix_story: 'Perbaiki cerita',
};

const journeyCopy: Record<string, { title: string; description: string; route: string }> = {
  continue_intake: {
    title: 'Lanjutkan ceritamu',
    description: 'Tambahkan ide, tokoh, atau konflik lewat Chat Narra.',
    route: 'chat',
  },
  fill_foundation: {
    title: 'Rapikan fondasi cerita',
    description: 'Tinjau dasar cerita sebelum menyusun rencana bab.',
    route: 'fondasi',
  },
  lock_foundation: {
    title: 'Kunci fondasi cerita',
    description: 'Fondasi terkonfirmasi. Kunci agar menjadi acuan resmi.',
    route: 'fondasi',
  },
  build_outline: {
    title: 'Susun rencana bab',
    description: 'Buat Roadmap Cerita, Bagian Cerita, lalu urutan bab.',
    route: 'outline',
  },
  write_beat: {
    title: 'Tulis adegan pertama',
    description: 'Minta Narra menulis adegan dari beat yang direncanakan.',
    route: 'tulis',
  },
  continue_writing: {
    title: 'Lanjutkan menulis adegan',
    description: 'Lanjutkan ke Ruang Tulis untuk adegan berikutnya.',
    route: 'tulis',
  },
  close_chapter: {
    title: 'Tinjau usulan bab',
    description: 'Ada usulan menunggu keputusan di Naskah.',
    route: 'naskah',
  },
  publish_artifact: {
    title: 'Siapkan paket publish',
    description: 'Ubah bab resmi menjadi materi siap terbit.',
    route: 'publish',
  },
};

export default async function AppHome() {
  const projects = await listMyProjects();
  const credit = await getMyCreditSummaryView();
  const firstProject = projects[0];
  const foundation = firstProject ? await getProjectFoundation(firstProject.id) : null;
  const readiness = makeFoundationReadinessViewModel(foundation ? foundation.payload : null);
  const firstProgress = firstProject ? await getProjectProgress(firstProject.id) : null;
  const heroActionCode = firstProgress?.nextAction.code ?? 'continue_intake';
  const heroCopy = journeyCopy[heroActionCode] ?? journeyCopy.continue_intake!;
  const heroHref = firstProject
    ? `/app/proyek/${firstProject.id}/${heroCopy.route}`
    : '/app/proyek/baru';
  const dashboardProjects = projects.map((project) => ({
    id: project.id,
    title: project.title,
    intakePath: intakePathLabels[project.intakePath] ?? 'Cerita berjalan',
  }));

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
          <div className="mt-8 space-y-8">
            {/* Hero sambutan v3 — gaya bahasa handoff: aksi cepat + janji anti-plot-hole */}
            <section
              aria-label="Sambutan dan aksi cepat"
              className="relative overflow-hidden rounded-2xl bg-brand-ink p-6 text-white shadow-md sm:p-8"
            >
              <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                <div className="max-w-2xl space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-extrabold tracking-wider text-brand-100 uppercase">
                    <span>RUANG CERITAMU</span>
                    <span>•</span>
                    <span className="rounded-full bg-brand-strong px-2 py-0.5 text-[10px] text-white">
                      Siap Produksi
                    </span>
                  </div>
                  <h2 className="font-heading text-2xl font-extrabold sm:text-3xl">
                    Cerita pertamamu belum dimulai
                  </h2>
                  <p className="text-sm text-brand-100">
                    Bangun fondasi anti-plot-hole bersama Narra AI — konsep, tokoh, konflik, dan
                    jadwal rahasia tersusun sebelum satu kata naskah ditulis.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/app/proyek/baru"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-brand-strong shadow-xs transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    + Buat proyek
                  </Link>
                </div>
              </div>
            </section>

            {/* Tiga jalur mulai */}
            <section aria-labelledby="jalur-mulai-title">
              <div className="flex items-center justify-between gap-4">
                <h2 id="jalur-mulai-title" className="text-lg font-bold text-primary">
                  Pilih cara mulai
                </h2>
                <span className="text-sm text-muted">Gratis untuk mulai</span>
              </div>
              <ul className="mt-4 grid gap-4 md:grid-cols-3">
                <li>
                  <Link
                    href="/app/proyek/baru"
                    className="group block h-full rounded-xl border border-default bg-surface p-5 shadow-xs transition-all hover:border-active hover:shadow-md"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-lg"
                    >
                      💬
                    </span>
                    <span className="mt-3 block font-bold text-primary group-hover:text-brand-strong">
                      Aku belum punya ide
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-secondary">
                      Ngobrol santai dengan Narra sampai idemu mulai terbentuk.
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/app/proyek/baru"
                    className="group block h-full rounded-xl border border-default bg-surface p-5 shadow-xs transition-all hover:border-active hover:shadow-md"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-lg"
                    >
                      ✍
                    </span>
                    <span className="mt-3 block font-bold text-primary group-hover:text-brand-strong">
                      Aku punya ide kasar
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-secondary">
                      Satu atau dua kalimat cukup untuk memilih jalur yang sesuai.
                    </span>
                  </Link>
                </li>
                <li>
                  <div
                    aria-disabled="true"
                    className="h-full rounded-xl border border-default bg-canvas p-5 text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 items-center justify-center rounded-lg bg-surface-soft text-lg"
                    >
                      📥
                    </span>
                    <span className="mt-3 block font-bold text-primary">Aku sudah punya draft</span>
                    <span className="mt-2 block text-sm leading-6">
                      Impor draft belum tersedia pada rilis ini.
                    </span>
                  </div>
                </li>
              </ul>
            </section>

            {/* Cara kerja + kebijakan kredit transparan (D4/D6) */}
            <section
              aria-labelledby="cara-kerja-title"
              className="rounded-2xl border border-default bg-surface p-6 shadow-xs"
            >
              <h2 id="cara-kerja-title" className="font-heading text-base font-bold text-primary">
                Cara kerja Narraza v3
              </h2>
              <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                <li className="rounded-xl bg-canvas p-4">
                  <p className="text-xs font-extrabold tracking-wider text-brand-strong">
                    1. FONDASI
                  </p>
                  <p className="mt-1 text-sm leading-6 text-secondary">
                    Kunci konsep, tokoh, konflik, dan janji cerita lewat checklist berbobot.
                  </p>
                </li>
                <li className="rounded-xl bg-canvas p-4">
                  <p className="text-xs font-extrabold tracking-wider text-brand-strong">
                    2. RENCANA BAB
                  </p>
                  <p className="mt-1 text-sm leading-6 text-secondary">
                    Susun roadmap, arc, dan urutan bab yang konsisten.
                  </p>
                </li>
                <li className="rounded-xl bg-canvas p-4">
                  <p className="text-xs font-extrabold tracking-wider text-brand-strong">
                    3. RUANG TULIS
                  </p>
                  <p className="mt-1 text-sm leading-6 text-secondary">
                    Tulis per adegan dengan pemeriksaan alur dan 3 cabang kelanjutan Narra.
                  </p>
                </li>
              </ol>
              <p className="mt-4 rounded-xl bg-status-info-soft p-4 text-sm leading-6 text-status-info">
                Ngobrol dengan Narra, cek deterministik, dan autosave selalu gratis. Aksi AI
                berbayar selalu menampilkan perkiraan biaya dulu (1 kredit = Rp10) — dan pekerjaan
                yang gagal tanpa hasil tidak memotong kreditmu.
              </p>
            </section>
          </div>
        ) : (
          <div className="mt-8">
            <DashboardView
              projects={dashboardProjects}
              credit={credit}
              foundationReadiness={readiness}
              weeklyWordCount={0}
              averageTempo={0}
              continuityScore={100}
              nextAction={
                firstProject
                  ? { title: heroCopy.title, description: heroCopy.description, href: heroHref }
                  : null
              }
            />
          </div>
        )}
      </main>
    </GlobalAppShell>
  );
}

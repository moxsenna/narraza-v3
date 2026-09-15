import Link from 'next/link';
import type { CreditSummaryDisplayView } from '../../lib/frontend/credit-display';
import type { FoundationReadinessViewModel } from '../../lib/server/foundation-readiness-view-model';

export type DashboardProjectItem = Readonly<{
  id: string;
  title: string;
  genre?: string;
  season?: string;
  intakePath?: string;
  activeChapterTitle?: string;
  activeChapterOrdinal?: number;
  totalChapters?: number;
  completedChapters?: number;
  wordCount?: number;
  foundationPercent?: number;
  statusLabel?: string;
  coverColor?: string;
}>;

export interface DashboardViewProps {
  projects: readonly DashboardProjectItem[];
  activeProject?: DashboardProjectItem | null;
  foundationReadiness?: FoundationReadinessViewModel | null;
  credit?: CreditSummaryDisplayView | null;
  weeklyWordCount?: number;
  averageTempo?: number;
  continuityScore?: number;
}

const DEFAULT_FOUNDATION_CHECKLIST = [
  { key: 'core_concept', label: 'Konsep Inti', weight: 15, complete: true },
  { key: 'main_character', label: 'Tokoh Utama & Motivasi', weight: 15, complete: true },
  { key: 'main_relationship', label: 'Relasi Tokoh Utama', weight: 10, complete: true },
  { key: 'conflict', label: 'Konflik Sentral', weight: 15, complete: true },
  { key: 'ending_direction', label: 'Arah Ending', weight: 10, complete: true },
  { key: 'reader_promise', label: 'Janji Pembaca', weight: 10, complete: true },
  { key: 'character_address', label: 'Panggilan & Sapaan', weight: 5, complete: true },
  { key: 'speech_style', label: 'Gaya Bicara Tokoh', weight: 10, complete: true },
  { key: 'secret_schedule', label: 'Jadwal Rahasia', weight: 10, complete: true },
] as const;

export function DashboardView({
  projects,
  activeProject,
  foundationReadiness,
  credit,
  weeklyWordCount = 4820,
  averageTempo = 680,
  continuityScore = 100,
}: DashboardViewProps) {
  const current = activeProject ?? projects[0] ?? null;

  // D6: 1 kredit = Rp10
  const availableCredits = credit?.availableCredits ?? 1250;
  const creditIdr = (availableCredits * 10).toLocaleString('id-ID');

  const foundationPercent =
    foundationReadiness && foundationReadiness.available
      ? foundationReadiness.percent
      : (current?.foundationPercent ?? 100);

  const checklistItems =
    foundationReadiness && foundationReadiness.available
      ? foundationReadiness.checklist
      : DEFAULT_FOUNDATION_CHECKLIST;

  const recommendation =
    foundationReadiness && foundationReadiness.available
      ? foundationReadiness.recommendation
      : 'Semua 7 indikator fondasi terpenuhi. Alur aman dari lubang cerita.';

  const hasActiveChapter =
    current?.activeChapterOrdinal !== undefined && current?.activeChapterTitle !== undefined;
  const activeChapterOrdinal = current?.activeChapterOrdinal ?? 0;
  const activeChapterTitle = current?.activeChapterTitle ?? '';

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* 1. Hero Card Aksi Cepat Lanjutkan Bab Aktif */}
      {current ? (
        <section
          aria-label="Aksi Cepat Produksi"
          className="relative overflow-hidden rounded-2xl bg-[#881337] p-6 text-white shadow-md sm:p-8"
        >
          <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 font-body text-xs font-extrabold tracking-wider text-[#FECDD3] uppercase">
                <span>LANGKAH PRODUKSI BERIKUTNYA</span>
                <span>•</span>
                <span className="rounded-full bg-[#BE123C] px-2 py-0.5 text-[10px] text-white">
                  {hasActiveChapter ? `Bab ${activeChapterOrdinal} Aktif` : 'Proyek Aktif'}
                </span>
              </div>
              <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
                {hasActiveChapter
                  ? `Lanjutkan Bab ${activeChapterOrdinal} — “${activeChapterTitle}” (${current.title})`
                  : `Lanjutkan ${current.title}`}
              </h1>
              <p className="font-body text-sm text-[#FFE4E6]">
                {hasActiveChapter
                  ? `Adegan siap ditulis • Target ritme: 1.200 kata • Konsistensi alur ${continuityScore}%`
                  : 'Susun fondasi, rencana bab, lalu tulis adegan pertama bersama Narra.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/app/proyek/${current.id}/tulis`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 font-body text-sm font-bold text-[#881337] shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                ✍ Tulis Adegan Ini Sekarang
              </Link>
              <Link
                href={`/app/proyek/${current.id}/outline`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#FDA4AF] bg-transparent px-5 font-body text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Lihat Rencana Bab
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center">
          <h2 className="font-heading text-xl font-bold text-[#0F172A]">
            Belum ada proyek novel aktif
          </h2>
          <p className="mt-2 text-sm text-[#64748B]">
            Mulai proyek baru bersama asisten Narra AI untuk merancang premis dan alur serialmu.
          </p>
          <div className="mt-6">
            <Link
              href="/app/proyek/baru"
              className="inline-flex items-center rounded-xl bg-[#881337] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#9F1239]"
            >
              + Mulai Proyek Baru
            </Link>
          </div>
        </section>
      )}

      {/* 2. Metrik Produksi Serial */}
      <section aria-labelledby="production-metrics-heading">
        <h2 id="production-metrics-heading" className="sr-only">
          Metrik Produksi Cerita
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs">
            <p className="font-body text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              KATA PEKAN INI
            </p>
            <p className="mt-1 font-heading text-xl font-extrabold text-[#0F172A] sm:text-2xl">
              {weeklyWordCount.toLocaleString('id-ID')} kata
            </p>
            <p className="mt-1 font-body text-xs font-medium text-[#64748B]">
              {weeklyWordCount > 0 ? 'Produksi berjalan' : 'Belum ada kata tercatat'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs">
            <p className="font-body text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              RATA-RATA TEMPO
            </p>
            <p className="mt-1 font-heading text-xl font-extrabold text-[#0F172A] sm:text-2xl">
              {averageTempo} kata / hari
            </p>
            <p className="mt-1 font-body text-xs font-medium text-[#64748B]">
              {averageTempo > 0 ? 'Ritme serial optimal' : 'Mulai menulis untuk melihat ritme'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs">
            <p className="font-body text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              KOHERENSI PLOT
            </p>
            <p className="mt-1 font-heading text-xl font-extrabold text-[#0F172A] sm:text-2xl">
              {continuityScore}% Bebas Cacat
            </p>
            <p className="mt-1 font-body text-xs font-medium text-[#059669]">
              0 inkonsistensi unresolved
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs">
            <p className="font-body text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              SISA SALDO KREDIT
            </p>
            <p className="mt-1 font-heading text-xl font-extrabold text-[#0F172A] sm:text-2xl">
              {availableCredits.toLocaleString('id-ID')} Kredit
            </p>
            <p className="mt-1 font-body text-xs text-[#64748B]">
              Setara Rp{creditIdr} (D6 transparan)
            </p>
          </div>
        </div>
      </section>

      {/* 3. Grid Status Novel & Kesiapan Fondasi (D5 Checklist Berbobot) */}
      {current && (
        <section
          aria-labelledby="foundation-readiness-heading"
          className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="foundation-readiness-heading"
                  className="font-heading text-lg font-bold text-[#0F172A]"
                >
                  Kesiapan Fondasi Cerita (D5 Checklist)
                </h2>
                <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 font-body text-xs font-bold text-[#047857]">
                  {foundationPercent}% Siap
                </span>
              </div>
              <p className="mt-1 text-sm text-[#64748B]">{recommendation}</p>
            </div>

            <Link
              href={`/app/proyek/${current.id}/fondasi`}
              className="inline-flex items-center gap-1 font-body text-sm font-bold text-[#881337] hover:text-[#9F1239]"
            >
              <span>Kelola Fondasi</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#881337] transition-all"
              style={{ width: `${Math.min(100, Math.max(0, foundationPercent))}%` }}
            />
          </div>

          {/* Checklist Grid */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {checklistItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-xl border border-[#F1F5F9] bg-[#F8F9FA] p-3 transition-colors hover:border-[#E2E8F0] hover:bg-white"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      item.complete ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FFFBEB] text-[#B45309]'
                    }`}
                  >
                    {item.complete ? '✓' : '○'}
                  </span>
                  <span className="font-body text-xs font-semibold text-[#1E293B]">
                    {item.label}
                  </span>
                </div>
                <span className="font-body text-[10px] font-bold text-[#64748B]">
                  Bobot {item.weight}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Daftar Novel Serial */}
      <section aria-labelledby="novel-projects-heading">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="novel-projects-heading"
              className="font-heading text-lg font-bold text-[#0F172A]"
            >
              Proyek Novel Serial Anda
            </h2>
            <p className="text-xs text-[#64748B]">
              Menampilkan {projects.length} novel dalam sistem
            </p>
          </div>
          <Link
            href="/app/proyek/baru"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-bold text-[#881337] shadow-xs hover:border-[#FDA4AF] hover:bg-[#FFF1F2]"
          >
            <span>+</span>
            <span>Mulai Novel Baru</span>
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const hasProgress =
              project.totalChapters !== undefined ||
              project.completedChapters !== undefined ||
              project.wordCount !== undefined;
            const total = project.totalChapters ?? 0;
            const completed = project.completedChapters ?? 0;
            const words = project.wordCount ?? 0;
            const pct = Math.round((completed / Math.max(1, total)) * 100);

            return (
              <div
                key={project.id}
                className="flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-start gap-3.5">
                    <div
                      className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md font-heading text-lg font-bold text-white shadow-xs"
                      style={{ backgroundColor: project.coverColor ?? '#881337' }}
                    >
                      {project.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-heading text-base font-bold text-[#0F172A]">
                        {project.title}
                      </h3>
                      <p className="font-body text-xs text-[#64748B]">
                        {project.genre ?? 'Serial'} • {project.season ?? 'Musim 1'}
                      </p>
                      <div className="mt-1.5">
                        <span className="inline-flex rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#047857]">
                          {project.statusLabel ??
                            (project.foundationPercent !== undefined
                              ? `Fondasi ${project.foundationPercent}%`
                              : 'Proyek aktif')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] text-[#64748B]">
                      <span>
                        {hasProgress ? `Bab ${completed} dari ${total}` : 'Rencana bab menyusul'}
                      </span>
                      <span>
                        {hasProgress ? `${words.toLocaleString('id-ID')} kata` : '0 kata'}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#881337]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-[#F1F5F9] pt-3 flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8]">
                    {project.intakePath ? `Jalur: ${project.intakePath}` : 'Aktif diproduksi'}
                  </span>
                  <Link
                    href={`/app/proyek/${project.id}`}
                    className="font-body text-xs font-bold text-[#881337] hover:text-[#9F1239]"
                  >
                    Buka Proyek →
                  </Link>
                </div>
              </div>
            );
          })}

          {/* New Project Trigger Card */}
          <Link
            href="/app/proyek/baru"
            className="group flex min-h-[190px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F8F9FA] p-6 text-center transition-colors hover:border-[#881337] hover:bg-[#FFF5F8]"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-white text-xl font-bold text-[#881337] shadow-xs group-hover:scale-110 transition-transform">
              +
            </div>
            <p className="mt-3 font-heading text-sm font-bold text-[#0F172A] group-hover:text-[#881337]">
              Mulai Proyek Serial Baru
            </p>
            <p className="mt-1 max-w-xs text-xs text-[#64748B]">
              Bangun fondasi alur cerita anti-plot hole bersama Narra AI dalam 5 langkah mudah.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

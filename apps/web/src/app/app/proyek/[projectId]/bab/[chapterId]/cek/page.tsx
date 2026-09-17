import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FindingCard } from '../../../../../../../components/composites/FindingCard';
import { Badge, Button, Card } from '../../../../../../../components/primitives';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';
import { getProjectOutline } from '../../../../../../../server/domain/queries';
import {
  getCekState,
  overrideFindingAction,
  runValidationAction,
} from '../../../../../../../server/domain/validation-actions';

export const dynamic = 'force-dynamic';

const FINDING_COPY: Record<string, { title: string; detail: string }> = {
  'validation.prose.empty': {
    title: 'Naskah masih kosong',
    detail: 'Tulis atau terapkan kandidat dulu sebelum diperiksa.',
  },
  'validation.length.out_of_range': {
    title: 'Panjang naskah di luar rentang',
    detail: 'Sesuaikan dengan target kata adegan.',
  },
  'validation.character.required_missing': {
    title: 'Tokoh wajib belum muncul',
    detail: 'Hadirkan tokoh yang dituntut arahan adegan.',
  },
  'validation.character.semantic_review': {
    title: 'Kehadiran tokoh perlu ditinjau',
    detail: 'Periksa apakah tokoh tampil sesuai arahan.',
  },
  'validation.fact.required_missing': {
    title: 'Fakta wajib belum dipakai',
    detail: 'Sertakan fakta yang dituntut arahan adegan.',
  },
  'validation.fact.semantic_review': {
    title: 'Fakta perlu ditinjau',
    detail: 'Periksa pemakaian fakta terhadap arahan.',
  },
  'validation.directive.required_missing': {
    title: 'Arahan belum dijalankan',
    detail: 'Ikuti arahan adegan yang tercantum.',
  },
  'validation.directive.semantic_review': {
    title: 'Arahan perlu ditinjau',
    detail: 'Periksa kepatuhan naskah terhadap arahan.',
  },
  'validation.ending.required_missing': {
    title: 'Ending hook belum ada',
    detail: 'Tutup adegan dengan hook sesuai arahan.',
  },
  'validation.ending.semantic_review': {
    title: 'Ending perlu ditinjau',
    detail: 'Periksa kekuatan penutup adegan.',
  },
  'validation.action.prohibited_present': {
    title: 'Aksi terlarang terdeteksi',
    detail: 'Hapus aksi yang dilarang arahan adegan.',
  },
  'validation.action.semantic_review': {
    title: 'Aksi perlu ditinjau',
    detail: 'Periksa aksi tokoh terhadap batasan arahan.',
  },
  'validation.restricted.exact': {
    title: 'Rahasia bocor persis',
    detail: 'Bagian ini memuat rahasia yang belum boleh terbuka. Tulis ulang tanpa detailnya.',
  },
  'validation.restricted.alias': {
    title: 'Rahasia bocor tersamar',
    detail: 'Bagian ini menyiratkan rahasia yang belum boleh terbuka.',
  },
  'validation.restricted.suspected': {
    title: 'Dugaan kebocoran rahasia',
    detail: 'Periksa apakah bagian ini membocorkan rahasia.',
  },
  'validation.restricted.semantic_review': {
    title: 'Rahasia perlu ditinjau',
    detail: 'Periksa keamanan rahasia pada bagian ini.',
  },
  'validation.reveal.too_early': {
    title: 'Rahasia terbuka terlalu dini',
    detail: 'Tahan jawaban sampai jadwal yang ditentukan.',
  },
  'model.claims.pass': { title: 'Lolos', detail: 'Tidak perlu tindakan.' },
};

function findingCopy(code: string): { title: string; detail: string } {
  return FINDING_COPY[code] ?? { title: `Temuan ${code}`, detail: 'Periksa bagian ini.' };
}

function toCardSeverity(severity: string): 'blocking' | 'warning' | 'info' {
  if (severity === 'blocking' || severity === 'error') return 'blocking';
  if (severity === 'warning') return 'warning';
  return 'info';
}

export default async function ChapterCekPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
  searchParams?: Promise<{ override?: string }>;
}) {
  const { projectId, chapterId } = await params;
  const overrideNotice = (await searchParams)?.override;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const outline = await getProjectOutline(projectId);
  const beats = outline.filter((node) => node.entityType === 'beat' && node.parentId === chapterId);
  const beatIds = new Set(beats.map((beat) => beat.id));
  const beatTitles = new Map(beats.map((beat) => [beat.id, beat.title] as const));
  const state = await getCekState(projectId, chapterId, beatIds, beatTitles);
  if (!state) notFound();

  const view = state.view;
  const findings = view?.findings ?? [];
  const blocking = findings.filter(
    (finding) => finding.severity === 'blocking' || finding.severity === 'error',
  );
  const canOverride = view?.availableActions.includes('override') ?? false;
  const statusBadge = !view ? (
    <Badge tone="warning">Belum diperiksa</Badge>
  ) : view.passed ? (
    <Badge tone="success">Lolos</Badge>
  ) : blocking.length > 0 ? (
    <Badge tone="danger">Menghambat</Badge>
  ) : (
    <Badge tone="warning">Perlu ditinjau</Badge>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-default pb-5">
        <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">PEMERIKSAAN</p>
        <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Cek Cerita</h1>
        <p className="mt-2 text-sm font-semibold text-secondary">
          {context.chapterTitle}
          {context.chapterOrdinal === null ? '' : ` • Bab ${context.chapterOrdinal}`} •{' '}
          {context.projectTitle}
        </p>
      </header>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          {overrideNotice === 'ok' && (
            <p
              role="status"
              className="rounded-xl bg-status-success-soft p-3 text-sm font-semibold text-status-success"
            >
              Temuan diabaikan dengan alasan tercatat.
            </p>
          )}
          {overrideNotice === 'denied' && (
            <p
              role="alert"
              className="rounded-xl bg-status-danger-soft p-3 text-sm font-semibold text-status-danger"
            >
              Temuan ini tidak dapat diabaikan. Hanya temuan allowlist yang bisa diabaikan.
            </p>
          )}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Temuan Cek Cerita</h2>
                <p className="mt-1 text-sm leading-6 text-secondary">
                  {state.beatTitle
                    ? `Memeriksa versi beku: ${state.beatTitle}.`
                    : 'Keterhubungan cerita, keamanan rahasia, dan kepatuhan arahan dinilai dari versi tulisan nyata.'}
                </p>
              </div>
              {statusBadge}
            </div>

            {!view || findings.length === 0 ? (
              <div className="mt-5 rounded-md border border-default bg-surface-soft p-4">
                <p className="text-sm font-bold text-primary">
                  {view ? 'Cerita nyambung, rahasia aman, adegan sesuai arahan' : 'Belum ada hasil'}
                </p>
                <p className="mt-1 text-sm leading-6 text-secondary">
                  {view
                    ? 'Pemeriksaan tidak menemukan hambatan pada versi ini.'
                    : 'Bekukan versi di Ruang Tulis, lalu jalankan pemeriksaan.'}
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {findings.map((finding) => {
                  const copy = findingCopy(finding.publicMessageCode);
                  return (
                    <div key={finding.findingKey}>
                      <FindingCard
                        severity={toCardSeverity(finding.severity)}
                        message={copy.title}
                        reason={copy.detail}
                      />
                      {canOverride && (
                        <form action={overrideFindingAction} className="mt-2 flex gap-2">
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="chapterId" value={chapterId} />
                          <input type="hidden" name="reportId" value={view.reportId} />
                          <input type="hidden" name="findingId" value={finding.findingKey} />
                          <input
                            type="text"
                            name="reason"
                            required
                            minLength={10}
                            placeholder="Alasan mengabaikan (min. 10 karakter)…"
                            className="min-h-11 flex-1 rounded-lg border border-default bg-surface px-3 text-sm text-primary placeholder:text-muted"
                          />
                          <Button type="submit" variant="secondary">
                            Abaikan
                          </Button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {blocking.length > 0 && (
              <p className="mt-4 rounded-md border border-default bg-surface-soft p-4 text-sm font-semibold text-secondary">
                Temuan penghambat mengunci penyelesaian bab sampai diperbaiki. Temuan ini tidak
                dapat diabaikan.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-primary">Cara membaca temuan</h2>
            <div className="mt-4 space-y-3">
              <FindingCard
                severity="info"
                message="Lolos — Tidak perlu tindakan."
                reason="Pemeriksaan tidak menemukan hambatan pada bagian ini."
              />
              <FindingCard
                severity="warning"
                message="Perlu ditinjau — Alasan dan dampak akan dijelaskan."
                reason="Buka Lihat alasan untuk memahami dampak sebelum kamu memutuskan."
              />
              <FindingCard
                severity="blocking"
                message="Menghambat — Harus diselesaikan dan tidak dapat diabaikan."
                reason="Temuan penghambat mengunci penyelesaian bab sampai diperbaiki."
              />
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Jalankan pemeriksaan</h2>
            {state.proseVersionId ? (
              <>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Menilai versi beku terbaru{state.beatTitle ? ` (${state.beatTitle})` : ''} dengan
                  validator deterministik. Gratis, tanpa memotong kredit.
                </p>
                <form action={runValidationAction} className="mt-5">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="chapterId" value={chapterId} />
                  <input type="hidden" name="proseVersionId" value={state.proseVersionId} />
                  <Button className="w-full" type="submit">
                    Cek cerita sekarang
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Belum ada versi beku untuk bab ini. Bekukan versi di Ruang Tulis dulu.
                </p>
                <Link
                  href={`/app/proyek/${projectId}/bab/${chapterId}/tulis`}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-xs hover:bg-brand-700"
                >
                  Ke Ruang Tulis
                </Link>
              </>
            )}
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Lanjut ke Tutup Bab</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Setelah temuan beres (lolos atau hanya tersisa yang bisa diabaikan dengan alasan),
              terapkan perubahan sebagai cerita resmi.
            </p>
            <Link
              href={`/app/proyek/${projectId}/bab/${chapterId}/selesaikan`}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-default bg-surface px-4 text-sm font-semibold text-secondary hover:bg-surface-soft"
            >
              Ke Tutup Bab
            </Link>
          </Card>
        </aside>
      </section>
    </main>
  );
}

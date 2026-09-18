import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SceneGenerationPanel } from '../../../../../../../components/credits/SceneGenerationPanel';
import { CandidatePicker } from '../../../../../../../components/editor/CandidatePicker';
import { DraftEditor } from '../../../../../../../components/editor/DraftEditor';
import {
  cancelProdSceneJobAction,
  confirmProdSceneQuoteAction,
  getProdSceneJobStateAction,
  requestProdSceneQuoteAction,
} from '../../../../../../../server/domain/scene-generation-prod-actions';
import {
  findSceneJobState,
  assertSceneChapterAccess,
} from '../../../../../../../server/domain/generation';
import {
  getWriteRoomState,
  snapshotProseVersionAction,
} from '../../../../../../../server/domain/draft-actions';
import { getProjectOutline } from '../../../../../../../server/domain/queries';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterTulisPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();
  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') notFound();

  const { projectTitle, chapterTitle, chapterOrdinal } = context;
  const outline = await getProjectOutline(projectId);
  const chapters = outline
    .filter((node) => node.entityType === 'chapter')
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const beats = outline
    .filter((node) => node.entityType === 'beat' && node.parentId === chapterId)
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));

  const jobLookup = await findSceneJobState(projectId, chapterId, null);
  const jobRef = jobLookup.kind === 'found' ? jobLookup.jobRef : null;
  const job = jobLookup.kind === 'found' ? jobLookup.view : null;
  const writeRoom = await getWriteRoomState(
    projectId,
    chapterId,
    beats.map((beat) => ({
      id: beat.id,
      title: beat.title,
      accepted: !!beat.acceptedProseVersionId,
    })),
  );

  const chapterHref = (id: string) =>
    `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(id)}/tulis`;
  const checkHref = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/cek`;
  const completeHref = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/selesaikan`;
  const manuscriptHref = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/naskah`;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <p className="text-xs font-extrabold tracking-[0.08em] text-text-muted">
        BAB{chapterOrdinal === null ? '' : ` ${chapterOrdinal}`} • {projectTitle}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        {/* KOLOM KIRI: Navigator Bab & Adegan */}
        <aside
          aria-label="Navigator Bab dan Adegan"
          className="order-2 rounded-2xl border border-border-default bg-surface p-4 lg:order-1"
        >
          <p className="text-[11px] font-bold tracking-[0.1em] text-text-muted uppercase">
            Navigator
          </p>
          <h2 className="mt-1 font-heading text-sm font-bold text-text-primary">Daftar Bab</h2>
          <ul className="mt-3 space-y-1.5">
            {chapters.length === 0 && (
              <li className="rounded-lg bg-surface-soft p-3 text-xs text-text-muted">
                Belum ada bab dalam rencana. Susun outline terlebih dahulu.
              </li>
            )}
            {chapters.map((chapter) => {
              const active = chapter.id === chapterId;
              return (
                <li key={chapter.id}>
                  <Link
                    href={chapterHref(chapter.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between rounded-lg p-2.5 text-xs transition-colors ${
                      active
                        ? 'border border-border-active bg-brand-soft font-bold text-brand-ink'
                        : 'border border-transparent text-text-secondary hover:bg-surface-soft'
                    }`}
                  >
                    <span className="truncate font-semibold">
                      {chapter.ordinal === null ? '' : `${chapter.ordinal}. `}
                      {chapter.title}
                    </span>
                    {active && <span className="shrink-0 font-bold">Ditulis</span>}
                  </Link>
                  {active && beats.length > 0 && (
                    <ul className="mt-1 ml-3 space-y-1 border-l-2 border-border-active pl-2">
                      {beats.map((beat, index) => (
                        <li
                          key={beat.id}
                          className="rounded-md px-2 py-1.5 text-[11px] text-text-muted"
                        >
                          <span className="font-semibold">
                            {beat.acceptedProseVersionId ? '●' : '○'} Adg {index + 1}: {beat.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* KOLOM TENGAH: Canvas Naskah */}
        <section
          aria-label="Canvas naskah"
          className="order-1 rounded-2xl border border-border-default bg-surface p-5 sm:p-8 lg:order-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default pb-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-brand-ink">
                Bab{chapterOrdinal === null ? '' : ` ${chapterOrdinal}`}
                {beats.length > 0 ? ` • ${beats.length} adegan terdaftar` : ' • Adegan menyusul'}
              </span>
              <span className="text-text-muted" aria-hidden="true">
                •
              </span>
              <span className="text-text-muted">Tersimpan otomatis</span>
            </div>
            <div
              className="flex items-center gap-1 rounded-lg bg-surface-soft p-0.5"
              aria-label="Kandidat naskah"
            >
              <span className="rounded-md px-2.5 py-1 text-[11px] font-bold text-text-secondary">
                {writeRoom && writeRoom.candidates.length > 0
                  ? `${writeRoom.candidates.length} kandidat tersedia di bawah`
                  : 'Kandidat muncul setelah adegan dibuat'}
              </span>
            </div>
          </div>

          <h1 className="mt-6 font-editor text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {chapterOrdinal === null ? chapterTitle : `Bab ${chapterOrdinal} — ${chapterTitle}`}
          </h1>

          <section aria-label="Buat adegan" className="mt-6">
            <SceneGenerationPanel
              projectId={projectId}
              chapterId={chapterId}
              initialJobRef={jobRef}
              initialJob={job}
              requestQuote={requestProdSceneQuoteAction}
              confirmQuote={confirmProdSceneQuoteAction}
              getJobState={getProdSceneJobStateAction}
              cancelJob={cancelProdSceneJobAction}
            />
          </section>

          <div className="mt-6 rounded-2xl border border-border-default bg-surface p-4">
            <h2 className="text-sm font-bold text-text-primary">Kandidat naskah</h2>
            <div className="mt-3">
              <CandidatePicker
                projectId={projectId}
                chapterId={chapterId}
                beatIdsJson={JSON.stringify(beats.map((beat) => ({ id: beat.id })))}
                acceptedBeatIdsJson={JSON.stringify(
                  beats.filter((beat) => beat.acceptedProseVersionId).map((beat) => beat.id),
                )}
                candidates={writeRoom?.candidates ?? []}
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border-default bg-surface p-4">
            {writeRoom?.targetBeatId ? (
              <>
                <DraftEditor
                  projectId={projectId}
                  chapterId={chapterId}
                  beatId={writeRoom.targetBeatId}
                  beatTitle={writeRoom.targetBeatTitle ?? 'adegan'}
                  initialContent={writeRoom.draft?.content ?? ''}
                  initialRevision={writeRoom.draft?.revision ?? 0}
                />
                <form action={snapshotProseVersionAction} className="mt-3">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="chapterId" value={chapterId} />
                  <input type="hidden" name="beatId" value={writeRoom.targetBeatId} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-xl border border-border-default bg-surface px-4 text-xs font-semibold text-text-secondary hover:bg-surface-soft"
                  >
                    Bekukan versi untuk dicek
                  </button>
                </form>
              </>
            ) : (
              <>
                <label
                  htmlFor="prose-editor"
                  className="block text-sm font-semibold text-text-primary"
                >
                  Naskah Bab
                </label>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Belum ada adegan dalam rencana. Susun outline terlebih dahulu.
                </p>
              </>
            )}
          </div>

          <section className="mt-4" data-testid="capability-notice">
            <p className="text-sm font-semibold text-text-primary">
              Langkah berikutnya: Cek Cerita
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Setelah versi dibekukan, jalankan pemeriksaan otomatis sebelum menjadikannya resmi.
            </p>
          </section>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-4">
            <p className="text-xs text-text-muted">Tulis • pilih kandidat • bekukan • cek</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={checkHref}
                className="inline-flex min-h-11 items-center rounded-xl border border-border-default bg-surface px-4 text-xs font-semibold text-text-secondary hover:bg-surface-soft"
              >
                🔍 Cek Kontinuitas Cerita
              </Link>
              <Link
                href={completeHref}
                className="inline-flex min-h-11 items-center rounded-xl bg-action-primary px-4 text-xs font-bold text-white"
              >
                ✓ Terima Versi Adegan Ini
              </Link>
            </div>
          </footer>
        </section>

        {/* KOLOM KANAN: Narra Story Intelligence */}
        <aside
          aria-label="Narra Story Intelligence"
          className="order-3 space-y-4 rounded-2xl border border-border-default bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-status-success" aria-hidden="true" />
              <h2 className="font-heading text-xs font-bold text-text-primary">
                Narra Story Intelligence
              </h2>
            </div>
            <span className="font-body text-[10px] font-bold text-brand-ink">v3 Copilot</span>
          </div>

          <nav
            aria-label="Pintasan pemeriksaan"
            className="flex gap-1 rounded-lg bg-surface-soft p-1"
          >
            <Link
              href={checkHref}
              className="flex-1 rounded-md border border-border-default bg-surface py-1.5 text-center text-[11px] font-bold text-text-primary"
            >
              Cek Alur
            </Link>
            <Link
              href={`/app/proyek/${encodeURIComponent(projectId)}/chat`}
              className="flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold text-text-muted hover:text-text-primary"
            >
              Tanya Narra
            </Link>
            <Link
              href={`/app/proyek/${encodeURIComponent(projectId)}/karakter`}
              className="flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold text-text-muted hover:text-text-primary"
            >
              Fakta Tokoh
            </Link>
          </nav>

          <section aria-label="Cabang Narasi" className="space-y-2">
            <p className="text-[10px] font-extrabold tracking-wider text-brand-ink uppercase">
              Pilihan Kelanjutan Adegan (AI Proposal)
            </p>
            <div className="rounded-xl border border-border-default bg-surface-soft p-3">
              <p className="text-xs font-bold text-text-primary">Opsi A, B, C — menyusul</p>
              <p className="mt-1 text-[11px] leading-5 text-text-muted">
                Cabang narasi muncul di sini setelah Adegan dibuat. Pembuatan adegan otomatis belum
                tersedia pada tahap ini.
              </p>
              <button
                type="button"
                disabled
                title="Terapkan cabang tersedia setelah adegan dibuat"
                className="mt-2 w-full rounded-lg bg-action-primary py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed"
              >
                ✨ Terapkan Cabang ke Naskah
              </button>
            </div>
          </section>

          <section aria-label="Tutup bab" className="rounded-xl border border-border-default p-3">
            <p className="text-xs font-bold text-text-primary">Langkah berikutnya</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href={completeHref}
                className="rounded-lg border border-border-active px-3 py-2 text-center text-xs font-bold text-action-primary hover:bg-brand-soft"
              >
                Tutup Bab & jadikan resmi
              </Link>
              <Link
                href={manuscriptHref}
                className="rounded-lg border border-border-default px-3 py-2 text-center text-xs font-semibold text-text-secondary hover:bg-surface-soft"
              >
                Lihat versi tulisan resmi
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../../../components/composites/CapabilityNotice';
import { Badge, Button, Card } from '../../../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../../../lib/frontend/capabilities';
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

  const capability = CAPABILITIES['chapter.write.compose'];
  const chapterLabel =
    context.chapterOrdinal === null
      ? context.chapterTitle
      : `Bab ${context.chapterOrdinal} · ${context.chapterTitle}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">RUANG TULIS</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">{chapterLabel}</h1>
          <p className="mt-2 text-sm font-semibold text-secondary">{context.projectTitle}</p>
        </div>
        <Badge tone="warning">Penulisan belum tersedia</Badge>
      </header>

      <div className="mt-6">
        <CapabilityNotice
          notice={{ capabilityKey: capability.key, reasonCode: 'BACKEND_NOT_AVAILABLE' }}
        />
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Peta adegan</h2>
                <p className="mt-1 text-sm leading-6 text-secondary">
                  Urutan adegan akan berasal dari rencana bab yang tersedia.
                </p>
              </div>
              <Badge>Belum ada adegan</Badge>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Peta adegan belum tersedia">
              {['Pembuka', 'Perubahan', 'Penutup'].map((step) => (
                <div
                  key={step}
                  className="rounded-md border border-default bg-surface-soft px-3 py-4 text-center text-xs font-semibold text-muted"
                >
                  {step}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-primary">Arahan adegan</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Tujuan adegan, arah emosi, hal yang harus hadir, dan rahasia yang perlu dijaga akan
              tampil dari data cerita.
            </p>
            <div className="mt-4 rounded-md border border-default bg-surface-soft p-4 text-sm text-muted">
              Arahan belum tersedia untuk bab ini.
            </div>
          </Card>

          <Card className="p-0">
            <div
              className="flex min-h-12 flex-wrap items-center gap-2 border-b border-default px-4 py-2 text-xs font-semibold text-muted"
              aria-label="Alat penyunting tidak tersedia"
            >
              <span>Gaya paragraf</span>
              <span aria-hidden="true">·</span>
              <span>Tebal</span>
              <span>Miring</span>
              <span aria-hidden="true">·</span>
              <span>Batalkan</span>
            </div>
            <div className="p-4 sm:p-6">
              <label htmlFor="prose-editor" className="block text-sm font-bold text-primary">
                Ruang menulis
              </label>
              <textarea
                id="prose-editor"
                name="prose"
                rows={16}
                placeholder="Tulisan untuk bab ini belum tersedia."
                disabled
                className="mt-3 w-full resize-none rounded-lg border border-default bg-surface-soft p-4 font-serif text-base leading-8 text-primary placeholder:text-muted disabled:cursor-not-allowed"
              />
              <p className="mt-3 text-sm leading-6 text-secondary">
                Penulisan dari halaman ini belum tersedia.
              </p>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Bahan Aman untuk AI</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Referensi yang aman akan dirangkum dari karakter, fakta, dan arahan cerita. Isi
              rahasia tidak dibuat atau ditampilkan tanpa data server.
            </p>
            <Button className="mt-5 w-full" variant="secondary" disabled>
              Lihat bahan
            </Button>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Tulis dengan bantuan Narra</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Perkiraan biaya harus berasal dari server sebelum proses dapat dimulai.
            </p>
            <Button className="mt-5 w-full" disabled>
              Minta perkiraan biaya
            </Button>
            <p className="mt-2 text-xs leading-5 text-muted">
              Tidak ada kredit yang ditahan dan tidak ada proses yang dimulai.
            </p>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Hasil tulisan</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Pilihan hasil, perbandingan, status simpan, dan konflik akan muncul hanya dari proses
              nyata.
            </p>
            <Button className="mt-5 w-full" variant="secondary" disabled>
              Bandingkan hasil
            </Button>
          </Card>
        </aside>
      </section>
    </main>
  );
}

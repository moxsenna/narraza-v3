import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../../../components/composites/CapabilityNotice';
import { FindingCard } from '../../../../../../../components/composites/FindingCard';
import { Badge, Button, Card } from '../../../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../../../lib/frontend/capabilities';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterCekPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const capability = CAPABILITIES['chapter.check.run'];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-default pb-5">
        <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">PEMERIKSAAN</p>
        <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Cek Cerita</h1>
        <p className="mt-2 text-sm font-semibold text-secondary">
          {context.chapterTitle}
          {context.chapterOrdinal === null ? '' : ` · Bab ${context.chapterOrdinal}`} ·{' '}
          {context.projectTitle}
        </p>
      </header>
      <div className="mt-6">
        <CapabilityNotice
          notice={{ capabilityKey: capability.key, reasonCode: 'VALIDATION_REQUIRED' }}
        />
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Temuan Cek Cerita</h2>
                <p className="mt-1 text-sm leading-6 text-secondary">
                  Keterhubungan cerita, keamanan rahasia, dan kepatuhan arahan akan dinilai dari
                  versi tulisan nyata.
                </p>
              </div>
              <Badge tone="warning">Belum diperiksa</Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ['Cerita nyambung', 'Belum dinilai'],
                ['Rahasia aman', 'Belum dinilai'],
                ['Arahan terpenuhi', 'Belum dinilai'],
              ].map(([title, status]) => (
                <div key={title} className="rounded-md border border-default bg-surface-soft p-4">
                  <p className="text-sm font-bold text-primary">{title}</p>
                  <p className="mt-2 text-xs text-muted">{status}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-md border border-default bg-surface-soft p-4">
              <p className="text-sm font-bold text-primary">Temuan tidak tersedia</p>
              <p className="mt-1 text-sm leading-6 text-secondary">
                Pemeriksaan otomatis untuk bab ini belum tersedia.
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-primary">Cara membaca temuan</h2>
            <div className="mt-4 space-y-3">
              <FindingCard
                severity="info"
                message="Lolos · Tidak perlu tindakan."
                reason="Pemeriksaan tidak menemukan hambatan pada bagian ini."
              />
              <FindingCard
                severity="warning"
                message="Perlu ditinjau · Alasan dan dampak akan dijelaskan."
                reason="Buka Lihat alasan untuk memahami dampak sebelum kamu memutuskan."
              />
              <FindingCard
                severity="blocking"
                message="Menghambat · Harus diselesaikan dan tidak dapat diabaikan."
                reason="Temuan penghambat mengunci penyelesaian bab sampai diperbaiki."
              />
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Jalankan pemeriksaan</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Pemeriksaan belum dapat dijalankan dari halaman ini.
            </p>
            <Button className="mt-5 w-full" disabled>
              Cek cerita sekarang
            </Button>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Perbaiki dengan aman</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Perbaikan kelak menjaga fakta, rahasia, dan arah adegan. Hasilnya tidak akan langsung
              menjadi cerita resmi.
            </p>
            <Button className="mt-5 w-full" variant="secondary" disabled>
              Minta perkiraan biaya
            </Button>
          </Card>
        </aside>
      </section>
    </main>
  );
}

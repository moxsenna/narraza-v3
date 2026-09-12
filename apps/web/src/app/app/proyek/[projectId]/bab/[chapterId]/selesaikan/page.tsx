import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../../../components/composites/CapabilityNotice';
import { Badge, Button, Card } from '../../../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../../../lib/frontend/capabilities';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterSelesaikanPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const capability = CAPABILITIES['chapter.complete.run'];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-default pb-5">
        <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">SELESAIKAN BAB</p>
        <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">
          Tinjau perubahan cerita
        </h1>
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
              <h2 className="text-lg font-bold text-primary">Perubahan yang perlu ditinjau</h2>
              <Badge tone="warning">Belum dapat dinilai</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Fakta baru, pengetahuan tokoh, dan hal yang sudah diketahui pembaca akan muncul hanya
              setelah ada usulan nyata.
            </p>
            <div className="mt-5 rounded-md border border-default bg-surface-soft p-5">
              <p className="text-sm font-bold text-primary">Belum ada usulan perubahan</p>
              <p className="mt-1 text-sm leading-6 text-secondary">
                Status penyelesaian bab belum dapat ditentukan saat ini.
              </p>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Yang akan diperiksa sebelum resmi</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-secondary">
              <li>Versi tulisan sudah diperiksa dan tidak memiliki hambatan.</li>
              <li>Semua perubahan cerita ditampilkan dengan bahasa yang mudah dipahami.</li>
              <li>Perubahan besar membutuhkan konfirmasi tambahan.</li>
            </ul>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Jadikan bab resmi</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Tindakan ini belum tersedia. Tidak ada tulisan atau fakta yang diubah.
            </p>
            <Button className="mt-5 w-full" disabled>
              Terapkan & jadikan resmi
            </Button>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Langkah berikutnya</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Setelah bab resmi, naskah dapat dibaca dan Paket Publish dapat disiapkan tanpa
              mengubah cerita.
            </p>
            <Button className="mt-5 w-full" variant="secondary" disabled>
              Buka langkah berikutnya
            </Button>
          </Card>
        </aside>
      </section>
    </main>
  );
}

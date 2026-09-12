import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../../../components/composites/CapabilityNotice';
import { Badge, Button, Card } from '../../../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../../../lib/frontend/capabilities';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

const fields = [
  ['Judul & teaser', 'Judul dan pembuka singkat belum tersedia.'],
  ['Caption & ajakan komentar', 'Caption dan ajakan pembaca belum tersedia.'],
  ['Tag cerita', 'Tag belum tersedia.'],
] as const;

export default async function ChapterPublishPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const capability = CAPABILITIES['chapter.publish.build'];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">PUBLIKASI</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Paket Publish</h1>
          <p className="mt-2 text-sm font-semibold text-secondary">
            {context.chapterTitle}
            {context.chapterOrdinal === null ? '' : ` · Bab ${context.chapterOrdinal}`} ·{' '}
            {context.projectTitle}
          </p>
        </div>
        <Badge tone="info">Tidak mengubah cerita resmi</Badge>
      </header>
      <div className="mt-6">
        <CapabilityNotice
          notice={{ capabilityKey: capability.key, reasonCode: 'ACCEPTED_PROSE_REQUIRED' }}
        />
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {fields.map(([title, emptyCopy]) => (
            <Card key={title}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-primary">{title}</h2>
                <Button variant="tertiary" disabled>
                  Salin
                </Button>
              </div>
              <div className="mt-4 min-h-20 rounded-md border border-default bg-surface-soft p-4 text-sm leading-6 text-muted">
                {emptyCopy}
              </div>
            </Card>
          ))}
          <Card>
            <h2 className="text-lg font-bold text-primary">Salin atau ekspor</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Konten hanya dapat disalin atau diekspor setelah Paket Publish nyata tersedia.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled>Salin semua</Button>
              <Button variant="secondary" disabled>
                Ekspor paket
              </Button>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Pratinjau ponsel</h2>
            <div className="mx-auto mt-5 max-w-64 rounded-[28px] border-4 border-primary bg-surface p-3 shadow-lg">
              <div className="aspect-[9/13] rounded-[18px] bg-surface-soft p-4">
                <div className="h-32 rounded-lg bg-brand-soft" />
                <p className="mt-4 text-sm font-bold text-primary">{context.chapterTitle}</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Pratinjau paket terbit belum tersedia.
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Daftar periksa</h2>
            <ul className="mt-4 space-y-3 text-sm text-secondary">
              {[
                'Versi tulisan resmi tersedia',
                'Judul dan teaser siap',
                'Caption siap',
                'Tag siap',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-status-warning">
                    ○
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-5 w-full" disabled>
              Buat Paket Publish
            </Button>
            <p className="mt-2 text-xs leading-5 text-muted">
              Paket terbit belum tersedia untuk bab ini.
            </p>
          </Card>
        </aside>
      </section>
    </main>
  );
}

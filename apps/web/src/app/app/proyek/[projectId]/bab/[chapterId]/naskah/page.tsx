import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CapabilityNotice } from '../../../../../../../components/composites/CapabilityNotice';
import { Badge, Card } from '../../../../../../../components/primitives';
import { CAPABILITIES } from '../../../../../../../lib/frontend/capabilities';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export const dynamic = 'force-dynamic';

export default async function ChapterNaskahPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const capability = CAPABILITIES['chapter.manuscript.view'];
  const writeHref = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/tulis`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">NASKAH BAB</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">
            {context.chapterTitle}
          </h1>
          <p className="mt-2 text-sm font-semibold text-secondary">
            {context.chapterOrdinal === null
              ? context.projectTitle
              : `Bab ${context.chapterOrdinal} · ${context.projectTitle}`}
          </p>
        </div>
        <Badge tone="warning">Belum ada versi resmi</Badge>
      </header>
      <div className="mt-6">
        <CapabilityNotice
          notice={{
            capabilityKey: capability.key,
            reasonCode: 'ACCEPTED_PROSE_REQUIRED',
            nextAction: { label: 'Kembali ke penulisan', href: writeHref },
          }}
        />
      </div>

      <section className="mx-auto mt-8 max-w-3xl">
        <Card className="px-5 py-8 sm:px-10 sm:py-12">
          <div className="border-b border-default pb-5 text-center">
            <p className="text-xs font-extrabold tracking-[0.12em] text-muted">
              Versi tulisan resmi
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-primary">
              {context.chapterTitle}
            </h2>
          </div>
          <div className="py-14 text-center">
            <p className="font-serif text-lg text-primary">Tidak ada naskah yang tersedia</p>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-secondary">
              Naskah yang telah diterima diperlukan untuk menampilkan naskah bab ini. Halaman tidak
              membuat contoh tulisan sebagai pengganti.
            </p>
          </div>
          <nav
            className="flex flex-wrap justify-center gap-3 border-t border-default pt-5"
            aria-label="Navigasi naskah bab"
          >
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface-soft px-4 text-sm font-semibold text-muted"
            >
              Bab sebelumnya
            </span>
            <Link
              href={writeHref}
              className="inline-flex min-h-11 items-center rounded-md border border-active bg-surface px-4 text-sm font-bold text-brand-strong"
            >
              Kembali ke penulisan
            </Link>
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface-soft px-4 text-sm font-semibold text-muted"
            >
              Bab berikutnya
            </span>
          </nav>
          <p className="mt-3 text-center text-xs leading-5 text-muted">
            Urutan bab sebelumnya dan berikutnya belum tersedia dari pembaca naskah.
          </p>
        </Card>
      </section>
    </main>
  );
}

import { notFound } from 'next/navigation';

import { SceneGenerationPanel } from '../../../../../../../components/credits/SceneGenerationPanel';
import { resolveGenerationHarnessAccess } from '../../../../../../../lib/server/preview/generation-harness';
import { findSceneJobState } from '../../../../../../../server/domain/generation';

export const dynamic = 'force-dynamic';

/**
 * M3 generation harness (fail-closed preview surface). Renders the production
 * W3.5 mechanics components against the REAL quote/confirm/job services for
 * the E2E mock driver. The generation-harness boundary refuses production and
 * staging outright and always requires authenticated owner-scoped chapter
 * access; anything else is a non-enumerating 404.
 */
export default async function M3GenerationHarnessPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  const access = await resolveGenerationHarnessAccess(projectId, chapterId);
  if (access.kind !== 'allowed') notFound();

  const jobLookup = await findSceneJobState(projectId, chapterId, null);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 border-b border-border-default pb-4">
        <p className="text-xs font-extrabold tracking-[0.08em] text-text-muted">PERAGA UJI</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-text-primary sm:text-3xl">
          Mekanik proses adegan
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Permukaan khusus lingkungan pengujian untuk memeriksa mekanik penawaran, proses terjadwal,
          dan pemulihan status. Pembuatan adegan otomatis untuk pengguna belum tersedia.
        </p>
      </header>

      <SceneGenerationPanel
        projectId={projectId}
        chapterId={chapterId}
        initialJobRef={jobLookup.kind === 'found' ? jobLookup.jobRef : null}
        initialJob={jobLookup.kind === 'found' ? jobLookup.view : null}
      />
    </main>
  );
}

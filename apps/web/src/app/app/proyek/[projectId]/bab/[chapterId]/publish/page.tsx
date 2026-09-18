import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CopyButton } from '../../../../../../../components/composites/CopyButton';
import { PublishGenerationPanel } from '../../../../../../../components/credits/PublishGenerationPanel';
import { Badge, Card } from '../../../../../../../components/primitives';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';
import { getProjectOutline } from '../../../../../../../server/domain/queries';
import {
  acceptArtifactAction,
  getChapterPublishState,
} from '../../../../../../../server/domain/publish-actions';
import { findPublishJobState } from '../../../../../../../server/domain/publish-generation';

export const dynamic = 'force-dynamic';

function payloadText(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function payloadTags(payload: Record<string, unknown>): string[] {
  const value = payload['tags'];
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
}

export default async function ChapterPublishPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;
  const context = await resolveChapterContext(projectId, chapterId);
  if (context.kind !== 'resolved') notFound();

  const outline = await getProjectOutline(projectId);
  const beats = outline.filter((node) => node.entityType === 'beat' && node.parentId === chapterId);
  const beatTitles = new Map(beats.map((beat) => [beat.id, beat.title] as const));
  const state = await getChapterPublishState(
    projectId,
    chapterId,
    beats.map((beat) => ({ id: beat.id, acceptedProseVersionId: beat.acceptedProseVersionId })),
    beatTitles,
  );
  if (!state) notFound();

  const publishLookup = await findPublishJobState(projectId, null);
  const publishJobRef = publishLookup.kind === 'found' ? publishLookup.jobRef : null;
  const publishJob = publishLookup.kind === 'found' ? publishLookup.view : null;
  const firstAcceptedBeat = beats.find((beat) => beat.acceptedProseVersionId) ?? null;

  const proposal = state.proposal;
  const payload =
    proposal && typeof proposal.payload === 'object' && proposal.payload !== null
      ? (proposal.payload as Record<string, unknown>)
      : {};
  const title = payloadText(payload, 'title');
  const teaser = payloadText(payload, 'teaser');
  const caption = payloadText(payload, 'caption');
  const commentBait = payloadText(payload, 'commentBait');
  const tags = payloadTags(payload);
  const artifactTexts = state.artifacts
    .map((artifact) => {
      const body = artifact.payload as Record<string, unknown>;
      const content =
        payloadText(body, 'markdown') ?? payloadText(body, 'text') ?? payloadText(body, 'content');
      return { id: artifact.id, type: artifact.artifactType, content };
    })
    .filter((artifact) => artifact.content !== null);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">PUBLIKASI</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Paket Publish</h1>
          <p className="mt-2 text-sm font-semibold text-secondary">
            {context.chapterTitle}
            {context.chapterOrdinal === null ? '' : ` • Bab ${context.chapterOrdinal}`} •{' '}
            {context.projectTitle}
          </p>
        </div>
        <Badge tone="info">Tidak mengubah cerita resmi</Badge>
      </header>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {!proposal ? (
            <Card>
              <h2 className="text-lg font-bold text-primary">Belum ada usulan paket</h2>
              <p className="mt-3 text-sm leading-6 text-secondary">
                {state.acceptedBeats > 0
                  ? `Bab ini memiliki ${state.acceptedBeats} adegan resmi, tetapi belum ada usulan paket untuknya.`
                  : 'Usulan paket dibuat dari adegan yang sudah resmi. Tulis dan terima adegan terlebih dahulu.'}
              </p>
              {firstAcceptedBeat ? (
                <div className="mt-5">
                  <PublishGenerationPanel
                    projectId={projectId}
                    beatId={firstAcceptedBeat.id}
                    initialJobRef={publishJobRef}
                    initialJob={publishJob}
                  />
                </div>
              ) : (
                <div className="mt-5">
                  <Link
                    href={`/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/tulis`}
                    className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-xs hover:bg-brand-700"
                  >
                    Ke Ruang Tulis
                  </Link>
                </div>
              )}
            </Card>
          ) : proposal.status === 'pending' ? (
            <div className="space-y-5">
              {[
                ['Judul & teaser', title ?? teaser ?? '—'],
                [
                  'Caption & ajakan komentar',
                  [caption, commentBait].filter(Boolean).join('\n\n') || '—',
                ],
                ['Tag cerita', tags.length > 0 ? tags.join(', ') : '—'],
              ].map(([heading, body]) => (
                <Card key={heading}>
                  <h2 className="text-lg font-bold text-primary">{heading}</h2>
                  <div className="mt-4 whitespace-pre-wrap rounded-md border border-default bg-surface-soft p-4 text-sm leading-6 text-primary">
                    {body}
                  </div>
                </Card>
              ))}
              <Card>
                <h2 className="text-lg font-bold text-primary">Terima paket</h2>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Menerima hanya mengabadikan materi turunan
                  {state.proposalBeatTitle ? ` untuk ${state.proposalBeatTitle}` : ''}. Cerita resmi
                  tidak berubah dan versi kanon tidak naik.
                </p>
                <form action={acceptArtifactAction} className="mt-5">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="chapterId" value={chapterId} />
                  <input type="hidden" name="artifactProposalId" value={proposal.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-brand-700"
                  >
                    Terima paket publish
                  </button>
                </form>
              </Card>
            </div>
          ) : (
            <div className="space-y-5">
              {artifactTexts.length === 0 ? (
                <Card>
                  <h2 className="text-lg font-bold text-primary">Paket diterima</h2>
                  <p className="mt-3 text-sm leading-6 text-secondary">
                    Usulan paket sudah diterima. Salin materi di bawah untuk diterbitkan.
                  </p>
                </Card>
              ) : (
                artifactTexts.map((artifact) => (
                  <Card key={artifact.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-bold text-primary">
                        Paket {artifact.type === 'markdown' ? 'Markdown' : 'Teks'}
                      </h2>
                      <CopyButton text={artifact.content ?? ''} label="Salin" />
                    </div>
                    <div className="mt-4 whitespace-pre-wrap rounded-md border border-default bg-surface-soft p-4 text-sm leading-6 text-primary">
                      {artifact.content}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold text-primary">Pratinjau ponsel</h2>
            <div className="mx-auto mt-5 max-w-64 rounded-[28px] border-4 border-primary bg-surface p-3 shadow-lg">
              <div className="aspect-[9/13] rounded-[18px] bg-surface-soft p-4">
                <div className="h-32 rounded-lg bg-brand-soft" />
                <p className="mt-4 text-sm font-bold text-primary">{context.chapterTitle}</p>
                <p className="mt-2 line-clamp-4 text-xs leading-5 text-secondary">
                  {teaser ?? 'Teaser muncul di sini setelah paket diterima.'}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-primary">Daftar periksa</h2>
            <ul className="mt-4 space-y-3 text-sm text-secondary">
              <li className="flex gap-2">
                <span aria-hidden="true">{state.acceptedBeats > 0 ? '✓' : '○'}</span>
                <span>
                  Versi tulisan resmi tersedia ({state.acceptedBeats}/{state.totalBeats} adegan)
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true">{proposal ? '✓' : '○'}</span>
                <span>Usulan paket tersedia</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true">{proposal?.status === 'accepted' ? '✓' : '○'}</span>
                <span>Paket diterima</span>
              </li>
            </ul>
          </Card>
        </aside>
      </section>
    </main>
  );
}

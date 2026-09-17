'use server';

import { redirect } from 'next/navigation';

import {
  createPublishArtifact,
  type M4ArtifactProposalView,
  type PublishArtifactRecord,
} from '@narraza/application';
import { assertSceneChapterAccess } from './generation';
import { getMyProject } from './queries';
import { getUnitOfWork } from './uow';

export type ChapterPublishState = Readonly<{
  proposal: M4ArtifactProposalView | null;
  proposalBeatTitle: string | null;
  artifacts: readonly PublishArtifactRecord[];
  acceptedBeats: number;
  totalBeats: number;
}>;

/**
 * Publish read model for a chapter: latest artifact proposal when its prose
 * belongs to this chapter, plus materialized artifacts when accepted.
 */
export async function getChapterPublishState(
  projectId: string,
  chapterId: string,
  beats: readonly { id: string; acceptedProseVersionId: string | null }[],
  beatTitles: ReadonlyMap<string, string>,
): Promise<ChapterPublishState | null> {
  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return null;

  const chapterBeatIds = new Set(beats.map((beat) => beat.id));
  const acceptedBeats = beats.filter((beat) => beat.acceptedProseVersionId).length;
  return getUnitOfWork().execute(async (ports) => {
    const reader = ports.m4ProductRead;
    const proposal = reader ? await reader.findLatestArtifactProposal(projectId) : null;
    let proposalBeatTitle: string | null = null;
    let artifacts: readonly PublishArtifactRecord[] = [];
    if (proposal && ports.proseVersion) {
      const version = await ports.proseVersion.findById(projectId, proposal.proseVersionId);
      if (version && chapterBeatIds.has(version.beatId)) {
        proposalBeatTitle = beatTitles.get(version.beatId) ?? null;
      }
    }
    if (proposal && proposal.status === 'accepted' && ports.artifactProposal) {
      artifacts = await ports.artifactProposal.listArtifacts(projectId, proposal.id);
    }
    return { proposal, proposalBeatTitle, artifacts, acceptedBeats, totalBeats: beats.length };
  });
}

export async function acceptArtifactAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const artifactProposalId = String(formData.get('artifactProposalId') ?? '');
  const back = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/publish`;
  if (!projectId || !chapterId || !artifactProposalId) redirect(back);

  const project = await getMyProject(projectId);
  if (!project) redirect(back);

  const publish = createPublishArtifact(getUnitOfWork());
  await publish({
    ownerUserId: project.ownerUserId,
    projectId,
    artifactProposalId,
    requestId: `${projectId}:${artifactProposalId}`,
  });
  redirect(back);
}

export type NaskahEntry = Readonly<{
  beatId: string;
  beatTitle: string;
  revision: number;
  content: string;
}>;

/** Accepted prose per beat for manuscript reading (read-only, no canon effect). */
export async function getNaskahEntries(
  projectId: string,
  beats: readonly { id: string; title: string; acceptedProseVersionId: string | null }[],
): Promise<NaskahEntry[] | null> {
  const project = await getMyProject(projectId);
  if (!project) return null;

  const accepted = beats.filter(
    (beat): beat is { id: string; title: string; acceptedProseVersionId: string } =>
      beat.acceptedProseVersionId !== null,
  );
  if (accepted.length === 0) return [];
  return getUnitOfWork().execute(async (ports) => {
    if (!ports.proseVersion) return [];
    const entries: NaskahEntry[] = [];
    for (const beat of accepted) {
      const version = await ports.proseVersion.findById(projectId, beat.acceptedProseVersionId);
      if (version) {
        entries.push({
          beatId: beat.id,
          beatTitle: beat.title,
          revision: version.revision,
          content: version.content,
        });
      }
    }
    return entries;
  });
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject, getProjectFoundation } from '../../../../../server/domain/queries';
import { FoundationForms } from './foundation-forms';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numStr(value: unknown, fallback = ''): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}

export default async function FoundationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const foundation = await getProjectFoundation(projectId);

  const payload = asRecord(foundation?.payload);
  const main = asRecord(payload.mainCharacter);
  const relationships = Array.isArray(payload.relationships) ? payload.relationships : [];
  const firstRel = asRecord(relationships[0]);
  const secrets = Array.isArray(payload.secrets) ? payload.secrets : [];
  const firstSecret = asRecord(secrets[0]);
  const target = asRecord(firstSecret.targetPosition);
  const breadcrumbs = Array.isArray(firstSecret.breadcrumbPositions)
    ? firstSecret.breadcrumbPositions
    : [];
  const bc1 = asRecord(breadcrumbs[0]);
  const bc2 = asRecord(breadcrumbs[1]);

  const otherId =
    str(firstRel.fromCharacterId) === str(main.id)
      ? str(firstRel.toCharacterId)
      : str(firstRel.fromCharacterId) || str(firstRel.toCharacterId);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700">
        ← {project.title}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Fondasi cerita</h1>
      <p className="mt-2 text-sm text-[#76656d]">
        Status: {foundation?.status ?? 'belum ada'}
        {foundation ? ` · rev ${foundation.revision}` : ''}
      </p>

      <FoundationForms
        projectId={projectId}
        status={foundation?.status ?? null}
        revision={foundation?.revision ?? null}
        coreConcept={str(payload.coreConcept)}
        conflict={str(payload.conflict)}
        endingDirection={str(payload.endingDirection)}
        readerPromise={str(payload.readerPromise)}
        mainCharacterId={str(main.id) || 'main'}
        mainCharacterIdentity={str(main.identity)}
        mainCharacterGoal={str(main.goal)}
        mainCharacterMotivation={str(main.motivation)}
        mainCharacterAddress={str(main.address)}
        mainCharacterSpeechStyle={str(main.speechStyle)}
        relationshipOtherId={otherId || 'other'}
        relationshipDescription={str(firstRel.description)}
        secretTruth={str(firstSecret.truth)}
        secretTargetChapterId={str(target.chapterId) || 'chapter-10'}
        secretTargetSequence={numStr(target.sequence, '10')}
        secretBreadcrumb1ChapterId={str(bc1.chapterId) || 'chapter-2'}
        secretBreadcrumb1Sequence={numStr(bc1.sequence, '2')}
        secretBreadcrumb2ChapterId={str(bc2.chapterId) || 'chapter-5'}
        secretBreadcrumb2Sequence={numStr(bc2.sequence, '5')}
      />
    </main>
  );
}

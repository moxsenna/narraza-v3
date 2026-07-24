import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMyProject,
  getProjectFoundation,
} from '../../../../../server/domain/queries';
import { FoundationForms } from './foundation-forms';

export default async function FoundationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getMyProject(projectId);
  if (!project) notFound();
  const foundation = await getProjectFoundation(projectId);

  const payload = (foundation?.payload ?? {}) as Record<string, unknown>;

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
        coreConcept={typeof payload.coreConcept === 'string' ? payload.coreConcept : ''}
        conflict={typeof payload.conflict === 'string' ? payload.conflict : ''}
        endingDirection={
          typeof payload.endingDirection === 'string' ? payload.endingDirection : ''
        }
        readerPromise={typeof payload.readerPromise === 'string' ? payload.readerPromise : ''}
      />
    </main>
  );
}

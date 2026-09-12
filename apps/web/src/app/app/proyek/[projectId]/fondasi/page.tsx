import Link from 'next/link';
import { notFound } from 'next/navigation';
import { makeFoundationReadinessViewModel } from '../../../../../lib/server/foundation-readiness-view-model';
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

  const mainId = str(main.id);
  const fromCharacterId = str(firstRel.fromCharacterId);
  const toCharacterId = str(firstRel.toCharacterId);
  const relationshipMainIsFrom =
    mainId && fromCharacterId && toCharacterId
      ? fromCharacterId === mainId
        ? true
        : toCharacterId === mainId
          ? false
          : null
      : null;
  const otherId =
    relationshipMainIsFrom === true
      ? toCharacterId
      : relationshipMainIsFrom === false
        ? fromCharacterId
        : '';

  const status = foundation?.status ?? 'belum ada';
  const readiness = makeFoundationReadinessViewModel(foundation?.payload ?? null);

  return (
    <main className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-6 sm:py-9">
      {/* Header Section - Using Semantic Colors */}
      <Link
        href={`/app/proyek/${projectId}`}
        className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors"
      >
        ← {project.title}
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">DASAR CERITA</p>
          <h1 className="mt-2 text-3xl font-bold">Fondasi Cerita</h1>
        </div>

        {foundation?.status && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              foundation.status === 'locked'
                ? 'bg-brand-100 text-brand-800'
                : foundation.status === 'confirmed'
                  ? 'bg-status-warning-soft text-status-warning'
                  : 'bg-surface-soft text-ink-800'
            }`}
          >
            {foundation.status}
          </span>
        )}
      </div>

      {/* Status & Revision - Neutral Text Palette */}
      <p className="mt-2 text-sm text-text-muted">
        {status === 'locked'
          ? 'Fondasi sudah dikunci.'
          : 'Tinjau dan lengkapi bahan penting sebelum mengunci fondasi.'}
      </p>

      <section
        className="mt-6 rounded-xl border border-default bg-brand-soft p-5"
        aria-labelledby="foundation-readiness"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="foundation-readiness" className="font-bold text-primary">
            Kesiapan fondasi
          </h2>
          {readiness.available ? (
            <span className="text-xl font-bold text-brand-strong">{readiness.percent}%</span>
          ) : null}
        </div>
        {readiness.available ? (
          <>
            <div
              className="mt-3 h-2 overflow-hidden rounded-pill bg-surface"
              role="progressbar"
              aria-label="Persentase kesiapan fondasi"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={readiness.percent}
            >
              <div
                className="h-full rounded-pill bg-brand-strong"
                style={{ width: `${readiness.percent}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-secondary">{readiness.recommendation}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {readiness.checklist.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm"
                >
                  <span
                    className={
                      item.complete ? 'font-semibold text-status-success' : 'text-secondary'
                    }
                  >
                    {item.label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted">
                    {item.earned}/{item.weight}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-secondary">{readiness.message}</p>
        )}
      </section>

      <h2 className="mt-8 text-xl font-bold text-primary">Dasar cerita</h2>

      {/* Form Section */}
      <FoundationForms
        projectId={projectId}
        status={foundation?.status ?? null}
        revision={foundation?.revision ?? null}
        coreConcept={str(payload.coreConcept)}
        conflict={str(payload.conflict)}
        endingDirection={str(payload.endingDirection)}
        readerPromise={str(payload.readerPromise)}
        mainCharacterId={mainId}
        mainCharacterIdentity={str(main.identity)}
        mainCharacterGoal={str(main.goal)}
        mainCharacterMotivation={str(main.motivation)}
        mainCharacterAddress={str(main.address)}
        mainCharacterSpeechStyle={str(main.speechStyle)}
        relationshipOtherId={otherId}
        relationshipMainIsFrom={relationshipMainIsFrom}
        relationshipDescription={str(firstRel.description)}
        secretTruth={str(firstSecret.truth)}
        secretTargetChapterId={str(target.chapterId)}
        secretTargetSequence={numStr(target.sequence)}
        secretBreadcrumb1ChapterId={str(bc1.chapterId)}
        secretBreadcrumb1Sequence={numStr(bc1.sequence)}
        secretBreadcrumb2ChapterId={str(bc2.chapterId)}
        secretBreadcrumb2Sequence={numStr(bc2.sequence)}
      />
    </main>
  );
}

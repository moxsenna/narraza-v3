'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';

import {
  createOverrideFinding,
  createValidateProseVersion,
  M5_VALIDATION_POLICY_VERSION,
  toPublicValidationView,
  type PublicValidationView,
} from '@narraza/application';
import { assertSceneChapterAccess } from './generation';
import { getUnitOfWork } from './uow';

export type CekState = Readonly<{
  proseVersionId: string | null;
  beatTitle: string | null;
  view: PublicValidationView | null;
}>;

/**
 * Check-room read model: latest snapshot version project-wide, valid only
 * when it belongs to this chapter. Report lookup is hash-bound (stale edits
 * surface as missing-current, never as fresh).
 */
export async function getCekState(
  projectId: string,
  chapterId: string,
  chapterBeatIds: ReadonlySet<string>,
  beatTitles: ReadonlyMap<string, string>,
): Promise<CekState | null> {
  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return null;

  const unitOfWork = getUnitOfWork();
  const version = await unitOfWork.execute(async (ports) => {
    if (!ports.m4ProductRead) return null;
    return ports.m4ProductRead.findLatestProseVersion(projectId);
  });
  if (!version || !chapterBeatIds.has(version.beatId)) {
    return { proseVersionId: null, beatTitle: null, view: null };
  }

  const checked = await unitOfWork.execute(async (ports) => {
    if (!ports.validationReport || !ports.validationFinding) return null;
    const contentHash = createHash('sha256').update(version.content, 'utf8').digest('hex');
    const report = await ports.validationReport.findCurrent(
      projectId,
      version.id,
      contentHash,
      M5_VALIDATION_POLICY_VERSION,
    );
    if (!report) return null;
    const findings = await ports.validationFinding.listByReport(projectId, report.id);
    return { report, findings };
  });
  if (!checked) {
    return {
      proseVersionId: version.id,
      beatTitle: beatTitles.get(version.beatId) ?? null,
      view: null,
    };
  }
  return {
    proseVersionId: version.id,
    beatTitle: beatTitles.get(version.beatId) ?? null,
    view: toPublicValidationView(checked.report, checked.findings, { current: true }),
  };
}

export type ValidationRunState =
  { readonly kind: 'checked' } | { readonly kind: 'error'; readonly message: string };

export async function runValidationAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const proseVersionId = String(formData.get('proseVersionId') ?? '');
  if (!projectId || !chapterId || !proseVersionId) return;

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return;

  const validate = createValidateProseVersion(getUnitOfWork());
  await validate({
    ownerUserId: access.userId,
    projectId,
    proseVersionId,
  });
}

export async function overrideFindingAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const reportId = String(formData.get('reportId') ?? '');
  const findingId = String(formData.get('findingId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const back = `/app/proyek/${encodeURIComponent(projectId)}/bab/${encodeURIComponent(chapterId)}/cek`;
  if (!projectId || !chapterId || !reportId || !findingId || !reason) {
    redirect(`${back}?override=error`);
  }

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') redirect(`${back}?override=error`);

  const override = createOverrideFinding(getUnitOfWork());
  const result = await override({
    ownerUserId: access.userId,
    projectId,
    reportId,
    findingId,
    reason,
  });
  redirect(`${back}?override=${result.ok ? 'ok' : 'denied'}`);
}

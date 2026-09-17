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

/**
 * Indonesian display copy for deterministic finding codes. Codes stay the
 * transport contract (core); this map is presentation only. Unknown codes
 * fall back to the rule key so no finding ever renders blank.
 */
const FINDING_COPY: Record<string, { title: string; detail: string }> = {
  'validation.prose.empty': {
    title: 'Naskah masih kosong',
    detail: 'Tulis atau terapkan kandidat dulu sebelum diperiksa.',
  },
  'validation.length.out_of_range': {
    title: 'Panjang naskah di luar rentang',
    detail: 'Sesuaikan dengan target kata adegan.',
  },
  'validation.character.required_missing': {
    title: 'Tokoh wajib belum muncul',
    detail: 'Hadirkan tokoh yang dituntut arahan adegan.',
  },
  'validation.character.semantic_review': {
    title: 'Kehadiran tokoh perlu ditinjau',
    detail: 'Periksa apakah tokoh tampil sesuai arahan.',
  },
  'validation.fact.required_missing': {
    title: 'Fakta wajib belum dipakai',
    detail: 'Sertakan fakta yang dituntut arahan adegan.',
  },
  'validation.fact.semantic_review': {
    title: 'Fakta perlu ditinjau',
    detail: 'Periksa pemakaian fakta terhadap arahan.',
  },
  'validation.directive.required_missing': {
    title: 'Arahan belum dijalankan',
    detail: 'Ikuti arahan adegan yang tercantum.',
  },
  'validation.directive.semantic_review': {
    title: 'Arahan perlu ditinjau',
    detail: 'Periksa kepatuhan naskah terhadap arahan.',
  },
  'validation.ending.required_missing': {
    title: 'Ending hook belum ada',
    detail: 'Tutup adegan dengan hook sesuai arahan.',
  },
  'validation.ending.semantic_review': {
    title: 'Ending perlu ditinjau',
    detail: 'Periksa kekuatan penutup adegan.',
  },
  'validation.action.prohibited_present': {
    title: 'Aksi terlarang terdeteksi',
    detail: 'Hapus aksi yang dilarang arahan adegan.',
  },
  'validation.action.semantic_review': {
    title: 'Aksi perlu ditinjau',
    detail: 'Periksa aksi tokoh terhadap batasan arahan.',
  },
  'validation.restricted.exact': {
    title: 'Rahasia bocor persis',
    detail: 'Bagian ini memuat rahasia yang belum boleh terbuka. Tulis ulang tanpa detailnya.',
  },
  'validation.restricted.alias': {
    title: 'Rahasia bocor tersamar',
    detail: 'Bagian ini menyiratkan rahasia yang belum boleh terbuka.',
  },
  'validation.restricted.suspected': {
    title: 'Dugaan kebocoran rahasia',
    detail: 'Periksa apakah bagian ini membocorkan rahasia.',
  },
  'validation.restricted.semantic_review': {
    title: 'Rahasia perlu ditinjau',
    detail: 'Periksa keamanan rahasia pada bagian ini.',
  },
  'validation.reveal.too_early': {
    title: 'Rahasia terbuka terlalu dini',
    detail: 'Tahan jawaban sampai jadwal yang ditentukan.',
  },
  'model.claims.pass': { title: 'Lolos', detail: 'Tidak perlu tindakan.' },
};

export function findingCopy(code: string): { title: string; detail: string } {
  return FINDING_COPY[code] ?? { title: `Temuan ${code}`, detail: 'Periksa bagian ini.' };
}

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

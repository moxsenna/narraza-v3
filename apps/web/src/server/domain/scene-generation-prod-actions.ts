'use server';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import {
  assertSceneChapterAccess,
  cancelSceneGenerationJob,
  confirmSceneGenerationQuote,
  findSceneJobState,
  issueSceneGenerationQuote,
} from './generation';

export type ProdQuoteRequestState =
  | {
      readonly kind: 'quoted';
      readonly quote: Readonly<{
        quoteId: string;
        maxCredits: number;
        availableCredits: number;
        expiresAtIso: string;
      }>;
    }
  | { readonly kind: 'active_job'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'error'; readonly message: string };

export type ProdQuoteConfirmState =
  | { readonly kind: 'job_started'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'quote_expired'; readonly message: string }
  | { readonly kind: 'insufficient_credit'; readonly message: string }
  | { readonly kind: 'stale_plan'; readonly message: string }
  | { readonly kind: 'already_consumed'; readonly message: string }
  | { readonly kind: 'active_job'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'error'; readonly message: string };

export type ProdJobCancelState =
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'cancel_requested'; readonly message: string }
  | { readonly kind: 'not_active'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export type ProdJobStateResult =
  | { readonly kind: 'active'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'terminal'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'error'; readonly message: string };

const NOT_FOUND_MESSAGE = 'Halaman tidak ditemukan.';
const AMBIGUOUS_MESSAGE =
  'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.';

/**
 * Production scene-generation mutations. Same chain as the preview harness
 * actions, but gated by real tenant chapter access (assertSceneChapterAccess)
 * instead of the preview-harness gate. Paid action with D4 quote + explicit
 * confirm; D14 model-policy enforced downstream; zero-charge on failure.
 */
export async function requestProdSceneQuoteAction(
  _prev: ProdQuoteRequestState | null,
  formData: FormData,
): Promise<ProdQuoteRequestState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  if (!projectId || !chapterId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await issueSceneGenerationQuote(projectId, chapterId, access.userId);
  switch (result.kind) {
    case 'issued':
      return {
        kind: 'quoted',
        quote: {
          quoteId: result.quoteId,
          maxCredits: result.maxCredits,
          availableCredits: result.availableCredits,
          expiresAtIso: result.expiresAtIso,
        },
      };
    case 'active_job':
      return { kind: 'active_job', jobRef: result.jobRef, job: result.view };
    case 'ambiguous':
      return { kind: 'ambiguous' };
    default:
      return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }
}

export async function confirmProdSceneQuoteAction(
  _prev: ProdQuoteConfirmState | null,
  formData: FormData,
): Promise<ProdQuoteConfirmState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const quoteId = String(formData.get('quoteId') ?? '');
  if (!projectId || !chapterId || !quoteId) {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await confirmSceneGenerationQuote(projectId, chapterId, access.userId, quoteId);
  switch (result.kind) {
    case 'started':
      return { kind: 'job_started', jobRef: result.jobRef, job: result.view };
    case 'expired':
      return {
        kind: 'quote_expired',
        message: 'Penawaran sudah kedaluwarsa. Minta penawaran baru untuk melanjutkan.',
      };
    case 'insufficient_credit':
      return {
        kind: 'insufficient_credit',
        message: 'Saldo kreditmu belum cukup untuk memproses adegan ini.',
      };
    case 'stale_plan':
      return {
        kind: 'stale_plan',
        message: 'Rencana adegan berubah sejak penawaran dibuat. Minta penawaran baru.',
      };
    case 'already_consumed':
      return {
        kind: 'already_consumed',
        message:
          'Penawaran ini sudah dikonfirmasi. Muat ulang halaman untuk melihat proses terkini.',
      };
    default:
      return { kind: 'error', message: 'Konfirmasi tidak dapat diproses. Coba lagi sebentar.' };
  }
}

/** Polled read: the server stays the sole authority over job state. */
export async function getProdSceneJobStateAction(
  projectId: string,
  chapterId: string,
  jobRef: string | null,
): Promise<ProdJobStateResult> {
  if (!projectId || !chapterId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const lookup = await findSceneJobState(projectId, chapterId, jobRef);
  switch (lookup.kind) {
    case 'found':
      return isTerminalJobView(lookup.view)
        ? { kind: 'terminal', jobRef: lookup.jobRef, job: lookup.view }
        : { kind: 'active', jobRef: lookup.jobRef, job: lookup.view };
    case 'none':
      return { kind: 'none' };
    case 'ambiguous':
      return { kind: 'ambiguous' };
  }
}

export async function cancelProdSceneJobAction(
  _prev: ProdJobCancelState | null,
  formData: FormData,
): Promise<ProdJobCancelState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  if (!projectId || !chapterId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await cancelSceneGenerationJob(projectId, chapterId);
  switch (result.kind) {
    case 'cancelled':
      return { kind: 'cancelled', message: 'Proses dibatalkan. Kreditmu tidak dipotong.' };
    case 'cancel_requested':
      return {
        kind: 'cancel_requested',
        message: 'Pembatalan diminta. Proses akan berhenti sebentar lagi.',
      };
    case 'not_active':
      return { kind: 'not_active', message: 'Tidak ada proses yang sedang berjalan.' };
    case 'ambiguous':
      return { kind: 'error', message: AMBIGUOUS_MESSAGE };
    default:
      return { kind: 'error', message: 'Pembatalan tidak dapat diproses. Coba lagi sebentar.' };
  }
}

function isTerminalJobView(view: JobPublicView): boolean {
  return view.phase !== 'queued' && view.phase !== 'running';
}

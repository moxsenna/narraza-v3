'use server';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import {
  assertPublishProjectAccess,
  cancelPublishGenerationJob,
  confirmPublishGenerationQuote,
  findPublishJobState,
  issuePublishGenerationQuote,
} from './publish-generation';

export type PublishQuoteRequestState =
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

export type PublishQuoteConfirmState =
  | { readonly kind: 'job_started'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'quote_expired'; readonly message: string }
  | { readonly kind: 'insufficient_credit'; readonly message: string }
  | { readonly kind: 'stale_plan'; readonly message: string }
  | { readonly kind: 'already_consumed'; readonly message: string }
  | { readonly kind: 'active_job'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'error'; readonly message: string };

export type PublishJobCancelState =
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'cancel_requested'; readonly message: string }
  | { readonly kind: 'not_active'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export type PublishJobStateResult =
  | { readonly kind: 'active'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'terminal'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'error'; readonly message: string };

const NOT_FOUND_MESSAGE = 'Halaman tidak ditemukan.';
const AMBIGUOUS_MESSAGE =
  'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.';

export async function requestPublishGenerationQuoteAction(
  _prev: PublishQuoteRequestState | null,
  formData: FormData,
): Promise<PublishQuoteRequestState> {
  const projectId = String(formData.get('projectId') ?? '');
  const beatId = String(formData.get('beatId') ?? '');
  if (!projectId || !beatId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertPublishProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await issuePublishGenerationQuote(projectId, access.userId, beatId);
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
    case 'prerequisite':
    case 'unsupported':
      return { kind: 'error', message: result.message };
    default:
      return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }
}

export async function confirmPublishGenerationQuoteAction(
  _prev: PublishQuoteConfirmState | null,
  formData: FormData,
): Promise<PublishQuoteConfirmState> {
  const projectId = String(formData.get('projectId') ?? '');
  const quoteId = String(formData.get('quoteId') ?? '');
  if (!projectId || !quoteId) {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const access = await assertPublishProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await confirmPublishGenerationQuote(projectId, access.userId, quoteId);
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
        message: 'Saldo kreditmu belum cukup untuk pembuatan paket ini.',
      };
    case 'stale_plan':
      return {
        kind: 'stale_plan',
        message: 'Kondisi naskah berubah sejak penawaran dibuat. Minta penawaran baru.',
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
export async function getPublishJobStateAction(
  projectId: string,
  jobRef: string | null,
): Promise<PublishJobStateResult> {
  if (!projectId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertPublishProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const lookup = await findPublishJobState(projectId, jobRef);
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

export async function cancelPublishGenerationJobAction(
  _prev: PublishJobCancelState | null,
  formData: FormData,
): Promise<PublishJobCancelState> {
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertPublishProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await cancelPublishGenerationJob(projectId);
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

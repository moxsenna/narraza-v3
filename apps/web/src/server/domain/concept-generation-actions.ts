'use server';

import { redirect } from 'next/navigation';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import {
  acceptConceptChoice,
  assertConceptProjectAccess,
  cancelConceptGenerationJob,
  confirmConceptGenerationQuote,
  findConceptJobState,
  issueConceptGenerationQuote,
} from './concept-generation';

export type ConceptQuoteRequestState =
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

export type ConceptQuoteConfirmState =
  | { readonly kind: 'job_started'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'quote_expired'; readonly message: string }
  | { readonly kind: 'insufficient_credit'; readonly message: string }
  | { readonly kind: 'stale_plan'; readonly message: string }
  | { readonly kind: 'already_consumed'; readonly message: string }
  | { readonly kind: 'active_job'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'error'; readonly message: string };

export type ConceptJobCancelState =
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'cancel_requested'; readonly message: string }
  | { readonly kind: 'not_active'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export type ConceptJobStateResult =
  | { readonly kind: 'active'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'terminal'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'error'; readonly message: string };

export type ConceptChooseState =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'stale'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

const NOT_FOUND_MESSAGE = 'Halaman tidak ditemukan.';
const AMBIGUOUS_MESSAGE =
  'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.';

export async function requestConceptGenerationQuoteAction(
  _prev: ConceptQuoteRequestState | null,
  formData: FormData,
): Promise<ConceptQuoteRequestState> {
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  // Production gate: real tenant auth (no preview-harness gate). Paid action
  // with D4 quote + explicit confirm; D14 model-policy enforced downstream.
  const access = await assertConceptProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await issueConceptGenerationQuote(projectId, access.userId);
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

export async function confirmConceptGenerationQuoteAction(
  _prev: ConceptQuoteConfirmState | null,
  formData: FormData,
): Promise<ConceptQuoteConfirmState> {
  const projectId = String(formData.get('projectId') ?? '');
  const quoteId = String(formData.get('quoteId') ?? '');
  if (!projectId || !quoteId) {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const access = await assertConceptProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await confirmConceptGenerationQuote(projectId, access.userId, quoteId);
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
        message: 'Saldo kreditmu belum cukup untuk menyusun konsep.',
      };
    case 'stale_plan':
      return {
        kind: 'stale_plan',
        message: 'Kondisi proyek berubah sejak penawaran dibuat. Minta penawaran baru.',
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
export async function getConceptJobStateAction(
  projectId: string,
  jobRef: string | null,
): Promise<ConceptJobStateResult> {
  if (!projectId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertConceptProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const lookup = await findConceptJobState(projectId, jobRef);
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

export async function cancelConceptGenerationJobAction(
  _prev: ConceptJobCancelState | null,
  formData: FormData,
): Promise<ConceptJobCancelState> {
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertConceptProjectAccess(projectId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const result = await cancelConceptGenerationJob(projectId);
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

export async function chooseConceptAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const conceptId = String(formData.get('conceptId') ?? '');
  if (!projectId || !conceptId) return;

  const access = await assertConceptProjectAccess(projectId);
  if (access.kind !== 'allowed') return;

  const result = await acceptConceptChoice(projectId, access.userId, conceptId);
  if (result.kind !== 'accepted') return;
  redirect(`/app/proyek/${encodeURIComponent(projectId)}/fondasi`);
}

function isTerminalJobView(view: JobPublicView): boolean {
  return view.phase !== 'queued' && view.phase !== 'running';
}

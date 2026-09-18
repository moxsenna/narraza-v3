'use server';

import { randomUUID } from 'node:crypto';
import {
  createCreditQuoteConfirmationService,
  createCreditSummaryService,
  createJobService,
  createPaidGenerationPreparationService,
  microIdrToCreditsCeil,
  seedMockPriceSnapshots,
  buildBeatValidatorPacket,
  buildBeatWriterPacket,
  prodDependencyEntries,
  prodDependencyHash,
  prodRecoveryPacket,
  type GenerationJobRecord,
} from '@narraza/application';
import type { JobPublicView } from '../../lib/frontend/job-phase';
import { isNonterminalPhase } from '../../lib/frontend/job-phase';
import { deriveM4ConfirmationIdentity } from '../../lib/server/confirmation-identity';
import { toJobPublicView } from '../../lib/server/generation-view-model';
import { MOCK_PAID_PROFILE, mockPriceSnapshots, mockProfileAllowed } from './paid-profile';
import { assertSceneChapterAccess } from './generation';
import { getUnitOfWork } from './uow';

import type {
  ChapterJobStateResult,
  JobCancelState,
  QuoteConfirmState,
  QuoteRequestState,
} from './generation-actions';

const NOT_FOUND_MESSAGE = 'Halaman tidak ditemukan.';
const AMBIGUOUS_MESSAGE =
  'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.';

/**
 * Production scene-generation mutations. Same chain as the preview harness
 * actions, but gated by real tenant chapter access (assertSceneChapterAccess)
 * instead of the preview-harness gate. Paid action with D4 quote + explicit
 * confirm; D14 model-policy enforced downstream; zero-charge on failure.
 */
/**
 * Production beat-write mutations executed as `beat_write_judge` (the kind
 * the worker supports). Billing labels stay `scene_generation` so ledger
 * history keeps meaning; only the executed job kind changes. Gated by real
 * tenant chapter access; D4 quote + explicit confirm; mock profile outside
 * production (production refuses until nine-router routing lands).
 */
import { BEAT_WRITE_JOB_KIND } from './paid-profile';
const BEAT_BILLING_ACTION_KIND = 'scene_generation';

function resolveBeatTitle(beat: { title: string; payload: unknown }): string {
  const node =
    beat.payload && typeof beat.payload === 'object' && !Array.isArray(beat.payload)
      ? (beat.payload as Record<string, unknown>)['node']
      : undefined;
  const nested =
    node && typeof node === 'object' && !Array.isArray(node)
      ? (node as Record<string, unknown>)['title']
      : undefined;
  const title = typeof nested === 'string' && nested.trim() ? nested : beat.title;
  return title.trim() ? title : 'Adegan';
}

function jobInChapter(job: GenerationJobRecord, chapterId: string): boolean {
  const payload = job.payload as Record<string, unknown>;
  return payload['chapterId'] === chapterId;
}

type BeatJobLookup =
  | { readonly kind: 'found'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous' };

async function findBeatJobState(
  projectId: string,
  chapterId: string,
  jobRef: string | null,
): Promise<BeatJobLookup> {
  const unitOfWork = getUnitOfWork();
  if (jobRef !== null) {
    return unitOfWork.execute(async (ports) => {
      const job = await ports.job.findById({ projectId, jobId: jobRef });
      if (!job || job.kind !== BEAT_WRITE_JOB_KIND || !jobInChapter(job, chapterId)) {
        return { kind: 'none' };
      }
      return { kind: 'found', jobRef: job.id, view: await toJobPublicView(ports, job) };
    });
  }
  const activeJobs = await unitOfWork.execute((ports) => ports.job.listActiveByProject(projectId));
  const beatJobs = activeJobs.filter(
    (job) => job.kind === BEAT_WRITE_JOB_KIND && jobInChapter(job, chapterId),
  );
  if (beatJobs.length > 1) return { kind: 'ambiguous' };
  const beatJob = beatJobs[0];
  if (!beatJob) {
    const latestTerminal = await unitOfWork.execute((ports) =>
      ports.job.findLatestTerminalByProject({
        projectId,
        kind: BEAT_WRITE_JOB_KIND,
        payloadFilter: { chapterId },
      }),
    );
    if (!latestTerminal) return { kind: 'none' };
    const terminalView = await unitOfWork.execute((ports) =>
      toJobPublicView(ports, latestTerminal),
    );
    return { kind: 'found', jobRef: latestTerminal.id, view: terminalView };
  }
  const view = await unitOfWork.execute((ports) => toJobPublicView(ports, beatJob));
  return { kind: 'found', jobRef: beatJob.id, view: { ...view, recovered: true } };
}

export async function requestProdSceneQuoteAction(
  _prev: QuoteRequestState | null,
  formData: FormData,
): Promise<QuoteRequestState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  if (!projectId || !chapterId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const lookup = await findBeatJobState(projectId, chapterId, null);
  if (lookup.kind === 'found' && isNonterminalPhase(lookup.view.phase)) {
    return { kind: 'active_job', jobRef: lookup.jobRef, job: lookup.view };
  }
  if (lookup.kind === 'ambiguous') return { kind: 'ambiguous' };
  if (!mockProfileAllowed()) {
    return {
      kind: 'error',
      message: 'Penulisan adegan berbayar belum tersedia di lingkungan ini.',
    };
  }

  const unitOfWork = getUnitOfWork();
  await seedMockPriceSnapshots(unitOfWork);
  const prepared = await unitOfWork.execute(async (ports) => {
    const outline = await ports.outline.listByProject(projectId);
    const entries = prodDependencyEntries(outline);
    const openBeats = outline
      .filter((node) => node.entityType === 'beat' && node.parentId === chapterId)
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .filter((beat) => !beat.acceptedProseVersionId);
    const open = openBeats[0];
    if (!open) return null;
    let draftContent = '';
    let draftVersionId = `draft:pending:${open.id}`;
    if (ports.proseDraft) {
      const draft = await ports.proseDraft.findActive(projectId, access.userId, open.id);
      if (draft) {
        draftContent = draft.content;
        draftVersionId = draft.id;
      }
    }
    return {
      entries,
      beatId: open.id,
      beatTitle: resolveBeatTitle(open),
      draftContent,
      draftVersionId,
    };
  });
  if (!prepared) {
    return {
      kind: 'error',
      message: 'Semua adegan bab ini sudah memiliki naskah resmi.',
    };
  }

  const dependencyHash = prodDependencyHash(prepared.entries);
  const writer = buildBeatWriterPacket({
    projectId,
    dependencyHash,
    beatId: prepared.beatId,
    beatTitle: prepared.beatTitle,
  });
  const validator = buildBeatValidatorPacket({
    projectId,
    dependencyHash,
    beatId: prepared.beatId,
    beatTitle: prepared.beatTitle,
    proseVersionId: prepared.draftVersionId,
    proseBeatId: prepared.beatId,
    proseContent: prepared.draftContent,
  });
  if (writer.kind !== 'ok' || validator.kind !== 'ok') {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const prepare = createPaidGenerationPreparationService({ unitOfWork });
  const result = await prepare.prepare({
    projectId,
    workflowKind: BEAT_WRITE_JOB_KIND,
    bundleId: randomUUID(),
    planId: randomUUID(),
    bundle: {
      workflowKind: BEAT_WRITE_JOB_KIND,
      dependencyEntries: prepared.entries,
      packets: [
        writer.packet,
        validator.packet,
        prodRecoveryPacket(projectId, dependencyHash, BEAT_WRITE_JOB_KIND),
      ],
    },
    profile: MOCK_PAID_PROFILE,
    priceSnapshots: mockPriceSnapshots(),
    userId: access.userId,
    actionKind: BEAT_BILLING_ACTION_KIND,
    issuanceRequestId: randomUUID(),
  });

  switch (result.kind) {
    case 'prepared':
    case 'replayed': {
      const summary = createCreditSummaryService(getUnitOfWork());
      const balance = await summary.getSummary({ userId: access.userId });
      return {
        kind: 'quoted',
        quote: {
          quoteId: result.quote.id,
          maxCredits: Number(microIdrToCreditsCeil(result.quote.maxAmountMicroIdr)),
          availableCredits: Number(balance.available),
          expiresAtIso: result.quote.expiresAt.toISOString(),
        },
      };
    }
    default:
      return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }
}

export async function confirmProdSceneQuoteAction(
  _prev: QuoteConfirmState | null,
  formData: FormData,
): Promise<QuoteConfirmState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  const quoteId = String(formData.get('quoteId') ?? '');
  if (!projectId || !chapterId || !quoteId) {
    return { kind: 'error', message: NOT_FOUND_MESSAGE };
  }

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const unitOfWork = getUnitOfWork();
  const binding = await unitOfWork.execute(async (ports) => {
    const quote = await ports.quote.findById(quoteId);
    if (!quote || quote.projectId !== projectId) return null;
    if (!ports.workflowPlan) return null;
    const plan = await ports.workflowPlan.findPlanByHash(projectId, quote.workflowPlanHash);
    if (!plan || plan.bundleId.length === 0 || plan.workflowKind !== BEAT_WRITE_JOB_KIND) {
      return null;
    }
    const outline = await ports.outline.listByProject(projectId);
    const current = prodDependencyHash(prodDependencyEntries(outline));
    if (current !== quote.dependencyHash) return 'stale' as const;
    return {
      workflowPlanHash: quote.workflowPlanHash,
      dependencyHash: quote.dependencyHash,
      bundleId: plan.bundleId,
      workflowPlanId: plan.id,
    };
  });
  if (!binding) return { kind: 'error', message: NOT_FOUND_MESSAGE };
  if (binding === 'stale') {
    return {
      kind: 'stale_plan',
      message: 'Rencana adegan berubah sejak penawaran dibuat. Minta penawaran baru.',
    };
  }

  const confirmationService = createCreditQuoteConfirmationService(getUnitOfWork());
  const result = await confirmationService.confirmQuote({
    userId: access.userId,
    projectId,
    quoteId,
    ...deriveM4ConfirmationIdentity(quoteId),
    expectedWorkflowPlanHash: binding.workflowPlanHash,
    expectedDependencyHash: binding.dependencyHash,
    jobKind: BEAT_WRITE_JOB_KIND,
    bundleId: binding.bundleId,
    workflowPlanId: binding.workflowPlanId,
    payload: {
      workflowPlanHash: binding.workflowPlanHash,
      dependencyHash: binding.dependencyHash,
      chapterId,
    },
  });
  switch (result.kind) {
    case 'confirmed':
    case 'exact_replay': {
      const lookup = await findBeatJobState(projectId, chapterId, result.job.id);
      if (lookup.kind !== 'found') return { kind: 'error', message: NOT_FOUND_MESSAGE };
      return { kind: 'job_started', jobRef: lookup.jobRef, job: lookup.view };
    }
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
    case 'hash_mismatch':
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
): Promise<ChapterJobStateResult> {
  if (!projectId || !chapterId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const lookup = await findBeatJobState(projectId, chapterId, jobRef);
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
  _prev: JobCancelState | null,
  formData: FormData,
): Promise<JobCancelState> {
  const projectId = String(formData.get('projectId') ?? '');
  const chapterId = String(formData.get('chapterId') ?? '');
  if (!projectId || !chapterId) return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'error', message: NOT_FOUND_MESSAGE };

  const lookup = await findBeatJobState(projectId, chapterId, null);
  if (lookup.kind === 'none') return { kind: 'not_active', message: 'Tidak ada proses.' };
  if (lookup.kind === 'ambiguous') return { kind: 'error', message: AMBIGUOUS_MESSAGE };
  if (!isNonterminalPhase(lookup.view.phase)) {
    return { kind: 'not_active', message: 'Tidak ada proses.' };
  }

  const jobService = createJobService(getUnitOfWork());
  const result = await jobService.cancel({ projectId, jobId: lookup.jobRef });
  switch (result.kind) {
    case 'cancelled':
      return { kind: 'cancelled', message: 'Proses dibatalkan. Kreditmu tidak dipotong.' };
    case 'cancellation_requested':
    case 'cancellation_already_requested':
      return {
        kind: 'cancel_requested',
        message: 'Pembatalan diminta. Proses akan berhenti sebentar lagi.',
      };
    case 'already_terminal':
    case 'not_found':
      return { kind: 'not_active', message: 'Tidak ada proses yang sedang berjalan.' };
    default:
      return { kind: 'error', message: 'Pembatalan tidak dapat diproses. Coba lagi sebentar.' };
  }
}

function isTerminalJobView(view: JobPublicView): boolean {
  return view.phase !== 'queued' && view.phase !== 'running';
}

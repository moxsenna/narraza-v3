import 'server-only';

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  authorizeActiveUser,
  createCreditQuoteConfirmationService,
  createCreditQuoteService,
  createCreditSummaryService,
  createJobService,
  microIdrToCreditsCeil,
  MICRO_IDR_PER_CREDIT,
  type GenerationJobRecord,
  type JsonObject,
} from '@narraza/application';
import type { CreditSummaryDisplayView } from '../../lib/frontend/credit-display';
import { isNonterminalPhase, type JobPublicView } from '../../lib/frontend/job-phase';
import { deriveSceneConfirmationIdentity } from '../../lib/server/confirmation-identity';
import { toJobPublicView } from '../../lib/server/generation-view-model';
import { toCreditSummaryDisplay } from '../../lib/server/credit-view-model';
import { getCurrentUser } from '../auth/session';
import { getMyProject, getProjectOutline } from './queries';
import { getUnitOfWork } from './uow';

/**
 * M3 generation adapter. W3.5 wires the real credit-quote → confirmation →
 * GenerationJob chain for one D4 paid action. The frozen plan hashes are
 * deterministic stand-ins derived from the request context; W4.2 replaces
 * them with real AIWorkflowPlan hashes (request-beat-snapshot). The worst-case
 * quote amount is a provisional server constant until W4.2 pricing snapshots.
 */
export const SCENE_GENERATION_JOB_KIND = 'scene_generation';
export const SCENE_GENERATION_MAX_CREDITS = 35n;
const SCENE_GENERATION_MAX_MICRO_IDR = SCENE_GENERATION_MAX_CREDITS * MICRO_IDR_PER_CREDIT;

export type SceneChapterAccess =
  { readonly kind: 'allowed'; readonly userId: string } | { readonly kind: 'not_found' };

export type SceneJobLookup =
  | { readonly kind: 'found'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous' };

async function requireActiveUserId(): Promise<string | null> {
  const result = await authorizeActiveUser(async () => {
    const session = await getCurrentUser();
    if (!session) return null;
    return { id: session.userId, status: session.status, email: session.email };
  });
  return result.ok ? result.value.id : null;
}

/** Owner-derived, tenant-scoped chapter access for the scene generation flow. */
export async function assertSceneChapterAccess(
  projectId: string,
  chapterId: string,
): Promise<SceneChapterAccess> {
  const userId = await requireActiveUserId();
  if (!userId) return { kind: 'not_found' };

  const project = await getMyProject(projectId);
  if (!project) return { kind: 'not_found' };

  const outline = await getProjectOutline(projectId);
  const chapter = outline.some((node) => node.id === chapterId && node.entityType === 'chapter');
  if (!chapter) return { kind: 'not_found' };

  return { kind: 'allowed', userId };
}

function sha256Stable(value: JsonObject): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function deriveSceneGenerationHashes(
  projectId: string,
  chapterId: string,
): { workflowPlanHash: string; dependencyHash: string } {
  return {
    workflowPlanHash: sha256Stable({
      schemaVersion: 1,
      kind: SCENE_GENERATION_JOB_KIND,
      projectId,
      chapterId,
    }),
    dependencyHash: sha256Stable({
      schemaVersion: 1,
      dependencies: { projectId, chapterId },
    }),
  };
}

function jobInChapter(job: GenerationJobRecord, chapterId: string): boolean {
  return job.payload['chapterId'] === chapterId;
}

/**
 * Resolves the scene generation job state for a chapter. Without a job
 * reference the server derives the active/recoverable job itself; more than
 * one active scene job violates the backend invariant, so it fails closed.
 */
export async function findSceneJobState(
  projectId: string,
  chapterId: string,
  jobRef: string | null,
): Promise<SceneJobLookup> {
  const unitOfWork = getUnitOfWork();

  if (jobRef !== null) {
    return unitOfWork.execute(async (ports) => {
      const job = await ports.job.findById({ projectId, jobId: jobRef });
      if (!job || job.kind !== SCENE_GENERATION_JOB_KIND || !jobInChapter(job, chapterId)) {
        return { kind: 'none' };
      }
      return { kind: 'found', jobRef: job.id, view: await toJobPublicView(ports, job) };
    });
  }

  const activeJobs = await unitOfWork.execute((ports) => ports.job.listActiveByProject(projectId));
  const sceneJobs = activeJobs.filter(
    (job) => job.kind === SCENE_GENERATION_JOB_KIND && jobInChapter(job, chapterId),
  );
  if (sceneJobs.length > 1) return { kind: 'ambiguous' };
  const sceneJob = sceneJobs[0];
  if (!sceneJob) {
    // No active job: surface the most recent finished outcome for this chapter
    // so a refresh never erases the truthful terminal state. Chapter scope is
    // applied inside the query (before ordering/limit), terminal jobs are
    // immutable, so this lookup has no state-machine implications.
    const latestTerminal = await unitOfWork.execute((ports) =>
      ports.job.findLatestTerminalByProject({
        projectId,
        kind: SCENE_GENERATION_JOB_KIND,
        payloadFilter: { chapterId },
      }),
    );
    if (!latestTerminal) return { kind: 'none' };
    const terminalView = await unitOfWork.execute((ports) =>
      toJobPublicView(ports, latestTerminal),
    );
    return { kind: 'found', jobRef: latestTerminal.id, view: terminalView };
  }

  const view = await unitOfWork.execute((ports) => toJobPublicView(ports, sceneJob));
  return { kind: 'found', jobRef: sceneJob.id, view: { ...view, recovered: true } };
}

/**
 * Narrow credit-summary loader for an already-authenticated userId (the app
 * shell holds the single getCurrentUser authority and passes the id down).
 */
export async function getCreditSummaryViewForUser(
  userId: string,
): Promise<CreditSummaryDisplayView> {
  const summary = createCreditSummaryService(getUnitOfWork());
  return toCreditSummaryDisplay(await summary.getSummary({ userId }));
}

export async function getMyCreditSummaryView(): Promise<CreditSummaryDisplayView | null> {
  const userId = await requireActiveUserId();
  if (!userId) return null;
  return getCreditSummaryViewForUser(userId);
}

export type SceneQuoteIssuance =
  | {
      readonly kind: 'issued';
      readonly quoteId: string;
      readonly maxCredits: number;
      readonly availableCredits: number;
      readonly expiresAtIso: string;
    }
  | { readonly kind: 'active_job'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function issueSceneGenerationQuote(
  projectId: string,
  chapterId: string,
  userId: string,
): Promise<SceneQuoteIssuance> {
  const active = await findSceneJobState(projectId, chapterId, null);
  if (active.kind === 'found' && isNonterminalPhase(active.view.phase)) {
    return { kind: 'active_job', jobRef: active.jobRef, view: active.view };
  }
  if (active.kind === 'ambiguous') return { kind: 'ambiguous' };

  const { workflowPlanHash, dependencyHash } = deriveSceneGenerationHashes(projectId, chapterId);
  const quoteService = createCreditQuoteService(getUnitOfWork());
  const result = await quoteService.issueQuote({
    userId,
    projectId,
    actionKind: SCENE_GENERATION_JOB_KIND,
    workflowPlanId: null,
    workflowPlanHash,
    bundleId: null,
    dependencyHash,
    maxAmountMicroIdr: SCENE_GENERATION_MAX_MICRO_IDR,
    issuanceRequestId: randomUUID(),
  });

  switch (result.kind) {
    case 'issued': {
      const summary = createCreditSummaryService(getUnitOfWork());
      // CreditSummaryView is already in whole credits (D6 conversion happens
      // in the application layer); only the raw quote amount needs converting.
      const balance = await summary.getSummary({ userId });
      return {
        kind: 'issued',
        quoteId: result.quote.id,
        maxCredits: Number(microIdrToCreditsCeil(result.quote.maxAmountMicroIdr)),
        availableCredits: Number(balance.available),
        expiresAtIso: result.quote.expiresAt.toISOString(),
      };
    }
    case 'not_found':
      return { kind: 'not_found' };
    default:
      return { kind: 'conflict' };
  }
}

export type SceneConfirmation =
  | { readonly kind: 'started'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'expired' }
  | { readonly kind: 'insufficient_credit' }
  | { readonly kind: 'stale_plan' }
  | { readonly kind: 'already_consumed' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function confirmSceneGenerationQuote(
  projectId: string,
  chapterId: string,
  userId: string,
  quoteId: string,
): Promise<SceneConfirmation> {
  const { workflowPlanHash, dependencyHash } = deriveSceneGenerationHashes(projectId, chapterId);
  const confirmationService = createCreditQuoteConfirmationService(getUnitOfWork());
  const result = await confirmationService.confirmQuote({
    userId,
    projectId,
    quoteId,
    ...deriveSceneConfirmationIdentity(quoteId),
    expectedWorkflowPlanHash: workflowPlanHash,
    expectedDependencyHash: dependencyHash,
    jobKind: SCENE_GENERATION_JOB_KIND,
    bundleId: null,
    workflowPlanId: null,
    payload: { chapterId },
  });

  switch (result.kind) {
    case 'confirmed':
    case 'exact_replay':
      return {
        kind: 'started',
        jobRef: result.job.id,
        view: {
          phase: result.job.status,
          cancelRequested: false,
          zeroCharge: false,
          chargedCredits: null,
          recovered: false,
        },
      };
    case 'expired':
      return { kind: 'expired' };
    case 'insufficient_credit':
      return { kind: 'insufficient_credit' };
    case 'hash_mismatch':
      return { kind: 'stale_plan' };
    case 'already_consumed':
      return { kind: 'already_consumed' };
    case 'not_found':
      return { kind: 'not_found' };
    default:
      return { kind: 'conflict' };
  }
}

export type SceneCancellation =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'cancel_requested' }
  | { readonly kind: 'not_active' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function cancelSceneGenerationJob(
  projectId: string,
  chapterId: string,
): Promise<SceneCancellation> {
  const active = await findSceneJobState(projectId, chapterId, null);
  if (active.kind === 'none') return { kind: 'not_active' };
  if (active.kind === 'ambiguous') return { kind: 'ambiguous' };
  if (!isNonterminalPhase(active.view.phase)) return { kind: 'not_active' };

  const jobService = createJobService(getUnitOfWork());
  const result = await jobService.cancel({ projectId, jobId: active.jobRef });
  switch (result.kind) {
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'cancellation_requested':
    case 'cancellation_already_requested':
      return { kind: 'cancel_requested' };
    case 'already_terminal':
      return { kind: 'not_active' };
    case 'not_found':
      return { kind: 'not_found' };
    default:
      return { kind: 'conflict' };
  }
}

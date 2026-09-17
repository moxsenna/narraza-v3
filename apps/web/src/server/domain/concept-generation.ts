import 'server-only';

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  authorizeActiveUser,
  createAcceptConcept,
  createCreditQuoteConfirmationService,
  createCreditQuoteService,
  createCreditSummaryService,
  createJobService,
  microIdrToCreditsCeil,
  MICRO_IDR_PER_CREDIT,
  type JsonObject,
  type M4ConceptSetView,
} from '@narraza/application';
import { isNonterminalPhase, type JobPublicView } from '../../lib/frontend/job-phase';
import { deriveM4ConfirmationIdentity } from '../../lib/server/confirmation-identity';
import { toJobPublicView } from '../../lib/server/generation-view-model';
import { getCurrentUser } from '../auth/session';
import { getMyProject } from './queries';
import { getUnitOfWork } from './uow';

/**
 * Concept generation adapter. Mirrors the scene generation chain
 * (credit-quote → confirmation → GenerationJob) for the D4 paid action
 * `concept_generation`. Hashes are deterministic stand-ins derived from the
 * request context; the worst-case quote amount is a provisional server
 * constant until pricing snapshots land.
 */
export const CONCEPT_GENERATION_JOB_KIND = 'concept_generation';
export const CONCEPT_GENERATION_MAX_CREDITS = 35n;
const CONCEPT_GENERATION_MAX_MICRO_IDR = CONCEPT_GENERATION_MAX_CREDITS * MICRO_IDR_PER_CREDIT;

export type ConceptProjectAccess =
  { readonly kind: 'allowed'; readonly userId: string } | { readonly kind: 'not_found' };

export type ConceptJobLookup =
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

/** Owner-derived, tenant-scoped project access for the concept flow. */
export async function assertConceptProjectAccess(projectId: string): Promise<ConceptProjectAccess> {
  const userId = await requireActiveUserId();
  if (!userId) return { kind: 'not_found' };

  const project = await getMyProject(projectId);
  if (!project) return { kind: 'not_found' };

  return { kind: 'allowed', userId };
}

function sha256Stable(value: JsonObject): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function deriveConceptGenerationHashes(projectId: string): {
  workflowPlanHash: string;
  dependencyHash: string;
} {
  return {
    workflowPlanHash: sha256Stable({
      schemaVersion: 1,
      kind: CONCEPT_GENERATION_JOB_KIND,
      projectId,
    }),
    dependencyHash: sha256Stable({
      schemaVersion: 1,
      dependencies: { projectId },
    }),
  };
}

/**
 * Resolves the concept generation job state for a project. Without a job
 * reference the server derives the active/recoverable job itself; more than
 * one active concept job fails closed.
 */
export async function findConceptJobState(
  projectId: string,
  jobRef: string | null,
): Promise<ConceptJobLookup> {
  const unitOfWork = getUnitOfWork();

  if (jobRef !== null) {
    return unitOfWork.execute(async (ports) => {
      const job = await ports.job.findById({ projectId, jobId: jobRef });
      if (!job || job.kind !== CONCEPT_GENERATION_JOB_KIND) {
        return { kind: 'none' };
      }
      return { kind: 'found', jobRef: job.id, view: await toJobPublicView(ports, job) };
    });
  }

  const activeJobs = await unitOfWork.execute((ports) => ports.job.listActiveByProject(projectId));
  const conceptJobs = activeJobs.filter((job) => job.kind === CONCEPT_GENERATION_JOB_KIND);
  if (conceptJobs.length > 1) return { kind: 'ambiguous' };
  const conceptJob = conceptJobs[0];
  if (!conceptJob) {
    const latestTerminal = await unitOfWork.execute((ports) =>
      ports.job.findLatestTerminalByProject({
        projectId,
        kind: CONCEPT_GENERATION_JOB_KIND,
        payloadFilter: {},
      }),
    );
    if (!latestTerminal) return { kind: 'none' };
    const terminalView = await unitOfWork.execute((ports) =>
      toJobPublicView(ports, latestTerminal),
    );
    return { kind: 'found', jobRef: latestTerminal.id, view: terminalView };
  }

  const view = await unitOfWork.execute((ports) => toJobPublicView(ports, conceptJob));
  return { kind: 'found', jobRef: conceptJob.id, view: { ...view, recovered: true } };
}

export type ConceptQuoteIssuance =
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

export async function issueConceptGenerationQuote(
  projectId: string,
  userId: string,
): Promise<ConceptQuoteIssuance> {
  const active = await findConceptJobState(projectId, null);
  if (active.kind === 'found' && isNonterminalPhase(active.view.phase)) {
    return { kind: 'active_job', jobRef: active.jobRef, view: active.view };
  }
  if (active.kind === 'ambiguous') return { kind: 'ambiguous' };

  const { workflowPlanHash, dependencyHash } = deriveConceptGenerationHashes(projectId);
  const quoteService = createCreditQuoteService(getUnitOfWork());
  const result = await quoteService.issueQuote({
    userId,
    projectId,
    actionKind: CONCEPT_GENERATION_JOB_KIND,
    workflowPlanId: null,
    workflowPlanHash,
    bundleId: null,
    dependencyHash,
    maxAmountMicroIdr: CONCEPT_GENERATION_MAX_MICRO_IDR,
    issuanceRequestId: randomUUID(),
  });

  switch (result.kind) {
    case 'issued': {
      const summary = createCreditSummaryService(getUnitOfWork());
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

export type ConceptConfirmation =
  | { readonly kind: 'started'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'expired' }
  | { readonly kind: 'insufficient_credit' }
  | { readonly kind: 'stale_plan' }
  | { readonly kind: 'already_consumed' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function confirmConceptGenerationQuote(
  projectId: string,
  userId: string,
  quoteId: string,
): Promise<ConceptConfirmation> {
  const { workflowPlanHash, dependencyHash } = deriveConceptGenerationHashes(projectId);
  const confirmationService = createCreditQuoteConfirmationService(getUnitOfWork());
  const result = await confirmationService.confirmQuote({
    userId,
    projectId,
    quoteId,
    ...deriveM4ConfirmationIdentity(quoteId),
    expectedWorkflowPlanHash: workflowPlanHash,
    expectedDependencyHash: dependencyHash,
    jobKind: CONCEPT_GENERATION_JOB_KIND,
    bundleId: null,
    workflowPlanId: null,
    payload: { projectId },
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

export type ConceptCancellation =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'cancel_requested' }
  | { readonly kind: 'not_active' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function cancelConceptGenerationJob(projectId: string): Promise<ConceptCancellation> {
  const active = await findConceptJobState(projectId, null);
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

/** Latest published concept set for choosing (read-only product projection). */
export async function getConceptSetView(projectId: string): Promise<M4ConceptSetView | null> {
  return getUnitOfWork().execute(async (ports) => {
    if (!ports.m4ProductRead) return null;
    return ports.m4ProductRead.findLatestConceptSet(projectId);
  });
}

export type ConceptChoice =
  | { readonly kind: 'accepted'; readonly foundationLocked: false }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

/** Choose one concept → foundation draft (never locked) via acceptConcept. */
export async function acceptConceptChoice(
  projectId: string,
  userId: string,
  conceptId: string,
): Promise<ConceptChoice> {
  const accept = createAcceptConcept(getUnitOfWork());
  const result = await accept({ ownerUserId: userId, projectId, conceptId });
  if (!result.ok) {
    switch (result.error.code) {
      case 'NOT_FOUND':
        return { kind: 'not_found' };
      case 'CAS_FAILED':
        return { kind: 'stale' };
      default:
        return { kind: 'conflict' };
    }
  }
  return { kind: 'accepted', foundationLocked: false };
}

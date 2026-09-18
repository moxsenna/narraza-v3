'use server';

import { randomUUID } from 'node:crypto';
import {
  authorizeActiveUser,
  buildPublishPacket,
  createCreditQuoteConfirmationService,
  createCreditSummaryService,
  createJobService,
  createPaidGenerationPreparationService,
  microIdrToCreditsCeil,
  prodDependencyEntries,
  prodDependencyHash,
  prodRecoveryPacket,
  seedMockPriceSnapshots,
  type GenerationJobRecord,
} from '@narraza/application';
import type { JobPublicView } from '../../lib/frontend/job-phase';
import { isNonterminalPhase } from '../../lib/frontend/job-phase';
import { deriveM4ConfirmationIdentity } from '../../lib/server/confirmation-identity';
import { toJobPublicView } from '../../lib/server/generation-view-model';
import { getCurrentUser } from '../auth/session';
import { getMyProject } from './queries';
import { getUnitOfWork } from './uow';
import { MOCK_PAID_PROFILE, mockPriceSnapshots, mockProfileAllowed } from './concept-generation';

export const PUBLISH_JOB_KIND = 'publish_package';

export type PublishProjectAccess =
  { readonly kind: 'allowed'; readonly userId: string } | { readonly kind: 'not_found' };

export type PublishJobLookup =
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

export async function assertPublishProjectAccess(projectId: string): Promise<PublishProjectAccess> {
  const userId = await requireActiveUserId();
  if (!userId) return { kind: 'not_found' };
  const project = await getMyProject(projectId);
  if (!project) return { kind: 'not_found' };
  return { kind: 'allowed', userId };
}

export async function findPublishJobState(
  projectId: string,
  jobRef: string | null,
): Promise<PublishJobLookup> {
  const unitOfWork = getUnitOfWork();
  if (jobRef !== null) {
    return unitOfWork.execute(async (ports) => {
      const job = await ports.job.findById({ projectId, jobId: jobRef });
      if (!job || job.kind !== PUBLISH_JOB_KIND) return { kind: 'none' };
      return { kind: 'found', jobRef: job.id, view: await toJobPublicView(ports, job) };
    });
  }
  const activeJobs = await unitOfWork.execute((ports) => ports.job.listActiveByProject(projectId));
  const publishJobs = activeJobs.filter(
    (job: GenerationJobRecord) => job.kind === PUBLISH_JOB_KIND,
  );
  if (publishJobs.length > 1) return { kind: 'ambiguous' };
  const publishJob = publishJobs[0];
  if (!publishJob) {
    const latestTerminal = await unitOfWork.execute((ports) =>
      ports.job.findLatestTerminalByProject({
        projectId,
        kind: PUBLISH_JOB_KIND,
        payloadFilter: {},
      }),
    );
    if (!latestTerminal) return { kind: 'none' };
    const terminalView = await unitOfWork.execute((ports) =>
      toJobPublicView(ports, latestTerminal),
    );
    return { kind: 'found', jobRef: latestTerminal.id, view: terminalView };
  }
  const view = await unitOfWork.execute((ports) => toJobPublicView(ports, publishJob));
  return { kind: 'found', jobRef: publishJob.id, view: { ...view, recovered: true } };
}

export type PublishQuoteIssuance =
  | {
      readonly kind: 'issued';
      readonly quoteId: string;
      readonly maxCredits: number;
      readonly availableCredits: number;
      readonly expiresAtIso: string;
    }
  | { readonly kind: 'active_job'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'prerequisite'; readonly message: string }
  | { readonly kind: 'unsupported'; readonly message: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function issuePublishGenerationQuote(
  projectId: string,
  userId: string,
  beatId: string,
): Promise<PublishQuoteIssuance> {
  const active = await findPublishJobState(projectId, null);
  if (active.kind === 'found' && isNonterminalPhase(active.view.phase)) {
    return { kind: 'active_job', jobRef: active.jobRef, view: active.view };
  }
  if (active.kind === 'ambiguous') return { kind: 'ambiguous' };
  if (!mockProfileAllowed()) {
    return {
      kind: 'unsupported',
      message: 'Pembuatan paket berbayar belum tersedia di lingkungan ini.',
    };
  }

  const unitOfWork = getUnitOfWork();
  await seedMockPriceSnapshots(unitOfWork);
  const source = await unitOfWork.execute(async (ports) => {
    const outline = await ports.outline.listByProject(projectId);
    const beat = outline.find((node) => node.id === beatId && node.entityType === 'beat');
    if (!beat || !beat.acceptedProseVersionId || !ports.proseVersion) return null;
    const version = await ports.proseVersion.findById(projectId, beat.acceptedProseVersionId);
    if (!version) return null;
    return { entries: prodDependencyEntries(outline), version };
  });
  if (!source) {
    return {
      kind: 'prerequisite',
      message: 'Paket dibuat dari adegan yang sudah resmi. Terima adegan dulu.',
    };
  }

  const dependencyHash = prodDependencyHash(source.entries);
  const packet = buildPublishPacket({
    projectId,
    dependencyHash,
    proseVersionId: source.version.id,
    proseContent: source.version.content,
  });
  if (packet.kind !== 'ok') {
    return {
      kind: 'prerequisite',
      message: 'Paket dibuat dari adegan yang sudah resmi. Terima adegan dulu.',
    };
  }

  const prepare = createPaidGenerationPreparationService({ unitOfWork });
  const result = await prepare.prepare({
    projectId,
    workflowKind: PUBLISH_JOB_KIND,
    bundleId: randomUUID(),
    planId: randomUUID(),
    bundle: {
      workflowKind: PUBLISH_JOB_KIND,
      dependencyEntries: source.entries,
      packets: [packet.packet, prodRecoveryPacket(projectId, dependencyHash, PUBLISH_JOB_KIND)],
    },
    profile: MOCK_PAID_PROFILE,
    priceSnapshots: mockPriceSnapshots(),
    userId,
    actionKind: PUBLISH_JOB_KIND,
    issuanceRequestId: randomUUID(),
  });

  switch (result.kind) {
    case 'prepared':
    case 'replayed': {
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
    default:
      return { kind: 'conflict' };
  }
}

export type PublishConfirmation =
  | { readonly kind: 'started'; readonly jobRef: string; readonly view: JobPublicView }
  | { readonly kind: 'expired' }
  | { readonly kind: 'insufficient_credit' }
  | { readonly kind: 'stale_plan' }
  | { readonly kind: 'already_consumed' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function confirmPublishGenerationQuote(
  projectId: string,
  userId: string,
  quoteId: string,
): Promise<PublishConfirmation> {
  const unitOfWork = getUnitOfWork();
  const binding = await unitOfWork.execute(async (ports) => {
    const quote = await ports.quote.findById(quoteId);
    if (!quote || quote.userId !== userId || quote.projectId !== projectId) return null;
    if (!ports.workflowPlan) return null;
    const plan = await ports.workflowPlan.findPlanByHash(projectId, quote.workflowPlanHash);
    if (!plan || plan.bundleId.length === 0 || plan.workflowKind !== PUBLISH_JOB_KIND) return null;
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
  if (!binding) return { kind: 'not_found' };
  if (binding === 'stale') return { kind: 'stale_plan' };

  const confirmationService = createCreditQuoteConfirmationService(getUnitOfWork());
  const result = await confirmationService.confirmQuote({
    userId,
    projectId,
    quoteId,
    ...deriveM4ConfirmationIdentity(quoteId),
    expectedWorkflowPlanHash: binding.workflowPlanHash,
    expectedDependencyHash: binding.dependencyHash,
    jobKind: PUBLISH_JOB_KIND,
    bundleId: binding.bundleId,
    workflowPlanId: binding.workflowPlanId,
    payload: {
      workflowPlanHash: binding.workflowPlanHash,
      dependencyHash: binding.dependencyHash,
    },
  });

  switch (result.kind) {
    case 'confirmed':
    case 'exact_replay': {
      const lookup = await findPublishJobState(projectId, result.job.id);
      if (lookup.kind !== 'found') return { kind: 'conflict' };
      return { kind: 'started', jobRef: lookup.jobRef, view: lookup.view };
    }
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

export type PublishCancellation =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'cancel_requested' }
  | { readonly kind: 'not_active' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export async function cancelPublishGenerationJob(projectId: string): Promise<PublishCancellation> {
  const active = await findPublishJobState(projectId, null);
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
    case 'not_found':
      return { kind: 'not_active' };
    default:
      return { kind: 'conflict' };
  }
}

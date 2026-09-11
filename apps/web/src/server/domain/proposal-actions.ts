'use server';

import {
  createAcceptProposal,
  createMarkStaleProposal,
  createPrepareProseProposal,
  createPublishArtifact,
  createRejectProposal,
  type AppError,
} from '@narraza/application';
import { getCurrentUser } from '../auth/session';
import { getUnitOfWork } from './uow';

/**
 * W5.4 proposal actions. The browser supplies only identifiers the server
 * re-validates against tenant-scoped state and text the user typed; no
 * hashes, ops, payloads, or model data ever round-trips through the client
 * (proposal-dto contract). High-risk accepts require a typed confirmation
 * phrase that is verified SERVER-side.
 */
export type ProposalActionState = {
  ok: boolean;
  message?: string;
};

function publicError(error: AppError): string {
  return error.publicMessageCode;
}

const HIGH_RISK_CONFIRM_PHRASE = 'jadikan resmi';

export async function prepareUserProposalAction(
  _prev: ProposalActionState | null,
  formData: FormData,
): Promise<ProposalActionState> {
  const session = await getCurrentUser();
  if (!session) return { ok: false, message: 'msg.auth.required' };

  const projectId = String(formData.get('projectId') ?? '');
  const beatId = String(formData.get('beatId') ?? '');
  const content = String(formData.get('content') ?? '');
  if (!projectId || !beatId) return { ok: false, message: 'msg.error.bad_request' };

  const prepare = createPrepareProseProposal(getUnitOfWork());
  const result = await prepare({
    ownerUserId: session.userId,
    projectId,
    beatId,
    source: 'user',
    content,
  });
  if (!result.ok) return { ok: false, message: publicError(result.error) };
  return { ok: true, message: 'msg.proposal.prepared' };
}

export async function acceptProposalAction(
  _prev: ProposalActionState | null,
  formData: FormData,
): Promise<ProposalActionState> {
  const session = await getCurrentUser();
  if (!session) return { ok: false, message: 'msg.auth.required' };

  const projectId = String(formData.get('projectId') ?? '');
  const proposalId = String(formData.get('proposalId') ?? '');
  const baseRaw = String(formData.get('baseCanonicalVersion') ?? '');
  const highRisk = String(formData.get('highRisk') ?? '') === '1';
  const confirmPhrase = String(formData.get('confirmPhrase') ?? '').trim().toLowerCase();
  const baseCanonicalVersion = Number.parseInt(baseRaw, 10);
  if (!projectId || !proposalId || !Number.isSafeInteger(baseCanonicalVersion)) {
    return { ok: false, message: 'msg.error.bad_request' };
  }
  // Second confirm for high-risk is enforced here, never in the browser.
  if (highRisk && confirmPhrase !== HIGH_RISK_CONFIRM_PHRASE) {
    return { ok: false, message: 'msg.proposal.confirm_required' };
  }

  const uow = getUnitOfWork();
  const accept = createAcceptProposal(uow);
  const result = await accept({
    ownerUserId: session.userId,
    projectId,
    proposalId,
    baseCanonicalVersion,
  });
  if (!result.ok) {
    // R-M5.3: CAS failure marks the abandoned proposal stale in a new tx.
    if (result.error.code === 'CAS_FAILED') {
      await createMarkStaleProposal(uow)({
        ownerUserId: session.userId,
        projectId,
        proposalId,
      });
      return { ok: false, message: 'msg.proposal.stale' };
    }
    return { ok: false, message: publicError(result.error) };
  }
  return { ok: true, message: 'msg.proposal.accepted' };
}

export async function rejectProposalAction(
  _prev: ProposalActionState | null,
  formData: FormData,
): Promise<ProposalActionState> {
  const session = await getCurrentUser();
  if (!session) return { ok: false, message: 'msg.auth.required' };

  const projectId = String(formData.get('projectId') ?? '');
  const proposalId = String(formData.get('proposalId') ?? '');
  if (!projectId || !proposalId) return { ok: false, message: 'msg.error.bad_request' };

  const reject = createRejectProposal(getUnitOfWork());
  const result = await reject({
    ownerUserId: session.userId,
    projectId,
    proposalId,
  });
  if (!result.ok) return { ok: false, message: publicError(result.error) };
  return { ok: true, message: 'msg.proposal.rejected' };
}

export async function publishArtifactAction(
  _prev: ProposalActionState | null,
  formData: FormData,
): Promise<ProposalActionState> {
  const session = await getCurrentUser();
  if (!session) return { ok: false, message: 'msg.auth.required' };

  const projectId = String(formData.get('projectId') ?? '');
  const artifactProposalId = String(formData.get('artifactProposalId') ?? '');
  if (!projectId || !artifactProposalId) {
    return { ok: false, message: 'msg.error.bad_request' };
  }

  const publish = createPublishArtifact(getUnitOfWork());
  const result = await publish({
    ownerUserId: session.userId,
    projectId,
    artifactProposalId,
  });
  if (!result.ok) return { ok: false, message: publicError(result.error) };
  return { ok: true, message: 'msg.artifact.published' };
}

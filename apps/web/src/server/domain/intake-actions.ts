'use server';

import { randomUUID } from 'node:crypto';
import {
  NINE_ROUTER_PRICE_SNAPSHOT_ID,
  NINE_ROUTER_PRODUCTION_PROFILE,
  authorizeActiveUser,
  createSystemFundedIntakeService,
  type ContextPacketLike,
} from '@narraza/application';
import { context, type dependency } from '@narraza/core';
import { getCurrentUser } from '../auth/session';
import {
  computeDependencyHash,
  dependencyEntries,
  freezeBundleAndPlan,
  packetMetadata,
  readVerticalContext,
  recoveryPacket,
} from './m4-vertical-actions';
import { getUnitOfWork } from './uow';

export type IntakeReplyRequest = 'queued' | 'fair_use_limited' | 'unavailable';

/**
 * Product intake-reply trigger (R1 sell-ready). Same frozen bundle/plan/quote
 * pipeline as the M4 harness, but bound to the nine-router production profile
 * and real seeded price snapshots. Best-effort by design: the user message is
 * already persisted by the caller — a failed trigger never un-saves it.
 */
export async function requestIntakeReplyAction(
  projectId: string,
  userId: string,
): Promise<IntakeReplyRequest> {
  const auth = await authorizeActiveUser(async () => {
    const session = await getCurrentUser();
    if (!session || session.userId !== userId) return null;
    return { id: session.userId, status: session.status, email: session.email };
  });
  if (!auth.ok) return 'unavailable';

  const unitOfWork = getUnitOfWork();
  const snapshot = await unitOfWork.execute(async (ports) => {
    if (!ports.modelPrice) return null;
    return ports.modelPrice.findById(NINE_ROUTER_PRICE_SNAPSHOT_ID);
  });
  if (!snapshot) return 'unavailable';

  const state = await readVerticalContext(projectId);
  if (!state.messages.some((message) => message.role === 'user')) return 'unavailable';

  let entries: dependency.DependencyEntry[];
  let dependencyHash: string;
  let packet: ContextPacketLike;
  try {
    entries = dependencyEntries(state.outline);
    dependencyHash = computeDependencyHash(entries);
    packet = context.buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata: packetMetadata(projectId, dependencyHash),
      useCase: 'intake_signals',
      messages: state.messages.map((message) => ({
        id: message.id,
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      })),
    });
  } catch {
    return 'unavailable';
  }

  const frozen = await freezeBundleAndPlan(
    projectId,
    'chat_intake_reply',
    entries,
    [packet, recoveryPacket(projectId, dependencyHash, 'chat_intake_reply')],
    {
      profile: { ...NINE_ROUTER_PRODUCTION_PROFILE },
      priceSnapshots: [
        {
          id: snapshot.id,
          inputRateMicroIdr: snapshot.inputRateMicroIdr,
          outputRateMicroIdr: snapshot.outputRateMicroIdr,
        },
      ],
    },
  );
  if (frozen.kind === 'error') return 'unavailable';

  const session = await unitOfWork.execute((ports) => ports.intake.findSessionByProject(projectId));
  if (!session) return 'unavailable';

  try {
    const admitted = await createSystemFundedIntakeService({ unitOfWork }).create({
      requestId: randomUUID(),
      userId,
      projectId,
      bundleId: frozen.bundleId,
      workflowPlanId: frozen.planRecordId,
      workflowPlanHash: frozen.planHash,
      dependencyHash: frozen.dependencyHash,
      budgetMicroIdr: frozen.estimatedMaxMicroIdr,
      payload: { intakeSessionId: session.id },
    });
    switch (admitted.kind) {
      case 'accepted':
      case 'exact_replay':
        return 'queued';
      case 'fair_use_limited':
        return 'fair_use_limited';
      default:
        return 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
}

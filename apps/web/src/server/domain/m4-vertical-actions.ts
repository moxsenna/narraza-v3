'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import {
  MOCK_PRICE_SNAPSHOT_FIXTURES,
  MOCK_PRICE_SNAPSHOT_ID,
  MOCK_PROVIDER_ID,
  MOCK_WRITER_MODEL_ID,
  buildWorkflowPlan,
  createAcceptConcept,
  createAppendIntakeMessage,
  createContextBundleFreezeService,
  createCreditQuoteConfirmationService,
  createPaidGenerationPreparationService,
  createSystemFundedIntakeService,
  createWorkflowPlanFreezeService,
  seedMockPriceSnapshots,
  type ContextPacketLike,
  type JsonObject,
} from '@narraza/application';
import { context, dependency } from '@narraza/core';
import { resolveM4VerticalAccess } from '../../lib/server/preview/m4-vertical-harness';
import { deriveM4ConfirmationIdentity } from '../../lib/server/confirmation-identity';
import type { M4VerticalWorkflowKind } from './m4-vertical';
import { getUnitOfWork } from './uow';

/**
 * M4 dev/mock exit-gate actions. Every step drives the REAL M4 chain —
 * bundle freeze → workflow plan → quote (or system-funded admission) →
 * confirmation → GenerationJob — which the REAL worker processor then runs
 * against the deterministic mock provider. Production AI activation stays
 * fail-closed: this surface is unreachable outside dev/test (see
 * resolveM4VerticalAccess), and no provider, model, hash, or id is ever read
 * from the browser — the browser supplies only text the user typed and
 * identifiers the server re-validates against tenant-scoped state.
 */

const VERTICAL_PATH_PREFIX = '/app/__preview/m4-vertical';

const USER_PAID_WORKFLOW_KINDS: readonly M4VerticalWorkflowKind[] = [
  'concept_generation',
  'foundation_generation',
  'outline_generation',
  'beat_write_judge',
  'safe_repair',
  'publish_package',
];

const M4_HARNESS_PROFILE = {
  providerId: MOCK_PROVIDER_ID,
  requestedModelId: MOCK_WRITER_MODEL_ID,
  resolvedModelId: MOCK_WRITER_MODEL_ID,
  structuredOutput: true,
  timeoutMs: 30_000,
  // Certification-profile ceilings: the frozen packet prompt (full intake
  // thread JSON) must fit the declared input ceiling or the attempt fails
  // closed with 'context_length' before any provider call.
  maxInputTokens: 4_000,
  maxOutputTokens: 1_000,
  priceSnapshotId: `${MOCK_PRICE_SNAPSHOT_ID}-writer`,
  maxInvocations: 2,
} as const;

const M4_HARNESS_PRICE_SNAPSHOTS = MOCK_PRICE_SNAPSHOT_FIXTURES.map((fixture) => ({
  id: fixture.id,
  inputRateMicroIdr: fixture.inputRateMicroIdr,
  outputRateMicroIdr: fixture.outputRateMicroIdr,
}));

type StepError =
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'prerequisite'
  | 'fair_use_limited'
  | 'insufficient_credit'
  | 'stale_plan';

function verticalPath(projectId: string): string {
  return `${VERTICAL_PATH_PREFIX}/${projectId}`;
}

function fail(projectId: string, error: StepError): never {
  redirect(`${verticalPath(projectId)}?error=${error}`);
}

function done(projectId: string): never {
  redirect(verticalPath(projectId));
}

function packetMetadata(projectId: string, dependencyHash: string): context.PacketMetadata {
  return {
    schemaVersion: context.PACKET_SCHEMA_VERSION,
    projectId,
    dependencyHash,
    policyVersion: context.PACKET_POLICY_VERSION,
  };
}

function dependencyEntries(
  outline: readonly { entityType: string; id: string; revision: number; deletedAt: Date | null }[],
): dependency.DependencyEntry[] {
  return outline
    .filter((node) => node.deletedAt === null)
    .map((node) => ({
      entityType: node.entityType,
      entityId: node.id,
      revision: node.revision,
      deleted: false,
    }));
}

function computeDependencyHash(entries: readonly dependency.DependencyEntry[]): string {
  return dependency.dependencyManifestHash(dependency.buildDependencyManifest(entries));
}

/**
 * Parse-repair recovery envelope for the frozen bundle. Every M4 plan template
 * carries a parse-repair stage whose packetKind is 'repair', and the worker
 * pre-validates every stage's frozen binding before its first provider call —
 * so the bundle must contain this packet up front. It is a recovery-context
 * marker, not product data (the safe_repair PRODUCT workflow builds its own
 * real repair packet through the core builder instead).
 */
function recoveryPacket(
  projectId: string,
  dependencyHash: string,
  workflowKind: string,
): ContextPacketLike {
  const envelope: ContextPacketLike = {
    kind: 'repair',
    dataClass: 'writer_safe',
    metadata: packetMetadata(projectId, dependencyHash),
  };
  const withContent = { ...envelope, content: { recoveryFor: workflowKind } };
  return withContent;
}

/**
 * Beat display title, derived from real stored state. The beats table stores
 * the title inside the payload envelope, so the outline record's flat title
 * can be empty for beats; read the nested node title first, then fall back.
 */
function beatDisplayTitle(beat: { readonly title: string; readonly payload: JsonObject }): string {
  const node = beat.payload['node'];
  const nested =
    typeof node === 'object' && node !== null && !Array.isArray(node)
      ? (node as JsonObject)['title']
      : undefined;
  const title = typeof nested === 'string' && nested.trim().length > 0 ? nested : beat.title;
  return title.trim().length > 0 ? title : 'Adegan';
}

/** Explicit, real "not yet determined" marker for absent draft fields. */
const UNDETERMINED = '(belum ditentukan)';

function foundationField(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return UNDETERMINED;
}

function plannerFoundation(payload: JsonObject): context.FoundationPlanningContext {
  return {
    coreConcept: foundationField(payload, 'coreConcept'),
    conflict: foundationField(payload, 'conflict'),
    endingDirection: foundationField(payload, 'endingDirection'),
    readerPromise: foundationField(payload, 'readerPromise'),
  };
}

async function readVerticalContext(projectId: string) {
  return getUnitOfWork().execute(async (ports) => {
    const foundation = await ports.foundation.findByProjectId(projectId);
    const outline = await ports.outline.listByProject(projectId);
    const session = await ports.intake.findSessionByProject(projectId);
    const messages = session ? await ports.intake.listMessages(projectId, session.id) : [];
    const m4Read = ports.m4ProductRead;
    const prose = m4Read ? await m4Read.findLatestProseVersion(projectId) : null;
    return { foundation, outline, messages, prose };
  });
}

async function freezeBundleAndPlan(
  projectId: string,
  workflowKind: string,
  entries: readonly dependency.DependencyEntry[],
  packets: readonly ContextPacketLike[],
): Promise<
  | {
      kind: 'ok';
      planRecordId: string;
      planHash: string;
      dependencyHash: string;
      bundleId: string;
      estimatedMaxMicroIdr: bigint;
    }
  | { kind: 'error'; error: StepError }
> {
  const unitOfWork = getUnitOfWork();
  const bundleId = randomUUID();
  const planId = randomUUID();
  const bundleResult = await createContextBundleFreezeService({ unitOfWork }).freezeBundle({
    projectId,
    workflowKind,
    bundleId,
    dependencyEntries: entries,
    packets,
  });
  if (bundleResult.kind === 'invalid') return { kind: 'error', error: 'invalid' };
  const bundle = bundleResult.bundle;

  const built = buildWorkflowPlan({
    projectId,
    workflowKind,
    profile: M4_HARNESS_PROFILE,
    priceSnapshots: M4_HARNESS_PRICE_SNAPSHOTS,
  });
  if (built.kind !== 'built') return { kind: 'error', error: 'invalid' };

  const planResult = await createWorkflowPlanFreezeService({ unitOfWork }).freezePlan({
    planId,
    projectId,
    bundleId: bundle.bundleId,
    dependencyHash: bundle.dependencyHash,
    bundleHash: bundle.bundleHash,
    plan: built.plan,
  });
  if (planResult.kind === 'invalid') return { kind: 'error', error: 'invalid' };

  return {
    kind: 'ok',
    planRecordId: planResult.record.id,
    planHash: planResult.record.planHash,
    dependencyHash: bundle.dependencyHash,
    bundleId: bundle.bundleId,
    estimatedMaxMicroIdr: built.plan.estimatedMaxMicroIdr,
  };
}

async function submitIntakeMessage(
  projectId: string,
  userId: string,
  content: string,
): Promise<StepError | null> {
  const unitOfWork = getUnitOfWork();
  const appended = await createAppendIntakeMessage(unitOfWork)({
    ownerUserId: userId,
    projectId,
    content,
  });
  if (!appended.ok) return 'invalid';

  await seedMockPriceSnapshots(unitOfWork);
  const state = await readVerticalContext(projectId);
  if (!state.messages.some((message) => message.role === 'user')) return 'prerequisite';
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
    return 'prerequisite';
  }

  const frozen = await freezeBundleAndPlan(projectId, 'chat_intake_reply', entries, [
    packet,
    recoveryPacket(projectId, dependencyHash, 'chat_intake_reply'),
  ]);
  if (frozen.kind === 'error') return frozen.error;
  const session = await getUnitOfWork().execute((ports) =>
    ports.intake.findSessionByProject(projectId),
  );
  if (!session) return 'prerequisite';

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
      return null;
    case 'fair_use_limited':
      return 'fair_use_limited';
    case 'not_found':
      return 'not_found';
    default:
      return 'conflict';
  }
}

async function buildUserPaidPackets(
  projectId: string,
  kind: M4VerticalWorkflowKind,
): Promise<
  | {
      kind: 'ok';
      entries: dependency.DependencyEntry[];
      packets: ContextPacketLike[];
      payloadTail: JsonObject;
    }
  | { kind: 'error'; error: StepError }
> {
  const state = await readVerticalContext(projectId);
  let entries: dependency.DependencyEntry[];
  let dependencyHash: string;
  try {
    entries = dependencyEntries(state.outline);
    dependencyHash = computeDependencyHash(entries);
  } catch {
    return { kind: 'error', error: 'prerequisite' };
  }

  const beat = state.outline.find((node) => node.entityType === 'beat' && node.deletedAt === null);
  const prose = state.prose;

  try {
    switch (kind) {
      case 'concept_generation': {
        const lastUser = [...state.messages].reverse().find((message) => message.role === 'user');
        if (!lastUser) return { kind: 'error', error: 'prerequisite' };
        const planner = context.buildPlannerPacket({
          kind: 'planner',
          dataClass: 'author_private',
          metadata: packetMetadata(projectId, dependencyHash),
          foundation: {
            coreConcept: lastUser.content,
            conflict: UNDETERMINED,
            endingDirection: UNDETERMINED,
            readerPromise: UNDETERMINED,
          },
          characters: [],
          facts: [],
          reveals: [],
          futureOutline: [],
        });
        return { kind: 'ok', entries, packets: [planner], payloadTail: {} };
      }
      case 'foundation_generation':
      case 'outline_generation': {
        if (!state.foundation) return { kind: 'error', error: 'prerequisite' };
        const planner = context.buildPlannerPacket({
          kind: 'planner',
          dataClass: 'author_private',
          metadata: packetMetadata(projectId, dependencyHash),
          foundation: plannerFoundation(state.foundation.payload),
          characters: [],
          facts: [],
          reveals: [],
          futureOutline: [],
        });
        return { kind: 'ok', entries, packets: [planner], payloadTail: {} };
      }
      case 'beat_write_judge': {
        if (!beat || !prose) return { kind: 'error', error: 'prerequisite' };
        const beatTitle = beatDisplayTitle(beat);
        const writer = context.buildWriterPacket({
          kind: 'writer',
          dataClass: 'writer_safe',
          metadata: packetMetadata(projectId, dependencyHash),
          beatContract: {
            beatId: beat.id,
            purpose: beatTitle,
            sceneGoal: `Selesaikan adegan: ${beatTitle}`,
            directives: [],
          },
          characterDirectives: [],
          establishedFacts: [],
          revealGuidance: [],
          acceptedProseContext: [],
        });
        const validator = context.buildValidatorPacket({
          kind: 'validator',
          dataClass: 'author_private',
          metadata: packetMetadata(projectId, dependencyHash),
          prose: { proseVersionId: prose.id, beatId: prose.beatId, content: prose.content },
          beatContract: {
            beatId: beat.id,
            purpose: beatTitle,
            requiredCharacterIds: [],
            requiredFactKeys: [],
            requiredDirectives: [],
            prohibitedActions: [],
          },
          restrictedGuardSets: [],
          continuityRules: [],
        });
        return {
          kind: 'ok',
          entries,
          packets: [writer, validator],
          payloadTail: { beatId: beat.id },
        };
      }
      case 'safe_repair': {
        if (!beat || !prose) return { kind: 'error', error: 'prerequisite' };
        const repairBeatTitle = beatDisplayTitle(beat);
        const repair = context.buildRepairPacket({
          kind: 'repair',
          dataClass: 'writer_safe',
          metadata: packetMetadata(projectId, dependencyHash),
          repairableProse: {
            proseVersionId: prose.id,
            beatId: prose.beatId,
            content: prose.content,
          },
          directives: [],
          beatContract: {
            beatId: prose.beatId,
            purpose: repairBeatTitle,
            sceneGoal: `Perbaiki adegan: ${repairBeatTitle}`,
            directives: [],
          },
          revealGuidance: [],
        });
        return {
          kind: 'ok',
          entries,
          packets: [repair],
          payloadTail: { beatId: prose.beatId },
        };
      }
      case 'publish_package': {
        if (!prose) return { kind: 'error', error: 'prerequisite' };
        const extraction = context.buildExtractionPacket({
          kind: 'extraction',
          dataClass: 'review_safe',
          metadata: packetMetadata(projectId, dependencyHash),
          useCase: 'prose_public_structure',
          prose: { proseVersionId: prose.id, content: prose.content },
        });
        return {
          kind: 'ok',
          entries,
          packets: [extraction],
          payloadTail: { proseVersionId: prose.id },
        };
      }
      default:
        return { kind: 'error', error: 'invalid' };
    }
  } catch {
    return { kind: 'error', error: 'prerequisite' };
  }
}

async function startUserPaidWorkflow(
  projectId: string,
  userId: string,
  kind: M4VerticalWorkflowKind,
): Promise<StepError | null> {
  const unitOfWork = getUnitOfWork();
  await seedMockPriceSnapshots(unitOfWork);

  const contextResult = await buildUserPaidPackets(projectId, kind);
  if (contextResult.kind === 'error') return contextResult.error;
  // safe_repair's product packet already IS the 'repair' packet; every other
  // workflow needs the parse-repair recovery envelope appended.
  const packets =
    kind === 'safe_repair'
      ? contextResult.packets
      : [
          ...contextResult.packets,
          recoveryPacket(projectId, computeDependencyHash(contextResult.entries), kind),
        ];

  const prepared = await createPaidGenerationPreparationService({ unitOfWork }).prepare({
    projectId,
    workflowKind: kind,
    bundleId: randomUUID(),
    planId: randomUUID(),
    bundle: {
      workflowKind: kind,
      dependencyEntries: contextResult.entries,
      packets,
    },
    profile: M4_HARNESS_PROFILE,
    priceSnapshots: M4_HARNESS_PRICE_SNAPSHOTS,
    userId,
    actionKind: kind,
    issuanceRequestId: randomUUID(),
  });
  if (prepared.kind === 'invalid') return 'invalid';
  if (prepared.kind === 'replayed') return 'conflict';

  const confirmation = createCreditQuoteConfirmationService(unitOfWork);
  const confirmed = await confirmation.confirmQuote({
    userId,
    projectId,
    quoteId: prepared.quote.id,
    ...deriveM4ConfirmationIdentity(prepared.quote.id),
    expectedWorkflowPlanHash: prepared.planHash,
    expectedDependencyHash: prepared.bundle.dependencyHash,
    jobKind: kind,
    bundleId: prepared.bundle.bundleId,
    workflowPlanId: prepared.planRecordId,
    payload: {
      workflowPlanHash: prepared.planHash,
      dependencyHash: prepared.bundle.dependencyHash,
      ...contextResult.payloadTail,
    },
  });
  switch (confirmed.kind) {
    case 'confirmed':
    case 'exact_replay':
      return null;
    case 'insufficient_credit':
      return 'insufficient_credit';
    case 'hash_mismatch':
    case 'expired':
      return 'stale_plan';
    default:
      return 'conflict';
  }
}

export async function sendIntakeMessageAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const content = String(formData.get('content') ?? '');
  const access = await resolveM4VerticalAccess(projectId);
  if (access.kind !== 'allowed') fail(projectId, 'not_found');
  if (!content.trim()) fail(projectId, 'invalid');
  const error = await submitIntakeMessage(projectId, access.userId, content);
  if (error) fail(projectId, error);
  done(projectId);
}

export async function startM4WorkflowAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const kind = String(formData.get('workflowKind') ?? '');
  const access = await resolveM4VerticalAccess(projectId);
  if (access.kind !== 'allowed') fail(projectId, 'not_found');
  if (!(USER_PAID_WORKFLOW_KINDS as readonly string[]).includes(kind)) {
    fail(projectId, 'invalid');
  }
  const error = await startUserPaidWorkflow(
    projectId,
    access.userId,
    kind as M4VerticalWorkflowKind,
  );
  if (error) fail(projectId, error);
  done(projectId);
}

export async function acceptM4ConceptAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const conceptId = String(formData.get('conceptId') ?? '');
  const access = await resolveM4VerticalAccess(projectId);
  if (access.kind !== 'allowed' || !conceptId) fail(projectId, 'not_found');
  const result = await createAcceptConcept(getUnitOfWork())({
    ownerUserId: access.userId,
    projectId,
    conceptId,
  });
  if (!result.ok) fail(projectId, 'conflict');
  done(projectId);
}

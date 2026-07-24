/**
 * Per-operation apply helpers for the single write door (S2.2). Each helper
 * mutates the canon tables via the transaction-scoped ports. M2 covers the
 * user-origin subset; op types requiring AI artifacts fail closed until M5.
 */
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { JsonObject, TxPorts } from '../ports/index.js';

export interface CanonicalOpPersist {
  readonly operationId: string;
  readonly ordinal: number;
  readonly operationType: string;
  readonly targetEntityType: string;
  readonly targetEntityId: string;
  readonly expectedRevision: number | null;
  readonly risk: string;
  readonly payload: JsonObject;
}

export type ApplyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: AppError };

const M2_UNSUPPORTED: ReadonlySet<string> = new Set([
  'state.append',
  'belief.append',
  'disclosure.append',
  'prose.version.create',
  'prose.accept',
]);

/** Apply a single canonical operation inside the commit transaction. */
export async function applyOperation(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  if (M2_UNSUPPORTED.has(op.operationType)) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.unsupported_op', 422, {
        operationType: op.operationType,
      }),
    };
  }

  try {
    switch (op.operationType) {
      case 'foundation.update':
        return await applyFoundationUpdate(ports, op);
      case 'character.create':
        return await applyCharacterCreate(ports, projectId, op);
      case 'character.update':
        return await applyCharacterUpdate(ports, projectId, op);
      case 'fact.create':
        return await applyFactCreate(ports, projectId, op);
      case 'fact.update':
        return await applyFactUpdate(ports, projectId, op);
      case 'reveal.create':
        return await applyRevealCreate(ports, projectId, op);
      case 'reveal.update':
        return await applyRevealUpdate(ports, projectId, op);
      case 'breadcrumb.create':
        return await applyBreadcrumbCreate(ports, projectId, op);
      case 'outline.create':
        return await applyOutlineCreate(ports, projectId, op);
      case 'outline.update':
        return await applyOutlineUpdate(ports, projectId, op);
      default:
        return {
          ok: false,
          error: appError('CHANGE_SET_INVALID', 'msg.changeset.unknown_op', 422, {
            operationType: op.operationType,
          }),
        };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code =
      typeof e === 'object' && e !== null && 'code' in e
        ? String((e as { code: unknown }).code)
        : undefined;
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.apply_failed', 422, {
        message,
        code,
        operationType: op.operationType,
      }),
    };
  }
}

async function applyFoundationUpdate(ports: TxPorts, op: CanonicalOpPersist): Promise<ApplyResult> {
  // targetEntityId for foundation.update is the projectId (1:1 foundation).
  const existing = await ports.foundation.findByProjectId(op.targetEntityId);
  if (!existing) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.foundation_missing', 422),
    };
  }
  const merged: JsonObject = {
    ...(existing.payload as JsonObject),
    ...(op.payload as JsonObject),
  };
  const row = await ports.foundation.applyUpdate(op.targetEntityId, merged, op.expectedRevision);
  return row ? { ok: true } : casFailed();
}

async function applyCharacterCreate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const displayName = stringField(op.payload, 'displayName');
  const role = stringField(op.payload, 'role');
  if (!displayName || !role) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.character_fields', 422),
    };
  }
  await ports.character.insert({
    id: op.targetEntityId,
    projectId,
    displayName,
    role,
    payload: op.payload,
  });
  return { ok: true };
}

async function applyCharacterUpdate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const displayName = stringField(op.payload, 'displayName');
  const role = stringField(op.payload, 'role');
  if (!displayName || !role) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.character_fields', 422),
    };
  }
  const row = await ports.character.update({
    projectId,
    id: op.targetEntityId,
    displayName,
    role,
    payload: op.payload,
    expectedRevision: op.expectedRevision,
  });
  return row ? { ok: true } : casFailed();
}

async function applyFactCreate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const statement = stringField(op.payload, 'statement');
  const factKey = stringField(op.payload, 'factKey') ?? statement;
  // Schema CHECK (facts_canon_status_check / facts_visibility_check).
  const canonStatus = stringField(op.payload, 'canonStatus') ?? 'confirmed';
  const visibility = stringField(op.payload, 'visibility') ?? 'private';
  if (!factKey || !statement) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.fact_fields', 422),
    };
  }
  await ports.fact.insert({
    id: op.targetEntityId,
    projectId,
    factKey,
    canonStatus,
    visibility,
    payload: op.payload,
  });
  return { ok: true };
}

async function applyFactUpdate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const canonStatus = stringField(op.payload, 'canonStatus');
  const visibility = stringField(op.payload, 'visibility');
  if (!canonStatus || !visibility) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.fact_fields', 422),
    };
  }
  const row = await ports.fact.update({
    projectId,
    id: op.targetEntityId,
    canonStatus,
    visibility,
    payload: op.payload,
    expectedRevision: op.expectedRevision,
  });
  return row ? { ok: true } : casFailed();
}

async function applyRevealCreate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const factId = stringField(op.payload, 'factId');
  const chapterId = stringField(op.payload, 'chapterId');
  const targetSequence = numberField(op.payload, 'targetSequence');
  if (!factId || !chapterId || targetSequence === null) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.reveal_refs', 422),
    };
  }
  await ports.reveal.insertReveal({
    id: op.targetEntityId,
    projectId,
    factId,
    chapterId,
    beatId: stringField(op.payload, 'beatId'),
    targetSequence,
    payload: op.payload,
  });
  return { ok: true };
}

async function applyRevealUpdate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const chapterId = stringField(op.payload, 'chapterId');
  const targetSequence = numberField(op.payload, 'targetSequence');
  if (!chapterId || targetSequence === null) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.reveal_refs', 422),
    };
  }
  const row = await ports.reveal.updateReveal({
    projectId,
    id: op.targetEntityId,
    chapterId,
    beatId: stringField(op.payload, 'beatId'),
    targetSequence,
    payload: op.payload,
    expectedRevision: op.expectedRevision,
  });
  return row ? { ok: true } : casFailed();
}

async function applyBreadcrumbCreate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const revealId = stringField(op.payload, 'revealId');
  const chapterId = stringField(op.payload, 'chapterId');
  const sequence = numberField(op.payload, 'sequence');
  if (!revealId || !chapterId || sequence === null) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.breadcrumb_fields', 422),
    };
  }
  await ports.reveal.insertBreadcrumb({
    id: op.targetEntityId,
    projectId,
    revealId,
    chapterId,
    beatId: stringField(op.payload, 'beatId'),
    sequence,
    payload: op.payload,
  });
  return { ok: true };
}

async function applyOutlineCreate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const node = (op.payload as { node?: OutlineNodePayload }).node;
  if (!node) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.outline_node', 422),
    };
  }
  await ports.outline.insertNode({
    entityType: node.kind,
    id: op.targetEntityId,
    projectId,
    parentId: 'parentId' in node ? node.parentId : null,
    title: node.title,
    ordinal: 'ordinal' in node ? node.ordinal : null,
    narrativeSequence: 'narrativeSequence' in node ? node.narrativeSequence : null,
    payload: op.payload,
  });
  return { ok: true };
}

async function applyOutlineUpdate(
  ports: TxPorts,
  projectId: string,
  op: CanonicalOpPersist,
): Promise<ApplyResult> {
  const node = (op.payload as { node?: OutlineNodePayload }).node;
  if (!node) {
    return {
      ok: false,
      error: appError('CHANGE_SET_INVALID', 'msg.changeset.outline_node', 422),
    };
  }
  const row = await ports.outline.updateNode({
    entityType: node.kind,
    projectId,
    id: op.targetEntityId,
    title: node.title,
    payload: op.payload,
    expectedRevision: op.expectedRevision,
  });
  return row ? { ok: true } : casFailed();
}

function casFailed(): ApplyResult {
  return { ok: false, error: appError('CAS_FAILED', 'msg.changeset.cas_failed', 409) };
}

function stringField(payload: JsonObject, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberField(payload: JsonObject, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

type OutlineNodePayload =
  | { readonly kind: 'roadmap'; readonly title: string }
  | {
      readonly kind: 'arc';
      readonly parentId: string;
      readonly title: string;
      readonly ordinal: number;
    }
  | {
      readonly kind: 'chapter';
      readonly parentId: string;
      readonly title: string;
      readonly ordinal: number;
      readonly narrativeSequence: number;
    }
  | {
      readonly kind: 'beat';
      readonly parentId: string;
      readonly title: string;
      readonly purpose: string;
      readonly ordinal: number;
      readonly narrativeSequence: number;
    };

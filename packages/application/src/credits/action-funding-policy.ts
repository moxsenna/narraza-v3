/**
 * Action funding models:
 * - user_paid: requires reservation, affects user credits, settlement charges user up to reservation cap
 * - system_funded: requires reservation (upstream budget-created), zero user balance change, S_target=0
 * - pre_d4_legacy: exact frozen compatibility allowlist for base job kinds only
 */
export type ActionFundingModel = 'user_paid' | 'system_funded' | 'pre_d4_legacy';

/**
 * Frozen list of D4 paid kinds.
 * Explicitly enumerated per spec §6.4 & §10.
 */
export const FROZEN_D4_PAID_KINDS = [
  'concept_generation',
  'create_concepts',
  'foundation_generation',
  'character_generation',
  'outline_generation',
  'scene_generation',
  'beat_write_judge',
  'safe_repair',
  'publish_package',
] as const;

/**
 * Frozen list of D4 free kinds.
 * Explicitly enumerated per spec §6.4 & §10.
 */
export const FROZEN_D4_FREE_KINDS = [
  'chat_intake',
  'chat_intake_reply',
  'intake_reply',
  'deterministic_validator',
  'autosave',
  'navigation',
] as const;

/**
 * Frozen list of pre-D4 legacy base kinds present in baseline at commit df05d77.
 * Exempt from enqueue guard and §9 incident path.
 */
export const FROZEN_PRE_D4_LEGACY_KINDS = [
  'prose',
  'draft_generation',
  'source-kind',
] as const;

const PAID_KIND_SET = new Set<string>(FROZEN_D4_PAID_KINDS);
const FREE_KIND_SET = new Set<string>(FROZEN_D4_FREE_KINDS);
const LEGACY_KIND_SET = new Set<string>(FROZEN_PRE_D4_LEGACY_KINDS);

/**
 * Pure, no-IO resolution of ActionFundingModel from job kind.
 * Throws an Error if kind is unknown (exhaustive mapping requirement).
 */
export function resolveFundingModel(jobKind: string): ActionFundingModel {
  if (PAID_KIND_SET.has(jobKind)) {
    return 'user_paid';
  }
  if (FREE_KIND_SET.has(jobKind)) {
    return 'system_funded';
  }
  if (LEGACY_KIND_SET.has(jobKind)) {
    return 'pre_d4_legacy';
  }
  throw new Error(
    `Unknown job kind '${jobKind}'. Unmapped kinds post-freeze must fail closed and be added to action-funding-policy explicitly.`
  );
}

export type EnqueueValidationResult =
  | { readonly valid: true; readonly fundingModel: ActionFundingModel }
  | {
      readonly valid: false;
      readonly reason:
        | 'missing_reservation_for_paid'
        | 'missing_reservation_for_system_funded'
        | 'unknown_kind';
      readonly fundingModel?: ActionFundingModel;
    };

/**
 * Validates funding model invariants for job enqueue.
 * Asserts pre-insert shape:
 * - pre_d4_legacy: exempt from enqueue guard
 * - user_paid: requires non-null reservationId
 * - system_funded: requires non-null reservationId (created upstream by system budget)
 */
export function validateFundingModelEnqueue(input: {
  kind: string;
  reservationId: string | null | undefined;
}): EnqueueValidationResult {
  let model: ActionFundingModel;
  try {
    model = resolveFundingModel(input.kind);
  } catch {
    return { valid: false, reason: 'unknown_kind' };
  }

  if (model === 'pre_d4_legacy') {
    return { valid: true, fundingModel: model };
  }

  const hasRes = typeof input.reservationId === 'string' && input.reservationId.trim().length > 0;

  if (model === 'user_paid') {
    if (!hasRes) {
      return {
        valid: false,
        reason: 'missing_reservation_for_paid',
        fundingModel: model,
      };
    }
    return { valid: true, fundingModel: model };
  }

  if (model === 'system_funded') {
    if (!hasRes) {
      return {
        valid: false,
        reason: 'missing_reservation_for_system_funded',
        fundingModel: model,
      };
    }
    return { valid: true, fundingModel: model };
  }

  return { valid: true, fundingModel: model };
}

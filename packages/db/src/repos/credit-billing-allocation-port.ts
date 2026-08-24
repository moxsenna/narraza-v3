import { createHash } from 'node:crypto';
import type {
  AppendCreditBillingAllocationInput,
  CreditBillingAllocationPort,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface AllocationRow {
  id: string;
  project_id: string;
  job_id: string;
  reservation_id: string;
  usable_output_kind: string;
  usable_output_ref: string;
  contributing_attempt_ids_hash: string;
  provider_cost_micro_idr: bigint;
  user_settlement_micro_idr: bigint;
  system_subsidy_micro_idr: bigint;
  billing_policy_version: number;
  billing_policy_payload: unknown;
  dedupe_key: string;
}

export function createCreditBillingAllocationPort(tx: TxClient): CreditBillingAllocationPort {
  return {
    async sumEligibleProviderCost(input) {
      const attemptIds = [...new Set(input.contributingAttemptIds)].sort();
      const usage = await loadEligibleUsage(tx, input.projectId, input.jobId, attemptIds);
      if (usage === null) return { kind: 'attempt_binding_invalid' };
      return {
        kind: 'summed',
        providerCostMicroIdr: usage.reduce((sum, row) => sum + row.provider_cost_micro_idr, 0n),
      };
    },

    async appendForUsableOutput(input) {
      const attemptIds = [...new Set(input.contributingAttemptIds)].sort();
      if (attemptIds.length === 0) return { kind: 'attempt_binding_invalid' };
      if (
        input.dedupeKey !==
        `allocation:${input.reservationId}:${input.usableOutputKind}:${input.usableOutputRef}`
      ) {
        return { kind: 'conflict' };
      }

      const usage = await loadEligibleUsage(tx, input.projectId, input.jobId, attemptIds);
      if (usage === null) return { kind: 'attempt_binding_invalid' };

      const providerCost = usage.reduce((sum, row) => sum + row.provider_cost_micro_idr, 0n);
      if (providerCost !== input.providerCostMicroIdr) return { kind: 'conflict' };

      const attemptsHash = createHash('sha256').update(JSON.stringify(attemptIds)).digest('hex');
      const policyPayload = {
        contributingAttemptIds: attemptIds,
        eligibility: 'durable_output_winner',
        settlement: 'min_eligible_provider_cost_reserved',
      };
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_billing_allocations
           (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,
            contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,
            system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11::jsonb,$12,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.id,
        input.projectId,
        input.jobId,
        input.reservationId,
        input.usableOutputKind,
        input.usableOutputRef,
        attemptsHash,
        input.providerCostMicroIdr,
        input.userSettlementMicroIdr,
        input.systemSubsidyMicroIdr,
        JSON.stringify(policyPayload),
        input.dedupeKey,
      )) as Array<{ id: string }>;
      if (inserted[0]) return { kind: 'appended', allocationId: inserted[0].id };

      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,
                contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,
                system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key
           FROM credit_billing_allocations WHERE dedupe_key=$1`,
        input.dedupeKey,
      )) as AllocationRow[];
      const row = rows[0];
      return row && exact(row, input, attemptsHash, policyPayload)
        ? { kind: 'replayed', allocationId: row.id }
        : { kind: 'conflict' };
    },
  };
}

async function loadEligibleUsage(
  tx: TxClient,
  projectId: string,
  jobId: string,
  attemptIds: readonly string[],
): Promise<Array<{ provider_cost_micro_idr: bigint }> | null> {
  if (attemptIds.length === 0) return null;
  const usage = (await tx.$queryRawUnsafe(
    `SELECT ga.id,wi.winner_attempt_id,ue.provider_cost_micro_idr
       FROM unnest($1::text[]) requested(id)
       LEFT JOIN generation_attempts ga
         ON ga.id=requested.id AND ga.project_id=$2 AND ga.job_id=$3
       LEFT JOIN workflow_invocations wi
         ON wi.project_id=ga.project_id AND wi.job_id=ga.job_id
        AND wi.id=ga.invocation_id
       LEFT JOIN ai_usage_events ue
         ON ue.project_id=ga.project_id AND ue.job_id=ga.job_id
        AND ue.attempt_id=ga.id AND ue.dedupe_key='usage:' || ga.id
      ORDER BY requested.id`,
    attemptIds,
    projectId,
    jobId,
  )) as Array<{
    id: string | null;
    winner_attempt_id: string | null;
    provider_cost_micro_idr: bigint | null;
  }>;
  if (
    usage.length !== attemptIds.length ||
    usage.some(
      (row) =>
        row.id === null || row.winner_attempt_id !== row.id || row.provider_cost_micro_idr === null,
    )
  ) {
    return null;
  }
  return usage as Array<{ provider_cost_micro_idr: bigint }>;
}

function exact(
  row: AllocationRow,
  input: AppendCreditBillingAllocationInput,
  attemptsHash: string,
  policyPayload: Record<string, unknown>,
): boolean {
  return (
    row.id === input.id &&
    row.project_id === input.projectId &&
    row.job_id === input.jobId &&
    row.reservation_id === input.reservationId &&
    row.usable_output_kind === input.usableOutputKind &&
    row.usable_output_ref === input.usableOutputRef &&
    row.contributing_attempt_ids_hash === attemptsHash &&
    row.provider_cost_micro_idr === input.providerCostMicroIdr &&
    row.user_settlement_micro_idr === input.userSettlementMicroIdr &&
    row.system_subsidy_micro_idr === input.systemSubsidyMicroIdr &&
    row.billing_policy_version === 1 &&
    samePolicyPayload(row.billing_policy_payload, policyPayload) &&
    row.dedupe_key === input.dedupeKey
  );
}

function samePolicyPayload(actual: unknown, expected: Record<string, unknown>): boolean {
  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) return false;
  const value = actual as Record<string, unknown>;
  return (
    value.eligibility === expected.eligibility &&
    value.settlement === expected.settlement &&
    JSON.stringify(value.contributingAttemptIds) === JSON.stringify(expected.contributingAttemptIds)
  );
}

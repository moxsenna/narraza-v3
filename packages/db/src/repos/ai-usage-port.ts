import type { AiUsagePort, GenerationAttemptRecord, UsageMetrics } from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface UsageRow {
  project_id: string | null;
  job_id: string | null;
  attempt_id: string | null;
  price_snapshot_id: string;
  input_tokens: number;
  output_tokens: number;
  provider_cost_micro_idr: bigint;
  charged_party: string;
  dedupe_key: string;
}

export function createAiUsagePort(tx: TxClient, allocateId: () => string): AiUsagePort {
  return {
    async appendForAttempt(attempt: GenerationAttemptRecord, metrics: UsageMetrics) {
      const binding = (await tx.$queryRawUnsafe(
        `SELECT ga.id FROM generation_attempts ga
          JOIN workflow_invocations wi
            ON wi.project_id=ga.project_id AND wi.job_id=ga.job_id AND wi.id=ga.invocation_id
         WHERE ga.project_id=$1 AND ga.job_id=$2 AND ga.invocation_id=$3 AND ga.id=$4
         FOR UPDATE OF ga`,
        attempt.projectId,
        attempt.jobId,
        attempt.invocationId,
        attempt.id,
      )) as Array<{ id: string }>;
      if (!binding[0]) return { kind: 'conflict' };
      const dedupeKey = `usage:${attempt.id}`;
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO ai_usage_events
          (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,
           provider_cost_micro_idr,charged_party,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'system',$9,now())
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING dedupe_key`,
        allocateId(),
        attempt.projectId,
        attempt.jobId,
        attempt.id,
        metrics.priceSnapshotId,
        metrics.inputTokens,
        metrics.outputTokens,
        metrics.providerCostMicroIdr,
        dedupeKey,
      )) as Array<{ dedupe_key: string }>;
      if (inserted[0]) return { kind: 'appended' };
      const rows = (await tx.$queryRawUnsafe(
        `SELECT project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,
                provider_cost_micro_idr,charged_party,dedupe_key
           FROM ai_usage_events WHERE dedupe_key=$1`,
        dedupeKey,
      )) as UsageRow[];
      const row = rows[0];
      const equal =
        row?.project_id === attempt.projectId &&
        row.job_id === attempt.jobId &&
        row.attempt_id === attempt.id &&
        row.price_snapshot_id === metrics.priceSnapshotId &&
        row.input_tokens === metrics.inputTokens &&
        row.output_tokens === metrics.outputTokens &&
        row.provider_cost_micro_idr === metrics.providerCostMicroIdr &&
        row.charged_party === 'system';
      return equal ? { kind: 'replayed' } : { kind: 'conflict' };
    },
  };
}

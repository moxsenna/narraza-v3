import type {
  BeginAttemptInput,
  BeginAttemptPortResult,
  FinalizeAttemptInput,
  GenerationAttemptPort,
  GenerationAttemptRecord,
  JsonObject,
  WinnerClassificationResult,
  WorkflowInvocationPort,
  WorkflowInvocationRecord,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface InvocationRow {
  id: string;
  project_id: string;
  job_id: string;
  stage_key: string;
  status: WorkflowInvocationRecord['status'];
  winner_attempt_id: string | null;
  fence_version: number;
  created_at: Date;
  updated_at: Date;
}
interface AttemptRow {
  id: string;
  project_id: string;
  job_id: string;
  invocation_id: string;
  ordinal: number;
  status: GenerationAttemptRecord['status'];
  provider_request_id: string | null;
  result_hash: string | null;
  started_at: Date;
  finished_at: Date | null;
  schema_version: number;
  payload: unknown;
  created_at: Date;
  updated_at: Date;
}

const invocationColumns =
  'id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at';
const attemptColumns =
  'id,project_id,job_id,invocation_id,ordinal,status,provider_request_id,result_hash,started_at,finished_at,schema_version,payload,created_at,updated_at';
const invocationRecord = (r: InvocationRow): WorkflowInvocationRecord => ({
  id: r.id,
  projectId: r.project_id,
  jobId: r.job_id,
  stageKey: r.stage_key,
  status: r.status,
  winnerAttemptId: r.winner_attempt_id,
  fenceVersion: r.fence_version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const attemptRecord = (r: AttemptRow): GenerationAttemptRecord => ({
  id: r.id,
  projectId: r.project_id,
  jobId: r.job_id,
  invocationId: r.invocation_id,
  ordinal: r.ordinal,
  status: r.status,
  providerRequestId: r.provider_request_id,
  resultHash: r.result_hash,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  schemaVersion: r.schema_version,
  payload: r.payload as JsonObject,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function createWorkflowInvocationRepo(
  tx: TxClient,
): WorkflowInvocationPort & GenerationAttemptPort {
  return {
    async beginAttempt(input: BeginAttemptInput): Promise<BeginAttemptPortResult> {
      await tx.$queryRawUnsafe(
        `INSERT INTO workflow_invocations (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at) VALUES ($1,$2,$3,$4,'running',NULL,0,now(),now()) ON CONFLICT DO NOTHING`,
        input.invocationId,
        input.projectId,
        input.jobId,
        input.stageKey,
      );
      const invocations = (await tx.$queryRawUnsafe(
        `SELECT ${invocationColumns} FROM workflow_invocations WHERE project_id=$1 AND job_id=$2 AND stage_key=$3 FOR UPDATE`,
        input.projectId,
        input.jobId,
        input.stageKey,
      )) as InvocationRow[];
      const invocation = invocations[0];
      if (!invocation || invocation.id !== input.invocationId || invocation.status !== 'running')
        return { kind: 'conflict' };
      const existing = (await tx.$queryRawUnsafe(
        `SELECT ${attemptColumns},
                status='started' AND schema_version=$5 AND payload=$6::jsonb AS semantic_equal
           FROM generation_attempts
          WHERE project_id=$1 AND job_id=$2 AND invocation_id=$3 AND id=$4`,
        input.projectId,
        input.jobId,
        input.invocationId,
        input.attemptId,
        input.schemaVersion,
        JSON.stringify(input.payload),
      )) as Array<AttemptRow & { semantic_equal: boolean }>;
      if (existing[0]) {
        const row = existing[0];
        return row.semantic_equal
          ? {
              kind: 'already_started',
              invocation: invocationRecord(invocation),
              attempt: attemptRecord(row),
            }
          : { kind: 'conflict' };
      }
      const rows = (await tx.$queryRawUnsafe(
        `INSERT INTO generation_attempts (id,project_id,job_id,invocation_id,ordinal,status,provider_request_id,result_hash,started_at,finished_at,schema_version,payload,created_at,updated_at) SELECT $1,$2,$3,$4,COALESCE(MAX(ordinal),-1)+1,'started',NULL,NULL,now(),NULL,$5,$6::jsonb,now(),now() FROM generation_attempts WHERE invocation_id=$4 RETURNING ${attemptColumns}`,
        input.attemptId,
        input.projectId,
        input.jobId,
        input.invocationId,
        input.schemaVersion,
        JSON.stringify(input.payload),
      )) as AttemptRow[];
      return {
        kind: 'started',
        invocation: invocationRecord(invocation),
        attempt: attemptRecord(rows[0]!),
      };
    },

    async finalizeAttempt(input: FinalizeAttemptInput) {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_attempts SET status=$5,provider_request_id=$6,result_hash=$7,finished_at=now(),schema_version=$8,payload=$9::jsonb,updated_at=now() WHERE project_id=$1 AND job_id=$2 AND invocation_id=$3 AND id=$4 AND status='started' RETURNING ${attemptColumns}`,
        input.projectId,
        input.jobId,
        input.invocationId,
        input.attemptId,
        input.status,
        input.providerRequestId,
        input.resultHash,
        input.schemaVersion,
        JSON.stringify(input.payload),
      )) as AttemptRow[];
      if (rows[0]) return { kind: 'finalized' as const, attempt: attemptRecord(rows[0]) };
      const current = (await tx.$queryRawUnsafe(
        `SELECT ${attemptColumns},
                status=$5
                AND provider_request_id IS NOT DISTINCT FROM $6::text
                AND result_hash IS NOT DISTINCT FROM $7::text
                AND schema_version=$8
                AND payload=$9::jsonb AS semantic_equal
           FROM generation_attempts
          WHERE project_id=$1 AND job_id=$2 AND invocation_id=$3 AND id=$4
          FOR UPDATE`,
        input.projectId,
        input.jobId,
        input.invocationId,
        input.attemptId,
        input.status,
        input.providerRequestId,
        input.resultHash,
        input.schemaVersion,
        JSON.stringify(input.payload),
      )) as Array<AttemptRow & { semantic_equal: boolean }>;
      const row = current[0];
      if (!row) return { kind: 'not_authorized' as const };
      return row.semantic_equal
        ? { kind: 'replayed' as const, attempt: attemptRecord(row) }
        : { kind: 'conflict' as const };
    },

    async classifyWinner(
      input: FinalizeAttemptInput,
      attempt: GenerationAttemptRecord,
      allowSelection: boolean,
    ): Promise<WinnerClassificationResult> {
      const projects = (await tx.$queryRawUnsafe(
        `SELECT deleted_at FROM projects WHERE id=$1 FOR UPDATE`,
        input.projectId,
      )) as Array<{ deleted_at: Date | null }>;
      if (!projects[0]) return { kind: 'not_authorized' };
      if (projects[0].deleted_at) return { kind: 'classified', winner: 'project_tombstoned' };
      const jobs = (await tx.$queryRawUnsafe(
        `SELECT lease_token,fence_version,status,cancel_requested_at,lease_expires_at > clock_timestamp() AS live FROM generation_jobs WHERE project_id=$1 AND id=$2 FOR UPDATE`,
        input.projectId,
        input.jobId,
      )) as Array<{
        lease_token: string | null;
        fence_version: number;
        status: string;
        cancel_requested_at: Date | null;
        live: boolean;
      }>;
      const job = jobs[0];
      if (!job) return { kind: 'not_authorized' };
      if (job.cancel_requested_at) return { kind: 'classified', winner: 'cancelled' };
      if (
        job.lease_token !== input.leaseToken ||
        job.fence_version !== input.fenceVersion ||
        job.status !== 'running' ||
        !job.live
      )
        return { kind: 'classified', winner: 'ineligible_owner' };
      if (attempt.status === 'failed') return { kind: 'classified', winner: 'attempt_failed' };
      if (!allowSelection) {
        const replay = (await tx.$queryRawUnsafe(
          `SELECT winner_attempt_id FROM workflow_invocations
            WHERE project_id=$1 AND job_id=$2 AND id=$3`,
          input.projectId,
          input.jobId,
          input.invocationId,
        )) as Array<{ winner_attempt_id: string | null }>;
        if (!replay[0]) return { kind: 'not_authorized' };
        return {
          kind: 'classified',
          winner:
            replay[0].winner_attempt_id === null
              ? 'not_selected'
              : replay[0].winner_attempt_id === input.attemptId
                ? 'selected_replay'
                : 'already_won_by_other',
        };
      }
      if (allowSelection) {
        const selected = (await tx.$queryRawUnsafe(
          `UPDATE workflow_invocations wi SET winner_attempt_id=$4,status='succeeded',updated_at=now() FROM generation_attempts ga WHERE wi.project_id=$1 AND wi.job_id=$2 AND wi.id=$3 AND wi.status='running' AND wi.winner_attempt_id IS NULL AND ga.project_id=wi.project_id AND ga.job_id=wi.job_id AND ga.invocation_id=wi.id AND ga.id=$4 AND ga.status='succeeded' RETURNING wi.winner_attempt_id`,
          input.projectId,
          input.jobId,
          input.invocationId,
          input.attemptId,
        )) as Array<{ winner_attempt_id: string }>;
        if (selected[0]) return { kind: 'classified', winner: 'selected' };
      }
      const rows = (await tx.$queryRawUnsafe(
        `SELECT winner_attempt_id FROM workflow_invocations WHERE project_id=$1 AND job_id=$2 AND id=$3`,
        input.projectId,
        input.jobId,
        input.invocationId,
      )) as Array<{ winner_attempt_id: string | null }>;
      if (!rows[0] || rows[0].winner_attempt_id === null) return { kind: 'conflict' };
      return {
        kind: 'classified',
        winner:
          rows[0].winner_attempt_id === input.attemptId
            ? 'selected_replay'
            : 'already_won_by_other',
      };
    },
  };
}

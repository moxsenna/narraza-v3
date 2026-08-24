import {
  createStaleClosingReservationService,
  createWorkflowInvocationService,
} from '@narraza/application';
import type { Pool } from 'pg';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import {
  createPrismaForUrl,
  insertQueuedJobRow,
  insertReservationBinding,
  setTerminal,
} from './job-test-fixtures.js';

const suite = createSchemaTestSuite();
const HOUR_MS = 60 * 60 * 1_000;

async function seedClosing(
  client: Pool,
  input: {
    id: number;
    fundingModel?: 'user_paid' | 'system_funded';
    settled?: bigint;
    ageMs: number;
    terminalStatus?: 'failed' | 'cancelled';
    attempt?: boolean;
  },
) {
  const suffix = input.id.toString().padStart(12, '0');
  const jobId = `7c000000-0000-4000-8000-${suffix}`;
  const reservationId = `7c100000-0000-4000-8000-${suffix}`;
  const reserved = 1_000n;
  const settled = input.settled ?? 0n;
  await insertQueuedJobRow(client, {
    id: jobId,
    projectId: ids.projectA,
    kind: input.fundingModel === 'system_funded' ? 'chat_intake' : 'scene_generation',
  });
  await insertReservationBinding(client, {
    reservationId,
    jobId,
    projectId: ids.projectA,
    userId: ids.userA,
    reservedMicroIdr: reserved,
  });
  await setTerminal(client, jobId, input.terminalStatus ?? 'failed');
  await client.query(
    `UPDATE credit_reservations
        SET status='closing',funding_model=$2,job_project_id=$3,
            settled_micro_idr=$4,released_micro_idr=0,exposure_micro_idr=$5,
            closing_at=clock_timestamp()-($6::bigint * interval '1 millisecond'),updated_at=now()
      WHERE id=$1`,
    [
      reservationId,
      input.fundingModel ?? 'user_paid',
      ids.projectA,
      settled,
      reserved - settled,
      BigInt(input.ageMs),
    ],
  );
  if (input.settled && input.settled > 0n) {
    await client.query(
      `INSERT INTO credit_billing_allocations
         (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,
          contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,
          system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key,created_at)
       VALUES ($1,$2,$3,$4,'scene','output','hash',$5,$5,0,1,'{}',$6,now())`,
      [
        `allocation-${input.id}`,
        ids.projectA,
        jobId,
        reservationId,
        input.settled,
        `allocation-key-${input.id}`,
      ],
    );
  }
  if (input.attempt) {
    await client.query(
      `INSERT INTO workflow_invocations
         (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at)
       VALUES ($1,$2,$3,'writer','running',NULL,0,now(),now())`,
      [`invocation-${input.id}`, ids.projectA, jobId],
    );
    await client.query(
      `INSERT INTO generation_attempts
         (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
       VALUES ($1,$2,$3,$4,0,'started',now(),NULL,1,'{}',now(),now())`,
      [`attempt-${input.id}`, ids.projectA, jobId, `invocation-${input.id}`],
    );
  }
  return { jobId, reservationId, attemptId: `attempt-${input.id}` };
}

suite.test(
  'stale-closing sweeper uses strict PostgreSQL clock boundary and preserves terminal rows',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    const stale = await seedClosing(client, { id: 1, ageMs: 24 * HOUR_MS + 5_000 });
    const fresh = await seedClosing(client, { id: 2, ageMs: 24 * HOUR_MS - 60_000 });
    const boundary = await seedClosing(client, { id: 3, ageMs: 24 * HOUR_MS - 30_000 });
    const terminal = await seedClosing(client, { id: 4, ageMs: 25 * HOUR_MS });
    await client.query(
      `UPDATE credit_reservations SET status='released',released_micro_idr=reserved_micro_idr,exposure_micro_idr=0 WHERE id=$1`,
      [terminal.reservationId],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const service = createStaleClosingReservationService(createUnitOfWork(prisma));
      const result = await service.sweep();
      if (result.closed !== 1)
        throw new Error(`expected one stale close, received ${result.closed}`);
      const rows = await client.query(
        `SELECT id,status,released_micro_idr::text,exposure_micro_idr::text FROM credit_reservations ORDER BY id`,
      );
      const byId = new Map(rows.rows.map((row) => [row.id, row]));
      if (byId.get(stale.reservationId)?.status !== 'released')
        throw new Error('stale row not closed');
      if (byId.get(fresh.reservationId)?.status !== 'closing') throw new Error('fresh row changed');
      if (byId.get(boundary.reservationId)?.status !== 'closing')
        throw new Error('boundary row changed');
      if (byId.get(terminal.reservationId)?.status !== 'released')
        throw new Error('terminal row reopened');
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'stale-closing allocation and unresolved usage preserve settlement, release remainder, and replay safely',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    const row = await seedClosing(client, {
      id: 10,
      settled: 300n,
      ageMs: 25 * HOUR_MS,
      attempt: true,
    });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const service = createStaleClosingReservationService(createUnitOfWork(prisma));
      await service.sweep();
      await service.sweep();
      const closed = (
        await client.query(
          `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,
              (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger_count,
              (SELECT dedupe_key FROM credit_ledger WHERE reservation_id=$1) dedupe_key
         FROM credit_reservations WHERE id=$1`,
          [row.reservationId],
        )
      ).rows[0];
      if (
        closed.status !== 'settled' ||
        closed.settled_micro_idr !== '300' ||
        closed.released_micro_idr !== '700' ||
        closed.exposure_micro_idr !== '0'
      )
        throw new Error('allocation conservation failed');
      if (
        closed.ledger_count !== 1 ||
        closed.dedupe_key !== `release:${row.reservationId}:final-close`
      )
        throw new Error('release dedupe failed');

      await client.query(
        `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
       VALUES ('stale-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
      );
      const lateResult = await createWorkflowInvocationService(
        createUnitOfWork(prisma),
      ).finalizeAttempt({
        projectId: ids.projectA,
        jobId: row.jobId,
        leaseToken: 'stale-owner',
        fenceVersion: 0,
        invocationId: 'invocation-10',
        attemptId: row.attemptId,
        status: 'failed',
        providerRequestId: 'late',
        resultHash: null,
        schemaVersion: 1,
        payload: {},
        usage: {
          priceSnapshotId: 'stale-price',
          inputTokens: 1,
          outputTokens: 1,
          providerCostMicroIdr: 50n,
        },
      });
      if (lateResult.kind !== 'finalized') throw new Error('late attempt did not finalize');
      const late = (
        await client.query(
          `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,
              (SELECT status FROM generation_jobs WHERE id=$3) job_status,
              (SELECT charged_party FROM ai_usage_events WHERE attempt_id=$2) charged_party,
              (SELECT provider_cost_micro_idr::text FROM ai_usage_events WHERE attempt_id=$2) provider_cost,
              (SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2) usage_count,
              (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger_count,
              (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1 AND entry_type='reservation_settlement') settlement_count,
              (SELECT count(*)::int FROM credit_billing_allocations WHERE reservation_id=$1) allocation_count,
              (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$3) outbox_count
         FROM credit_reservations WHERE id=$1`,
          [row.reservationId, row.attemptId, row.jobId],
        )
      ).rows[0];
      if (
        late.status !== 'settled' ||
        late.settled_micro_idr !== '300' ||
        late.released_micro_idr !== '700' ||
        late.exposure_micro_idr !== '0' ||
        late.job_status !== 'failed' ||
        late.charged_party !== 'system' ||
        late.provider_cost !== '50' ||
        late.usage_count !== 1 ||
        late.ledger_count !== 1 ||
        late.settlement_count !== 0 ||
        late.allocation_count !== 1 ||
        late.outbox_count !== 0
      )
        throw new Error('late liability changed terminal accounting');
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'stale-closing concurrent workers close independent system-funded rows without ledger',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    const first = await seedClosing(client, {
      id: 20,
      fundingModel: 'system_funded',
      ageMs: 25 * HOUR_MS,
    });
    const second = await seedClosing(client, {
      id: 21,
      fundingModel: 'system_funded',
      ageMs: 25 * HOUR_MS,
    });
    const prismaA = createPrismaForUrl(databaseUrl);
    const prismaB = createPrismaForUrl(databaseUrl);
    try {
      const [a, b] = await Promise.all([
        createStaleClosingReservationService(createUnitOfWork(prismaA)).sweep({ batchSize: 2 }),
        createStaleClosingReservationService(createUnitOfWork(prismaB)).sweep({ batchSize: 2 }),
      ]);
      const rows = await client.query(
        `SELECT id,status,released_micro_idr::text,exposure_micro_idr::text FROM credit_reservations WHERE id=ANY($1::text[]) ORDER BY id`,
        [[first.reservationId, second.reservationId]],
      );
      if (
        rows.rows.some(
          (row) =>
            row.status !== 'released' ||
            row.released_micro_idr !== '1000' ||
            row.exposure_micro_idr !== '0',
        )
      )
        throw new Error('concurrent system-funded close failed');
      const ledger = await client.query(
        `SELECT count(*)::int count FROM credit_ledger WHERE reservation_id=ANY($1::text[])`,
        [[first.reservationId, second.reservationId]],
      );
      if (ledger.rows[0].count !== 0) throw new Error('system-funded ledger written');
      if (a.closed + b.closed !== 2) throw new Error('workers did not claim distinct candidates');
    } finally {
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  },
);

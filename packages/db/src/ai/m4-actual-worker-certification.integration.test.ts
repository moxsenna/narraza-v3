import { createHash } from 'node:crypto';
import { buildWorkflowPlan, type GenerationJobRecord, type JsonObject } from '@narraza/application';
import {
  createM4MockProvider,
  createMockProvider,
  type MockFixture,
  type ProviderPort,
  type SingleAttemptRequest,
} from '@narraza/ai';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import {
  createM4JobProcessor,
  M4_WORKFLOW_KINDS,
} from '../../../../apps/worker-gen/src/m4-job-processor.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedPlanningGraph } from '../schema-test/fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

const suite = createSchemaTestSuite();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const PRICE_ID = 'm4-cert-price';
const MODEL_ID = 'mock/narra-cert-v1';
const RESERVED = 10_000n;

const WORKFLOWS = M4_WORKFLOW_KINDS.map((kind, index) => ({
  kind,
  suffix: `${index + 1}-${kind.replaceAll('_', '-')}`,
}));

type WorkflowKind = (typeof M4_WORKFLOW_KINDS)[number];
type ProviderHook = (input: {
  request: SingleAttemptRequest;
  call: number;
  stageCall: number;
  stageKey: string;
}) => Promise<string | undefined> | string | undefined;

interface SeededWorkerCase {
  readonly job: GenerationJobRecord;
  readonly plan: ReturnType<typeof requireBuiltPlan>;
  readonly reservationId: string;
}

function requireBuiltPlan(kind: WorkflowKind, maxInvocations = 2) {
  const result = buildWorkflowPlan({
    projectId: ids.projectA,
    workflowKind: kind,
    profile: {
      providerId: 'mock',
      requestedModelId: MODEL_ID,
      resolvedModelId: MODEL_ID,
      structuredOutput: true,
      timeoutMs: 5_000,
      maxInputTokens: 4_000,
      maxOutputTokens: 1_000,
      priceSnapshotId: PRICE_ID,
      maxInvocations,
    },
    priceSnapshots: [
      {
        id: PRICE_ID,
        providerId: 'mock',
        requestedModelId: MODEL_ID,
        resolvedModelId: MODEL_ID,
        inputRateMicroIdr: 1n,
        outputRateMicroIdr: 1n,
      },
    ],
  });
  if (result.kind !== 'built') throw new Error(`failed to build ${kind} certification plan`);
  return result.plan;
}

function payloadFor(kind: WorkflowKind): JsonObject {
  switch (kind) {
    case 'chat_intake_reply':
      return { intakeSessionId: 'm4-cert-intake' };
    case 'beat_write_judge':
    case 'safe_repair':
      return { beatId: ids.beatA };
    case 'publish_package':
      return { proseVersionId: 'm4-cert-prose' };
    default:
      return {};
  }
}

async function seedSharedRows(client: Pool): Promise<void> {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO model_price_snapshots
       (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,
        output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
     VALUES ($1,'mock',$2,$2,1,1,'IDR',now(),1,'{}',now())`,
    [PRICE_ID, MODEL_ID],
  );
  await client.query(
    `INSERT INTO intake_sessions
       (id,project_id,status,signal_count,schema_version,payload,created_at,updated_at)
     VALUES ('m4-cert-intake',$1,'active',0,1,'{}',now(),now())`,
    [ids.projectA],
  );
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,status,revision,content,content_hash,created_at)
     VALUES ('m4-cert-prose',$1,$2,'draft',0,'Certification prose',$3,now())`,
    [ids.projectA, ids.beatA, hash('Certification prose')],
  );
}

async function seedWorkerCase(
  client: Pool,
  kind: WorkflowKind,
  suffix: string,
  options: { maxInvocations?: number } = {},
): Promise<SeededWorkerCase> {
  const plan = requireBuiltPlan(kind, options.maxInvocations);
  const jobId = `m4-cert-job-${suffix}`;
  const bundleId = `m4-cert-bundle-${suffix}`;
  const planId = `m4-cert-plan-${suffix}`;
  const reservationId = `m4-cert-reservation-${suffix}`;
  const leaseToken = `m4-cert-lease-${suffix}`;
  const dependencyHash = hash(`dependency:${suffix}`);
  const planHash = hash(`plan:${suffix}:${JSON.stringify(plan.spec)}`);
  const packetKinds = [...new Set(plan.spec.stages.map((stage) => stage.packetKind))];

  for (const packetKind of packetKinds) {
    const stage = plan.spec.stages.find((candidate) => candidate.packetKind === packetKind)!;
    const packetPayload = {
      kind: packetKind,
      dataClass: stage.dataClass,
      metadata: { projectId: ids.projectA, dependencyHash },
      content: { certification: suffix, packetKind },
    };
    await client.query(
      `INSERT INTO context_snapshots
         (id,project_id,packet_kind,data_class,dependency_hash,content_hash,
          schema_version,payload,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7::jsonb,now())`,
      [
        `${bundleId}:${packetKind}`,
        ids.projectA,
        packetKind,
        stage.dataClass === 'author_private' || stage.dataClass === 'service_restricted'
          ? 'restricted'
          : stage.dataClass,
        dependencyHash,
        hash(JSON.stringify(packetPayload)),
        JSON.stringify(packetPayload),
      ],
    );
  }
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,
        schema_version,payload,created_at)
     VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour',1,$6::jsonb,now())`,
    [
      bundleId,
      ids.projectA,
      `${bundleId}:${packetKinds[0]}`,
      dependencyHash,
      hash(`bundle:${suffix}`),
      JSON.stringify({ packetKinds }),
    ],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,
        schema_version,payload,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7::jsonb,now())`,
    [
      planId,
      ids.projectA,
      bundleId,
      kind,
      planHash,
      plan.estimatedMaxMicroIdr,
      JSON.stringify(plan.spec),
    ],
  );
  const fundingModel = kind === 'chat_intake_reply' ? 'system_funded' : 'user_paid';
  const payload: JsonObject = {
    workflowPlanHash: planHash,
    dependencyHash,
    ...payloadFor(kind),
  };
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,lease_token,lease_expires_at,
        fence_version,bundle_id,workflow_plan_id,reservation_id,schema_version,payload,
        created_at,updated_at)
     VALUES ($1,$2,$3,'running',0,now(),$4,now()+interval '1 hour',1,$5,$6,NULL,1,$7::jsonb,now(),now())`,
    [jobId, ids.projectA, kind, leaseToken, bundleId, planId, JSON.stringify(payload)],
  );
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,job_project_id,job_id,status,funding_model,
        reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,
        created_at,updated_at)
     VALUES ($1,$2,$3,$3,$4,'open',$5,$6,0,0,$6,now(),now())`,
    [reservationId, ids.userA, ids.projectA, jobId, fundingModel, RESERVED],
  );
  await client.query(`UPDATE generation_jobs SET reservation_id=$2 WHERE id=$1`, [
    jobId,
    reservationId,
  ]);

  return {
    plan,
    reservationId,
    job: {
      id: jobId,
      projectId: ids.projectA,
      kind,
      status: 'running',
      priority: 0,
      availableAt: new Date(),
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      fenceVersion: 1,
      cancelRequestedAt: null,
      retryOfJobId: null,
      bundleId,
      workflowPlanId: planId,
      reservationId,
      schemaVersion: 1,
      payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function stageKey(request: SingleAttemptRequest): string {
  const scenario = request.mockScenario;
  if (typeof scenario !== 'string') throw new Error('actual worker omitted mock stage scenario');
  return scenario;
}

function instrumentedProvider(hook?: ProviderHook) {
  const success = createM4MockProvider();
  const faults = createMockProvider([
    {
      scenario: 'judge-reject',
      body: JSON.stringify({ verdict: 'fail', publicMessageCode: 'msg.judge.reject' }),
      inputTokens: 10,
      outputTokens: 20,
    },
  ] satisfies MockFixture[]);
  const calls: Array<{ stageKey: string; scenario: string }> = [];
  const perStage = new Map<string, number>();
  const provider: ProviderPort = {
    async executeSingleAttempt(request) {
      const key = stageKey(request);
      const count = (perStage.get(key) ?? 0) + 1;
      perStage.set(key, count);
      const scenario =
        (await hook?.({
          request,
          call: calls.length + 1,
          stageCall: count,
          stageKey: key,
        })) ?? key;
      calls.push({ stageKey: key, scenario });
      const selected = scenario === 'judge-reject' ? faults : success;
      return selected.executeSingleAttempt({ ...request, mockScenario: scenario });
    },
  };
  return { provider, calls, perStage };
}

async function process(
  databaseUrl: string,
  job: GenerationJobRecord,
  provider: ProviderPort,
  signal = new AbortController().signal,
) {
  const prisma = createPrismaForUrl(databaseUrl);
  try {
    return await createM4JobProcessor({
      unitOfWork: createUnitOfWork(prisma),
      providers: new Map([['mock', provider]]),
    })(job, signal);
  } finally {
    await prisma.$disconnect();
  }
}

async function attemptRows(client: Pool, jobId: string) {
  return (
    await client.query(
      `SELECT i.stage_key,a.status,a.ordinal,a.payload,a.provider_request_id,
              u.input_tokens,u.output_tokens,u.provider_cost_micro_idr::text AS provider_cost
         FROM generation_attempts a
         JOIN workflow_invocations i ON i.id=a.invocation_id
         LEFT JOIN ai_usage_events u ON u.attempt_id=a.id
        WHERE a.job_id=$1
        ORDER BY a.created_at,a.id`,
      [jobId],
    )
  ).rows;
}

async function terminalSnapshot(client: Pool, jobId: string) {
  return (
    await client.query(
      `SELECT j.status,r.status AS reservation_status,
              r.settled_micro_idr::text AS settled,
              r.released_micro_idr::text AS released,
              r.exposure_micro_idr::text AS exposure,
              (SELECT count(*)::int FROM credit_billing_allocations WHERE job_id=j.id) AS allocations
         FROM generation_jobs j
         JOIN credit_reservations r ON r.id=j.reservation_id
        WHERE j.id=$1`,
      [jobId],
    )
  ).rows[0];
}

function expectOneCallPerAttempt(calls: readonly unknown[], attempts: readonly unknown[]): void {
  expect(calls).toHaveLength(attempts.length);
}

for (const workflow of WORKFLOWS) {
  suite.test(`M4 actual worker success: ${workflow.kind}`, async ({ client, databaseUrl }) => {
    await seedSharedRows(client);
    const seeded = await seedWorkerCase(client, workflow.kind, `success-${workflow.suffix}`);
    const mock = instrumentedProvider();

    await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
      kind: 'terminalized',
    });

    const attempts = await attemptRows(client, seeded.job.id);
    const expectedStages = seeded.plan.spec.stages
      .filter((stage) => stage.runPolicy === 'always')
      .map((stage) => stage.stageKey);
    expect(attempts.map((row) => row.stage_key)).toEqual(expectedStages);
    expect(attempts.every((row) => row.status === 'succeeded')).toBe(true);
    expect(attempts.every((row) => row.input_tokens === 10 && row.output_tokens === 20)).toBe(true);
    expect(attempts.every((row) => row.provider_request_id !== null)).toBe(true);
    expectOneCallPerAttempt(mock.calls, attempts);
    expect(mock.calls.map((call) => call.stageKey)).toEqual(expectedStages);

    expect(await terminalSnapshot(client, seeded.job.id)).toEqual({
      status: 'succeeded',
      reservation_status: 'released',
      settled: '0',
      released: RESERVED.toString(),
      exposure: '0',
      allocations: 0,
    });
    expect(
      (
        await client.query(
          `SELECT count(*)::int AS count FROM outbox_events
            WHERE aggregate_id=$1 AND event_type='m4_workflow_published'`,
          [seeded.job.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
}

for (const workflow of WORKFLOWS) {
  suite.test(
    `M4 actual worker malformed parse then separate repair: ${workflow.kind}`,
    async ({ client, databaseUrl }) => {
      await seedSharedRows(client);
      const seeded = await seedWorkerCase(client, workflow.kind, `repair-${workflow.suffix}`);
      const firstStage = seeded.plan.spec.stages.find((stage) => stage.runPolicy === 'always')!;
      const repairStage = seeded.plan.spec.stages.find(
        (stage) => stage.runPolicy === 'on_parse_failure',
      )!;
      const mock = instrumentedProvider(({ call }) => (call === 1 ? 'malformed' : undefined));

      await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
        kind: 'terminalized',
      });

      const attempts = await attemptRows(client, seeded.job.id);
      expect(attempts[0]).toMatchObject({
        stage_key: firstStage.stageKey,
        status: 'failed',
        payload: { parseFailed: true, errorCode: 'malformed_json' },
      });
      expect(attempts[1]).toMatchObject({ stage_key: repairStage.stageKey, status: 'succeeded' });
      expect(mock.calls.slice(0, 2).map((call) => call.scenario)).toEqual([
        'malformed',
        firstStage.stageKey,
      ]);
      expectOneCallPerAttempt(mock.calls, attempts);
      expect((await terminalSnapshot(client, seeded.job.id)).status).toBe('succeeded');
    },
  );
}

for (const workflow of WORKFLOWS) {
  suite.test(
    `M4 actual worker repair exhausted and zero usable output: ${workflow.kind}`,
    async ({ client, databaseUrl }) => {
      await seedSharedRows(client);
      const seeded = await seedWorkerCase(client, workflow.kind, `exhaust-${workflow.suffix}`);
      const firstStage = seeded.plan.spec.stages.find((stage) => stage.runPolicy === 'always')!;
      const repairStage = seeded.plan.spec.stages.find(
        (stage) => stage.runPolicy === 'on_parse_failure',
      )!;
      const mock = instrumentedProvider(({ call }) => (call <= 2 ? 'malformed' : undefined));

      await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
        kind: 'terminalized',
      });

      const attempts = await attemptRows(client, seeded.job.id);
      expect(attempts.map((row) => [row.stage_key, row.status])).toEqual([
        [firstStage.stageKey, 'failed'],
        [repairStage.stageKey, 'failed'],
      ]);
      expectOneCallPerAttempt(mock.calls, attempts);
      expect(mock.calls.filter((call) => call.scenario === 'malformed')).toHaveLength(2);
      expect(await terminalSnapshot(client, seeded.job.id)).toEqual({
        status: 'failed',
        reservation_status: 'released',
        settled: '0',
        released: RESERVED.toString(),
        exposure: '0',
        allocations: 0,
      });
    },
  );
}

for (const workflow of WORKFLOWS) {
  suite.test(
    `M4 actual worker timeout, orphan recovery, and maxInvocations: ${workflow.kind}`,
    async ({ client, databaseUrl }) => {
      await seedSharedRows(client);
      const seeded = await seedWorkerCase(client, workflow.kind, `timeout-${workflow.suffix}`, {
        maxInvocations: 2,
      });
      const firstStage = seeded.plan.spec.stages.find((stage) => stage.runPolicy === 'always')!;
      const timeout = instrumentedProvider(({ stageKey: key }) =>
        key === firstStage.stageKey ? 'timeout' : undefined,
      );

      await expect(process(databaseUrl, seeded.job, timeout.provider)).resolves.toEqual({
        kind: 'requeue',
        delayMs: 0,
      });
      let attempts = await attemptRows(client, seeded.job.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({ stage_key: firstStage.stageKey, status: 'started' });
      expectOneCallPerAttempt(timeout.calls, attempts);

      const nextLease = `${seeded.job.leaseToken}-reclaimed`;
      await client.query(
        `UPDATE generation_jobs SET fence_version=2,lease_token=$2,
                lease_expires_at=now()+interval '1 hour' WHERE id=$1`,
        [seeded.job.id, nextLease],
      );
      const recovered = instrumentedProvider();
      await expect(
        process(
          databaseUrl,
          { ...seeded.job, fenceVersion: 2, leaseToken: nextLease },
          recovered.provider,
        ),
      ).resolves.toEqual({ kind: 'terminalized' });

      attempts = await attemptRows(client, seeded.job.id);
      const firstStageAttempts = attempts.filter((row) => row.stage_key === firstStage.stageKey);
      expect(firstStageAttempts).toHaveLength(2);
      expect(firstStageAttempts[0]).toMatchObject({
        status: 'failed',
        payload: { recovery: 'worker_loss', usageUncertain: true },
      });
      expect(firstStageAttempts[1]).toMatchObject({ status: 'succeeded', ordinal: 1 });
      expect(timeout.calls.length + recovered.calls.length).toBe(attempts.length);
      expect(firstStageAttempts.length).toBeLessThanOrEqual(
        firstStage.routing.reduce((sum, route) => sum + route.maxInvocations, 0),
      );
    },
  );
}

for (const workflow of WORKFLOWS) {
  suite.test(
    `M4 actual worker refusal is nonretryable and capped: ${workflow.kind}`,
    async ({ client, databaseUrl }) => {
      await seedSharedRows(client);
      const seeded = await seedWorkerCase(client, workflow.kind, `refusal-${workflow.suffix}`, {
        maxInvocations: 2,
      });
      const firstStage = seeded.plan.spec.stages.find((stage) => stage.runPolicy === 'always')!;
      const mock = instrumentedProvider(({ stageKey: key }) =>
        key === firstStage.stageKey ? 'refusal' : undefined,
      );

      await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
        kind: 'terminalized',
      });

      const attempts = await attemptRows(client, seeded.job.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        stage_key: firstStage.stageKey,
        status: 'failed',
        payload: { errorCode: 'provider_refusal' },
        provider_request_id: null,
      });
      expect(mock.calls).toHaveLength(1);
      expect(attempts.length).toBeLessThanOrEqual(
        firstStage.routing.reduce((sum, route) => sum + route.maxInvocations, 0),
      );
      expectOneCallPerAttempt(mock.calls, attempts);
      expect((await terminalSnapshot(client, seeded.job.id)).status).toBe('failed');
    },
  );
}

suite.test('M4 actual worker judge pass skips repair', async ({ client, databaseUrl }) => {
  await seedSharedRows(client);
  const seeded = await seedWorkerCase(client, 'beat_write_judge', 'judge-pass');
  const mock = instrumentedProvider();
  await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
    kind: 'terminalized',
  });
  expect(mock.calls.map((call) => call.stageKey)).toEqual(['writer', 'judge']);
  expect(mock.calls.some((call) => call.stageKey === 'judge_repair')).toBe(false);
});

suite.test(
  'M4 actual worker judge reject runs one judge repair',
  async ({ client, databaseUrl }) => {
    await seedSharedRows(client);
    const seeded = await seedWorkerCase(client, 'beat_write_judge', 'judge-reject');
    const mock = instrumentedProvider(({ stageKey: key }) =>
      key === 'judge' ? 'judge-reject' : undefined,
    );
    await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
      kind: 'terminalized',
    });
    const attempts = await attemptRows(client, seeded.job.id);
    expect(attempts.map((row) => [row.stage_key, row.status])).toEqual([
      ['writer', 'succeeded'],
      ['judge', 'failed'],
      ['judge_repair', 'succeeded'],
    ]);
    expect(mock.perStage.get('judge_repair')).toBe(1);
    expectOneCallPerAttempt(mock.calls, attempts);
  },
);

suite.test('M4 actual worker cancel before provider call', async ({ client, databaseUrl }) => {
  await seedSharedRows(client);
  const seeded = await seedWorkerCase(client, 'concept_generation', 'cancel-before');
  await client.query(`UPDATE generation_jobs SET cancel_requested_at=now() WHERE id=$1`, [
    seeded.job.id,
  ]);
  const mock = instrumentedProvider();
  await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
    kind: 'ownership_lost',
  });
  expect(mock.calls).toHaveLength(0);
  expect(await attemptRows(client, seeded.job.id)).toHaveLength(0);
});

suite.test('M4 actual worker cancel in-flight blocks publish', async ({ client, databaseUrl }) => {
  await seedSharedRows(client);
  const seeded = await seedWorkerCase(client, 'concept_generation', 'cancel-in-flight');
  const mock = instrumentedProvider(async () => {
    await client.query(`UPDATE generation_jobs SET cancel_requested_at=now() WHERE id=$1`, [
      seeded.job.id,
    ]);
    return undefined;
  });
  await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
    kind: 'ownership_lost',
  });
  expect(mock.calls).toHaveLength(1);
  expect(await attemptRows(client, seeded.job.id)).toHaveLength(1);
  expect((await terminalSnapshot(client, seeded.job.id)).status).toBe('running');
});

suite.test('M4 actual worker cancel between stages', async ({ client, databaseUrl }) => {
  await seedSharedRows(client);
  const seeded = await seedWorkerCase(client, 'beat_write_judge', 'cancel-between');
  const mock = instrumentedProvider(async ({ stageKey: key }) => {
    if (key === 'writer') {
      await client.query(`UPDATE generation_jobs SET cancel_requested_at=now() WHERE id=$1`, [
        seeded.job.id,
      ]);
    }
    return undefined;
  });
  await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
    kind: 'ownership_lost',
  });
  expect(mock.calls.map((call) => call.stageKey)).toEqual(['writer']);
  expect((await attemptRows(client, seeded.job.id)).map((row) => row.stage_key)).toEqual([
    'writer',
  ]);
});

suite.test('M4 actual worker cancel before parse repair', async ({ client, databaseUrl }) => {
  await seedSharedRows(client);
  const seeded = await seedWorkerCase(client, 'outline_generation', 'cancel-repair');
  const mock = instrumentedProvider(async ({ stageKey: key }) => {
    if (key === 'outline') {
      await client.query(`UPDATE generation_jobs SET cancel_requested_at=now() WHERE id=$1`, [
        seeded.job.id,
      ]);
      return 'malformed';
    }
    return undefined;
  });
  await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
    kind: 'ownership_lost',
  });
  expect(mock.calls.map((call) => call.stageKey)).toEqual(['outline']);
  expect((await attemptRows(client, seeded.job.id))[0]).toMatchObject({ status: 'failed' });
});

suite.test(
  'M4 actual worker stale fence cannot finalize or publish',
  async ({ client, databaseUrl }) => {
    await seedSharedRows(client);
    const seeded = await seedWorkerCase(client, 'concept_generation', 'stale-fence');
    const mock = instrumentedProvider(async () => {
      await client.query(`UPDATE generation_jobs SET fence_version=fence_version+1 WHERE id=$1`, [
        seeded.job.id,
      ]);
      return undefined;
    });
    await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
      kind: 'ownership_lost',
    });
    expect(mock.calls).toHaveLength(1);
    expect((await attemptRows(client, seeded.job.id))[0]).toMatchObject({ status: 'succeeded' });
    expect(
      (
        await client.query(
          `SELECT count(*)::int AS count FROM concept_sets WHERE source_job_id=$1`,
          [seeded.job.id],
        )
      ).rows[0].count,
    ).toBe(0);
  },
);

suite.test(
  'M4 actual worker terminal job fails before provider',
  async ({ client, databaseUrl }) => {
    await seedSharedRows(client);
    const seeded = await seedWorkerCase(client, 'concept_generation', 'already-terminal');
    await client.query(
      `UPDATE generation_jobs
        SET status='failed',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
      WHERE id=$1`,
      [seeded.job.id],
    );
    const mock = instrumentedProvider();

    await expect(process(databaseUrl, seeded.job, mock.provider)).resolves.toEqual({
      kind: 'ownership_lost',
    });
    expect(mock.calls).toHaveLength(0);
    expect(await attemptRows(client, seeded.job.id)).toHaveLength(0);
  },
);

suite.test(
  'M4 actual worker rejects tampered frozen packet binding before provider',
  async ({ client, databaseUrl }) => {
    await seedSharedRows(client);
    const seeded = await seedWorkerCase(client, 'concept_generation', 'packet-binding');
    await client.query(
      `UPDATE context_snapshots
          SET payload=jsonb_set(payload,'{metadata,dependencyHash}',$2::jsonb)
        WHERE id=$1`,
      [`${seeded.job.bundleId}:planner`, JSON.stringify('tampered')],
    );
    const mock = instrumentedProvider();

    await expect(process(databaseUrl, seeded.job, mock.provider)).rejects.toThrow(
      "frozen packet binding invalid for 'planner'",
    );
    expect(mock.calls).toHaveLength(0);
    expect(await attemptRows(client, seeded.job.id)).toHaveLength(0);
  },
);

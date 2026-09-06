import {
  createAttemptOrchestrator,
  createAttemptRecoveryService,
  createJobService,
  createWorkflowInvocationService,
  MOCK_PRICE_SNAPSHOT_ID,
  seedMockPriceSnapshots,
  type ExecutorOutcome,
  type OrchestratorStageRequest,
} from '@narraza/application';
import {
  classifyProviderError,
  createMockProvider,
  isRestrictedDataClass,
  parseOutput,
  type MockFixture,
} from '@narraza/ai';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

/**
 * M4 Block C attempt orchestration — real PostgreSQL.
 *
 * Runs the frozen plan against a claimed job through the M3 three-phase
 * contracts with the deterministic mock provider wired in as the injected
 * executor: one provider call per attempt, parse-repair as a separate stage,
 * orphan-started recovery per PM Decision 2, stale fences that cannot publish,
 * and cancellation honoured after the in-flight provider call.
 */

const schema = createSchemaTestSuite();

const WRITER_SCHEMA = z.object({ scene: z.string() }).strict();
const JUDGE_SCHEMA = z.object({ verdict: z.enum(['pass', 'fail']) }).strict();

const BASE_FIXTURES: MockFixture[] = [
  {
    scenario: 'scene',
    body: JSON.stringify({ scene: 'Laut berderak.' }),
    inputTokens: 10,
    outputTokens: 20,
  },
  {
    scenario: 'verdict',
    body: JSON.stringify({ verdict: 'pass' }),
    inputTokens: 8,
    outputTokens: 4,
  },
  {
    scenario: 'verdict_fail',
    body: JSON.stringify({ verdict: 'fail' }),
    inputTokens: 8,
    outputTokens: 4,
  },
  {
    scenario: 'repaired',
    body: JSON.stringify({ scene: 'Laut tenang.' }),
    inputTokens: 12,
    outputTokens: 18,
  },
];

function planSpec(stages: unknown) {
  return { schemaVersion: 1 as const, workflowKind: 'beat_write_judge', stages } as const;
}

const WRITER_STAGE = {
  stageKey: 'writer',
  purpose: 'generate' as const,
  packetKind: 'writer' as const,
  dataClass: 'writer_safe',
  runPolicy: 'always' as const,
  routing: [
    {
      providerId: 'mock',
      requestedModelId: 'mock/narra-writer-v1',
      resolvedModelId: 'mock/narra-writer-v1',
      structuredOutput: true,
      timeoutMs: 5_000,
      maxInputTokens: 100,
      maxOutputTokens: 100,
      priceSnapshotId: 'price-writer',
      maxInvocations: 2,
    },
  ],
};

const JUDGE_STAGE = {
  stageKey: 'judge',
  purpose: 'judge' as const,
  packetKind: 'validator' as const,
  dataClass: 'author_private',
  runPolicy: 'always' as const,
  routing: [
    {
      providerId: 'mock',
      requestedModelId: 'mock/narra-judge-v1',
      resolvedModelId: 'mock/narra-judge-v1',
      structuredOutput: true,
      timeoutMs: 5_000,
      maxInputTokens: 100,
      maxOutputTokens: 100,
      priceSnapshotId: 'price-judge',
      maxInvocations: 1,
    },
  ],
};

function parseRepairStage(maxInvocations = 1) {
  return {
    stageKey: 'parse_repair',
    purpose: 'parse_repair' as const,
    packetKind: 'writer' as const,
    dataClass: 'writer_safe',
    runPolicy: 'on_parse_failure' as const,
    routing: [
      {
        providerId: 'mock',
        requestedModelId: 'mock/narra-writer-v1',
        resolvedModelId: 'mock/narra-writer-v1',
        structuredOutput: true,
        timeoutMs: 5_000,
        maxInputTokens: 100,
        maxOutputTokens: 100,
        priceSnapshotId: 'price-writer',
        maxInvocations,
      },
    ],
  };
}

interface Harness {
  runPlan: ReturnType<typeof createAttemptOrchestrator>['runPlan'];
  calls: () => number;
}

function wire(
  databaseUrl: string,
  options: {
    fixtures?: MockFixture[];
    scenarios?: Record<string, string>;
    fenceBumpOnStage?: string;
    cancelOnStage?: string;
  } = {},
): Harness {
  const prisma = createPrismaForUrl(databaseUrl);
  const unitOfWork = createUnitOfWork(prisma);
  const workflow = createWorkflowInvocationService(unitOfWork);
  const jobs = createJobService(unitOfWork);
  const attemptRecovery = createAttemptRecoveryService({ unitOfWork });
  const provider = createMockProvider(options.fixtures ?? BASE_FIXTURES);

  let calls = 0;
  const executor = async (request: OrchestratorStageRequest): Promise<ExecutorOutcome> => {
    calls += 1;
    // Model policy gate inside the adapter, at the last point before a call.
    expect(() => {
      if (
        isRestrictedDataClass(request.dataClass as 'author_private') &&
        request.providerId !== 'mock'
      ) {
        throw new Error('policy');
      }
    }).not.toThrow();
    const scenario =
      options.scenarios?.[`${request.stage.stageKey}`] ??
      (request.stage.purpose === 'judge' ? 'verdict' : 'scene');
    if (options.cancelOnStage === request.stage.stageKey) {
      await prisma.$executeRawUnsafe(
        `UPDATE generation_jobs SET cancel_requested_at = now() WHERE id = $1`,
        globalThis.__orchJobId,
      );
    }
    if (options.fenceBumpOnStage === request.stage.stageKey) {
      await prisma.$executeRawUnsafe(
        `UPDATE generation_jobs SET fence_version = fence_version + 1 WHERE id = $1`,
        globalThis.__orchJobId,
      );
    }
    try {
      const response = await provider.executeSingleAttempt({
        providerId: request.providerId,
        requestedModelId: request.requestedModelId,
        structuredOutput: request.structuredOutput,
        timeoutMs: request.timeoutMs,
        maxInputTokens: request.maxInputTokens,
        maxOutputTokens: request.maxOutputTokens,
        dataClass: request.dataClass as 'writer_safe',
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt,
        mockScenario: scenario,
      });
      const contract = request.stage.purpose === 'judge' ? JUDGE_SCHEMA : WRITER_SCHEMA;
      const parsed = parseOutput(contract, response.rawBody);
      const resultHash = createHash('sha256').update(response.rawBody).digest('hex');
      const priceSnapshotId =
        request.stage.purpose === 'judge'
          ? `${MOCK_PRICE_SNAPSHOT_ID}-judge`
          : `${MOCK_PRICE_SNAPSHOT_ID}-writer`;
      const usage = {
        priceSnapshotId,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        providerCostMicroIdr:
          BigInt(response.usage.inputTokens) * 20n + BigInt(response.usage.outputTokens) * 60n,
      };
      if (parsed.kind === 'parse_failed') {
        return {
          kind: 'billable',
          status: 'failed',
          providerRequestId: response.providerRequestId,
          resultHash,
          schemaVersion: 1,
          payload: { parseFailed: true, errorCode: parsed.errorCode },
          usage,
        };
      }
      return {
        kind: 'billable',
        status: 'succeeded',
        providerRequestId: response.providerRequestId,
        resultHash,
        schemaVersion: 1,
        payload: { value: parsed.value },
        usage,
      };
    } catch (error) {
      const normalized = classifyProviderError(error);
      return { kind: 'recoverable_no_response', reason: 'threw', errorCode: normalized.errorCode };
    }
  };

  const orchestrator = createAttemptOrchestrator({
    workflow,
    jobs,
    attemptRecovery,
    executeStage: executor,
    validateStage: async (stage, outcome) => {
      if (stage.purpose === 'judge') {
        const verdict = (outcome.payload as { value?: { verdict?: string } }).value?.verdict;
        if (verdict === 'fail') {
          return { kind: 'invalid', errorCode: 'judge_verdict_failed' };
        }
      }
      return { kind: 'valid' };
    },
  });
  orchestrator.withIdAllocator(() => crypto.randomUUID());
  return { runPlan: orchestrator.runPlan, calls: () => calls };
}

async function seedRunningJob(
  client: Parameters<typeof seedUsersAndProjects>[0],
  databaseUrl: string,
  jobId: string,
) {
  await seedUsersAndProjects(client);
  await seedMockPriceSnapshots(createUnitOfWork(createPrismaForUrl(databaseUrl)));
  await client.query(
    `INSERT INTO generation_jobs
       (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at,
        fence_version, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, 'prose', 'running', 0, now(), $3, now() + interval '60 seconds', 1, 1, '{}', now(), now())`,
    [jobId, ids.projectA, `lease-${jobId}`],
  );
}

const identityFor = (jobId: string, fence = 1) => ({
  projectId: ids.projectA,
  jobId,
  leaseToken: `lease-${jobId}`,
  fenceVersion: fence,
});

schema.test(
  'attempt-orchestration writer-judge success, one call per attempt',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-1');
    globalThis.__orchJobId = 'orch-job-1';
    const prisma = createPrismaForUrl(databaseUrl);
    const { runPlan, calls } = wire(databaseUrl);

    try {
      const result = await runPlan({
        identity: identityFor('orch-job-1'),
        plan: planSpec([WRITER_STAGE, JUDGE_STAGE]),
        buildStageRequest: () => ({
          systemPrompt: 'You write scenes.',
          userPrompt: 'Scene 3.',
        }),
        publish: async (context) => {
          await context.appendSentinel({
            aggregateType: 'generation_job',
            aggregateId: 'orch-job-1',
            eventType: 'workflow_candidate_published',
            dedupeKey: 'orch-candidate:orch-job-1',
            payload: {},
          });
        },
      });
      expect(result).toMatchObject({ kind: 'published' });

      // Exactly one provider call per attempt: two stages, two calls.
      expect(calls()).toBe(2);
      const attempts = (
        await client.query(
          `SELECT i.stage_key, a.status, count(*)::int AS count
           FROM generation_attempts a JOIN workflow_invocations i ON i.id = a.invocation_id
          WHERE a.job_id = 'orch-job-1'
          GROUP BY i.stage_key, a.status ORDER BY i.stage_key`,
        )
      ).rows;
      expect(attempts).toEqual([
        { stage_key: 'judge', status: 'succeeded', count: 1 },
        { stage_key: 'writer', status: 'succeeded', count: 1 },
      ]);

      // The fenced publish terminalized the job.
      const job = (await client.query(`SELECT status FROM generation_jobs WHERE id = 'orch-job-1'`))
        .rows[0];
      expect(job.status).toBe('succeeded');
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'attempt-orchestration malformed output takes explicit parse-repair attempt',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-2');
    globalThis.__orchJobId = 'orch-job-2';
    const prisma = createPrismaForUrl(databaseUrl);
    const { runPlan, calls } = wire(databaseUrl, {
      scenarios: { parse_repair: 'repaired' },
      fixtures: [
        {
          scenario: 'verdict',
          body: JSON.stringify({ verdict: 'pass' }),
          inputTokens: 8,
          outputTokens: 4,
        },
        // First writer attempt produces unparseable output.
        { scenario: 'scene', body: 'not-json{{', inputTokens: 10, outputTokens: 5 },
        // The parse-repair attempt returns a parseable scene.
        {
          scenario: 'repaired',
          body: JSON.stringify({ scene: 'Laut tenang.' }),
          inputTokens: 12,
          outputTokens: 18,
        },
      ],
    });

    try {
      const result = await runPlan({
        identity: identityFor('orch-job-2'),
        plan: planSpec([WRITER_STAGE, parseRepairStage(), JUDGE_STAGE]),
        buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
        publish: async () => undefined,
      });
      expect(result).toMatchObject({ kind: 'published' });

      // writer attempt 1 failed parse; parse_repair is a SEPARATE stage/attempt.
      const rows = (
        await client.query(
          `SELECT i.stage_key, a.status, a.ordinal, p.error_code
           FROM generation_attempts a
           JOIN workflow_invocations i ON i.id = a.invocation_id
           LEFT JOIN LATERAL (SELECT a.payload->>'errorCode' AS error_code) p ON true
          WHERE a.job_id = 'orch-job-2'
          ORDER BY i.stage_key, a.ordinal`,
        )
      ).rows;
      expect(rows.filter((row) => row.stage_key === 'writer')).toHaveLength(1);
      expect(rows.find((row) => row.stage_key === 'writer')).toMatchObject({
        status: 'failed',
        error_code: 'malformed_json',
      });
      const repair = rows.find((row) => row.stage_key === 'parse_repair');
      expect(repair).toMatchObject({ status: 'succeeded', ordinal: 0 });
      // Three stages executed, three provider calls total.
      expect(calls()).toBe(3);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'restart after malformed writer runs one repair and never repairs again after publish',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-parse-restart');
    globalThis.__orchJobId = 'orch-job-parse-restart';
    const firstPrisma = createPrismaForUrl(databaseUrl);
    const firstWorkflow = createWorkflowInvocationService(createUnitOfWork(firstPrisma));
    const firstIdentity = identityFor('orch-job-parse-restart');
    const begun = await firstWorkflow.beginAttempt({
      ...firstIdentity,
      invocationId: 'wf-inv:orch-job-parse-restart:writer',
      attemptId: 'wf-att:orch-job-parse-restart:writer:malformed',
      stageKey: 'writer',
      schemaVersion: 1,
      payload: { providerId: 'mock', profileIndex: 0 },
    });
    expect(begun.kind).toBe('started');
    const finalized = await firstWorkflow.finalizeAttempt({
      ...firstIdentity,
      invocationId: 'wf-inv:orch-job-parse-restart:writer',
      attemptId: 'wf-att:orch-job-parse-restart:writer:malformed',
      status: 'failed',
      providerRequestId: 'mock-malformed',
      resultHash: createHash('sha256').update('not-json{{').digest('hex'),
      schemaVersion: 1,
      payload: { parseFailed: true, errorCode: 'malformed_json' },
      usage: {
        priceSnapshotId: `${MOCK_PRICE_SNAPSHOT_ID}-writer`,
        inputTokens: 10,
        outputTokens: 5,
        providerCostMicroIdr: 500n,
      },
    });
    expect(finalized).toMatchObject({ kind: 'finalized', winner: 'attempt_failed' });
    await firstPrisma.$disconnect();

    await client.query(
      `UPDATE generation_jobs
          SET fence_version = 2, lease_token = 'lease-orch-job-parse-restart-b'
        WHERE id = 'orch-job-parse-restart'`,
    );
    const restarted = wire(databaseUrl, { scenarios: { parse_repair: 'repaired' } });
    let publishedOutputs: Readonly<Record<string, unknown>> | undefined;
    const repaired = await restarted.runPlan({
      identity: {
        ...identityFor('orch-job-parse-restart'),
        leaseToken: 'lease-orch-job-parse-restart-b',
        fenceVersion: 2,
      },
      plan: planSpec([WRITER_STAGE, parseRepairStage()]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async ({ stageOutputs }) => {
        publishedOutputs = stageOutputs;
      },
    });
    expect(repaired).toMatchObject({ kind: 'published' });
    expect(restarted.calls()).toBe(1);
    expect(publishedOutputs).toEqual({ parse_repair: { scene: 'Laut tenang.' } });

    const afterPublish = wire(databaseUrl, { scenarios: { parse_repair: 'repaired' } });
    const rerun = await afterPublish.runPlan({
      identity: {
        ...identityFor('orch-job-parse-restart'),
        leaseToken: 'lease-orch-job-parse-restart-b',
        fenceVersion: 2,
      },
      plan: planSpec([WRITER_STAGE, parseRepairStage()]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(rerun).toMatchObject({ kind: 'publish_denied' });
    expect(afterPublish.calls()).toBe(0);

    const rows = (
      await client.query(
        `SELECT i.stage_key, i.winner_attempt_id, a.id, a.status
           FROM workflow_invocations i
           JOIN generation_attempts a ON a.invocation_id = i.id
          WHERE i.job_id = 'orch-job-parse-restart'
          ORDER BY i.stage_key, a.ordinal`,
      )
    ).rows;
    expect(rows.find((row) => row.stage_key === 'writer')).toMatchObject({
      status: 'failed',
      winner_attempt_id: null,
    });
    expect(rows.filter((row) => row.stage_key === 'parse_repair')).toHaveLength(1);
    expect(
      rows.filter((row) => row.stage_key === 'parse_repair' && row.status === 'succeeded'),
    ).toHaveLength(1);
  },
);

schema.test(
  'reclaimed worker resumes after durable writer winner and publishes original output',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-reclaim-winner');
    globalThis.__orchJobId = 'orch-job-reclaim-winner';
    const reclaimJudgeStage = {
      ...JUDGE_STAGE,
      routing: [{ ...JUDGE_STAGE.routing[0], maxInvocations: 2 }],
    };
    const first = wire(databaseUrl, { scenarios: { judge: 'timeout' } });
    const firstResult = await first.runPlan({
      identity: identityFor('orch-job-reclaim-winner'),
      plan: planSpec([WRITER_STAGE, reclaimJudgeStage]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(firstResult).toMatchObject({ kind: 'recoverable', stageKey: 'judge' });
    expect(first.calls()).toBe(2);

    await client.query(
      `UPDATE generation_jobs
          SET fence_version = 2, lease_token = 'lease-orch-job-reclaim-winner-b'
        WHERE id = 'orch-job-reclaim-winner'`,
    );
    const second = wire(databaseUrl);
    let publishedOutputs: Readonly<Record<string, unknown>> | undefined;
    const secondResult = await second.runPlan({
      identity: {
        ...identityFor('orch-job-reclaim-winner'),
        leaseToken: 'lease-orch-job-reclaim-winner-b',
        fenceVersion: 2,
      },
      plan: planSpec([WRITER_STAGE, reclaimJudgeStage]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async ({ stageOutputs }) => {
        publishedOutputs = stageOutputs;
      },
    });

    expect(secondResult).toMatchObject({ kind: 'published' });
    expect(second.calls()).toBe(1);
    expect(publishedOutputs).toMatchObject({ writer: { scene: 'Laut berderak.' } });
    const counts = (
      await client.query(
        `SELECT i.stage_key, count(*)::int AS count
           FROM generation_attempts a
           JOIN workflow_invocations i ON i.id = a.invocation_id
          WHERE a.job_id = 'orch-job-reclaim-winner'
          GROUP BY i.stage_key
          ORDER BY i.stage_key`,
      )
    ).rows;
    expect(counts).toEqual([
      { stage_key: 'judge', count: 2 },
      { stage_key: 'writer', count: 1 },
    ]);
  },
);

schema.test(
  'attempt-orchestration timeout is recoverable and orphan is closed on rerun',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-3');
    globalThis.__orchJobId = 'orch-job-3';
    // First run: writer times out (thrown typed error).
    const firstRun = wire(databaseUrl, { scenarios: { writer: 'timeout' } });
    const { runPlan, calls } = firstRun;
    const first = await runPlan({
      identity: identityFor('orch-job-3'),
      plan: planSpec([WRITER_STAGE, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(first).toMatchObject({ kind: 'recoverable', errorCode: 'provider_timeout' });
    expect(calls()).toBe(1);

    // The attempt stays `started` (usage uncertain, lease will expire).
    const started = (
      await client.query(
        `SELECT a.id, a.status, a.finished_at FROM generation_attempts a
        JOIN workflow_invocations i ON i.id = a.invocation_id
       WHERE a.job_id = 'orch-job-3'`,
      )
    ).rows;
    expect(started).toHaveLength(1);
    expect(started[0].status).toBe('started');
    expect(started[0].finished_at).toBeNull();
    const orphanId = started[0].id;

    // Second run under a RECLAIMED lease (fence bumped): the orphan is durably
    // closed as failed/abandoned with the usage-uncertain marker and a NEW
    // attempt succeeds.
    await client.query(
      `UPDATE generation_jobs SET fence_version = 2, lease_token = 'lease-orch-job-3-b' WHERE id = 'orch-job-3'`,
    );
    const second = wire(databaseUrl);
    const result = await second.runPlan({
      identity: { ...identityFor('orch-job-3'), leaseToken: 'lease-orch-job-3-b', fenceVersion: 2 },
      plan: planSpec([WRITER_STAGE, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(result).toMatchObject({ kind: 'published' });

    const attempts = (
      await client.query(
        `SELECT a.id, a.status, a.ordinal, a.payload, a.finished_at, i.winner_attempt_id
         FROM generation_attempts a JOIN workflow_invocations i ON i.id = a.invocation_id
        WHERE a.job_id = 'orch-job-3' AND i.stage_key = 'writer'
        ORDER BY a.ordinal`,
      )
    ).rows;
    expect(attempts).toHaveLength(2);
    expect(attempts[0].id).toBe(orphanId);
    expect(attempts[0]).toMatchObject({
      status: 'failed',
      payload: { recovery: 'worker_loss', usageUncertain: true },
    });
    expect(attempts[0].finished_at).not.toBeNull();
    // The orphan can never win; the new attempt is the winner.
    expect(attempts[1].id).not.toBe(orphanId);
    expect(attempts[1].status).toBe('succeeded');
    const invocation = (
      await client.query(
        `SELECT winner_attempt_id FROM workflow_invocations WHERE job_id = 'orch-job-3' AND stage_key = 'writer'`,
      )
    ).rows[0];
    expect(invocation.winner_attempt_id).toBe(attempts[1].id);

    // Zero user settlement from the abandoned attempt: no billing allocations.
    expect(
      (await client.query(`SELECT count(*)::int AS count FROM credit_billing_allocations`)).rows[0]
        .count,
    ).toBe(0);
  },
);

schema.test(
  'attempt-orchestration refusal consumes cap across runs then fails closed',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-4');
    globalThis.__orchJobId = 'orch-job-4';
    const writerCap1 = {
      ...WRITER_STAGE,
      routing: [{ ...WRITER_STAGE.routing[0]!, maxInvocations: 2 }],
    };

    // Run 1 and run 2: refusal → recoverable (attempt stays started).
    const first = wire(databaseUrl, { scenarios: { writer: 'refusal' } });
    const r1 = await first.runPlan({
      identity: identityFor('orch-job-4'),
      plan: planSpec([writerCap1, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(r1).toMatchObject({ kind: 'recoverable', errorCode: 'provider_refusal' });

    await client.query(
      `UPDATE generation_jobs SET fence_version = 2, lease_token = 'lease-orch-job-4-b' WHERE id = 'orch-job-4'`,
    );
    const second = wire(databaseUrl, { scenarios: { writer: 'refusal' } });
    const r2 = await second.runPlan({
      identity: { ...identityFor('orch-job-4'), leaseToken: 'lease-orch-job-4-b', fenceVersion: 2 },
      plan: planSpec([writerCap1, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(r2).toMatchObject({ kind: 'recoverable', errorCode: 'provider_refusal' });

    // Run 3: the invocation cap (2) is consumed by the two abandoned attempts —
    // no third provider call, the plan fails closed and the job terminalizes.
    await client.query(
      `UPDATE generation_jobs SET fence_version = 3, lease_token = 'lease-orch-job-4-c' WHERE id = 'orch-job-4'`,
    );
    const third = wire(databaseUrl, { scenarios: { writer: 'refusal' } });
    const r3 = await third.runPlan({
      identity: { ...identityFor('orch-job-4'), leaseToken: 'lease-orch-job-4-c', fenceVersion: 3 },
      plan: planSpec([writerCap1, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    expect(r3).toMatchObject({ kind: 'plan_failed', errorCode: 'invocations_exhausted' });
    expect(third.calls()).toBe(0);

    const attempts = (
      await client.query(
        `SELECT a.status, a.payload FROM generation_attempts a
        JOIN workflow_invocations i ON i.id = a.invocation_id
       WHERE a.job_id = 'orch-job-4' AND i.stage_key = 'writer'`,
      )
    ).rows;
    expect(attempts).toHaveLength(2);
    for (const row of attempts) {
      expect(row.status).toBe('failed');
      expect(row.payload).toMatchObject({ recovery: 'worker_loss', usageUncertain: true });
    }
    const job = (await client.query(`SELECT status FROM generation_jobs WHERE id = 'orch-job-4'`))
      .rows[0];
    expect(job.status).toBe('failed');
  },
);

schema.test(
  'owned terminal plan failure releases full system-funded reservation with zero ledger',
  async ({ client, databaseUrl }) => {
    await seedRunningJob(client, databaseUrl, 'orch-job-system-failed');
    await client.query(
      `INSERT INTO credit_reservations
         (id, user_id, project_id, job_project_id, job_id, status, funding_model,
          reserved_micro_idr, settled_micro_idr, released_micro_idr, exposure_micro_idr,
          created_at, updated_at)
       VALUES ('orch-reservation-system-failed', $1, $2, $2, 'orch-job-system-failed',
               'open', 'system_funded', 10000, 0, 0, 10000, now(), now())`,
      [ids.userA, ids.projectA],
    );
    await client.query(
      `UPDATE generation_jobs
          SET kind = 'chat_intake_reply', reservation_id = 'orch-reservation-system-failed'
        WHERE id = 'orch-job-system-failed'`,
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const orchestrator = createAttemptOrchestrator({
      workflow: createWorkflowInvocationService(unitOfWork),
      jobs: createJobService(unitOfWork),
      attemptRecovery: createAttemptRecoveryService({ unitOfWork }),
      executeStage: async () => ({
        kind: 'billable',
        status: 'succeeded',
        providerRequestId: 'missing-output',
        resultHash: createHash('sha256').update('missing-output').digest('hex'),
        schemaVersion: 1,
        payload: {},
        usage: {
          priceSnapshotId: `${MOCK_PRICE_SNAPSHOT_ID}-writer`,
          inputTokens: 0,
          outputTokens: 0,
          providerCostMicroIdr: 0n,
        },
      }),
    });
    try {
      const result = await orchestrator.runPlan({
        identity: identityFor('orch-job-system-failed'),
        plan: planSpec([WRITER_STAGE]),
        buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
        publish: async () => undefined,
      });
      expect(result).toMatchObject({
        kind: 'plan_failed',
        errorCode: 'successful_stage_output_missing',
      });
      const state = (
        await client.query(
          `SELECT j.status, r.status reservation_status,
                  r.reserved_micro_idr::text, r.released_micro_idr::text,
                  (SELECT count(*)::int FROM credit_ledger) ledger
             FROM generation_jobs j
             JOIN credit_reservations r ON r.id = j.reservation_id
            WHERE j.id = 'orch-job-system-failed'`,
        )
      ).rows[0];
      expect(state).toEqual({
        status: 'failed',
        reservation_status: 'released',
        reserved_micro_idr: '10000',
        released_micro_idr: '10000',
        ledger: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'attempt-orchestration stale fence cannot publish and cancel blocks success',
  async ({ client, databaseUrl }) => {
    // One shared seed: both scenarios run inside this container.
    await seedUsersAndProjects(client);
    await seedMockPriceSnapshots(createUnitOfWork(createPrismaForUrl(databaseUrl)));
    await client.query(
      `INSERT INTO generation_jobs
         (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at,
          fence_version, schema_version, payload, created_at, updated_at)
       VALUES ('orch-job-5', $1, 'prose', 'running', 0, now(), 'lease-orch-job-5',
               now() + interval '60 seconds', 1, 1, '{}', now(), now())`,
      [ids.projectA],
    );
    globalThis.__orchJobId = 'orch-job-5';
    const stale = wire(databaseUrl, { fenceBumpOnStage: 'judge' });
    const staleResult = await stale.runPlan({
      identity: identityFor('orch-job-5'),
      plan: planSpec([WRITER_STAGE, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    // The fence bump between Tx B and the publish gate means the final fenced
    // publish can no longer assert our lease: a stale claimant publishes nothing.
    expect(staleResult).toMatchObject({ kind: 'publish_denied', outcome: 'lost' });
    const staleJob = (
      await client.query(`SELECT status FROM generation_jobs WHERE id = 'orch-job-5'`)
    ).rows[0];
    expect(staleJob.status).toBe('running');

    // Cancellation during the provider call: the call completes, but the fenced
    // publish refuses to mark a cancelled job successful.
    await client.query(
      `INSERT INTO generation_jobs
         (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at,
          fence_version, schema_version, payload, created_at, updated_at)
       VALUES ('orch-job-6', $1, 'prose', 'running', 0, now(), 'lease-orch-job-6',
               now() + interval '60 seconds', 1, 1, '{}', now(), now())`,
      [ids.projectA],
    );
    globalThis.__orchJobId = 'orch-job-6';
    const cancelled = wire(databaseUrl, { cancelOnStage: 'writer' });
    const cancelResult = await cancelled.runPlan({
      identity: identityFor('orch-job-6'),
      plan: planSpec([WRITER_STAGE, JUDGE_STAGE]),
      buildStageRequest: () => ({ systemPrompt: 's', userPrompt: 'u' }),
      publish: async () => undefined,
    });
    // M3 refuses NEW attempts on a cancel-requested job: the writer attempt
    // that was already in flight completes and finalizes, then the judge
    // begin is denied and the orchestrator leaves the job to the cancel path.
    expect(cancelResult).toEqual({ kind: 'ownership_lost', phase: 'begin' });
    const cancelledJob = (
      await client.query(
        `SELECT status, cancel_requested_at FROM generation_jobs WHERE id = 'orch-job-6'`,
      )
    ).rows[0];
    expect(cancelledJob.cancel_requested_at).not.toBeNull();
    expect(['cancelled', 'running']).toContain(cancelledJob.status);
  },
);

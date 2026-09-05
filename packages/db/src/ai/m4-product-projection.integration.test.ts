import { createHash } from 'node:crypto';
import { createJobService, type JsonObject } from '@narraza/application';
import { expect } from 'vitest';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedPlanningGraph, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const DEPENDENCY_HASH = hash('dependency');
const PLAN_HASH = hash('plan');

const outputs: Readonly<Record<string, JsonObject>> = {
  intake_reply: {
    reply: 'Balasan Narra',
    signals: [{ key: 'premise', value: 'collected' }],
    sufficiency: { collected: 1, required: 4 },
  },
  concepts: {
    concepts: [1, 2, 3].map((ordinal) => ({
      title: `Konsep ${ordinal}`,
      synopsis: `Sinopsis ${ordinal}`,
      payload: { ordinal },
    })),
  },
  foundation: { proposal: { kind: 'foundation' } },
  characters: { proposal: { kind: 'characters' } },
  outline: { proposal: { chapters: Array.from({ length: 10 }, (_, index) => index + 1) } },
  writer: {
    candidates: [
      { text: 'Kandidat satu', payload: {} },
      { text: 'Kandidat dua', payload: {} },
    ],
  },
  judge: { verdict: 'pass', publicMessageCode: 'msg.judge.pass' },
  repair: { repaired: { text: 'Repaired candidate' } },
  publish_package: { artifactProposal: { formats: ['epub'] } },
};

interface SeededJob {
  jobId: string;
  payload: JsonObject;
  identity: { projectId: string; jobId: string; leaseToken: string; fenceVersion: number };
}

async function seedBoundJob(
  client: Parameters<typeof seedUsersAndProjects>[0],
  kind: string,
  suffix: string,
  payloadTail: JsonObject = {},
): Promise<SeededJob> {
  const jobId = `m4-job-${suffix}`;
  const bundleId = `m4-bundle-${suffix}`;
  const snapshotId = `m4-snapshot-${suffix}`;
  const planId = `m4-plan-${suffix}`;
  const reservationId = `m4-reservation-${suffix}`;
  const leaseToken = `m4-lease-${suffix}`;
  const workflowPlanHash = hash(`${PLAN_HASH}:${suffix}`);
  const payload = { workflowPlanHash, dependencyHash: DEPENDENCY_HASH, ...payloadTail };
  await client.query(
    `INSERT INTO context_snapshots
       (id, project_id, packet_kind, data_class, dependency_hash, content_hash,
        schema_version, payload, created_at)
     VALUES ($1, $2, 'writer', 'writer_safe', $3, $4, 1, '{}', now())`,
    [snapshotId, ids.projectA, DEPENDENCY_HASH, hash(`content:${suffix}`)],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id, project_id, snapshot_id, dependency_hash, bundle_hash, expires_at,
        schema_version, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '1 hour', 1, '{}', now())`,
    [bundleId, ids.projectA, snapshotId, DEPENDENCY_HASH, hash(`bundle:${suffix}`)],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id, project_id, bundle_id, workflow_kind, plan_hash, estimated_max_micro_idr,
        schema_version, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, 1, 1, '{}', now())`,
    [planId, ids.projectA, bundleId, kind, workflowPlanHash],
  );
  await client.query(
    `INSERT INTO generation_jobs
       (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at,
        fence_version, bundle_id, workflow_plan_id, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 'running', 0, now(), $4, now() + interval '1 hour',
             1, $5, $6, 1, $7::jsonb, now(), now())`,
    [jobId, ids.projectA, kind, leaseToken, bundleId, planId, JSON.stringify(payload)],
  );
  await client.query(
    `INSERT INTO credit_reservations
       (id, user_id, project_id, job_project_id, job_id, status, funding_model,
        reserved_micro_idr, settled_micro_idr, released_micro_idr, exposure_micro_idr,
        created_at, updated_at)
     VALUES ($1, $2, $3, $3, $4, 'open', 'user_paid', 1, 0, 0, 1, now(), now())`,
    [reservationId, ids.userA, ids.projectA, jobId],
  );
  await client.query(`UPDATE generation_jobs SET reservation_id = $2 WHERE id = $1`, [
    jobId,
    reservationId,
  ]);
  return {
    jobId,
    payload,
    identity: { projectId: ids.projectA, jobId, leaseToken, fenceVersion: 1 },
  };
}

async function project(
  databaseUrl: string,
  seeded: SeededJob,
  kind: string,
  stageOutputs: Readonly<Record<string, JsonObject>>,
) {
  const prisma = createPrismaForUrl(databaseUrl);
  const jobs = createJobService(createUnitOfWork(prisma));
  try {
    return await jobs.withFencedPublish(seeded.identity, async ({ publishM4ProductOutput }) => {
      if (!publishM4ProductOutput) throw new Error('projection port missing');
      await publishM4ProductOutput({
        projectId: ids.projectA,
        jobId: seeded.jobId,
        workflowKind: kind,
        dependencyHash: DEPENDENCY_HASH,
        jobPayload: seeded.payload,
        stageOutputs,
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function projectionSnapshot(
  client: Parameters<typeof seedUsersAndProjects>[0],
  seeded: SeededJob,
) {
  const intakeSessionId = seeded.payload.intakeSessionId;
  return {
    intakeMessages: (
      await client.query(
        `SELECT id, intake_session_id, content, job_id
           FROM intake_messages
          WHERE project_id=$1 AND job_id=$2
          ORDER BY id`,
        [ids.projectA, seeded.jobId],
      )
    ).rows,
    intakeSessions:
      typeof intakeSessionId === 'string'
        ? (
            await client.query(
              `SELECT id, signal_count, payload
                 FROM intake_sessions
                WHERE project_id=$1 AND id=$2
                ORDER BY id`,
              [ids.projectA, intakeSessionId],
            )
          ).rows
        : [],
    conceptSets: (
      await client.query(
        `SELECT id, dependency_hash, payload
           FROM concept_sets
          WHERE project_id=$1 AND source_job_id=$2
          ORDER BY id`,
        [ids.projectA, seeded.jobId],
      )
    ).rows,
    concepts: (
      await client.query(
        `SELECT c.id, c.payload
           FROM concepts c
           JOIN concept_sets cs
             ON cs.project_id=c.project_id AND cs.id=c.concept_set_id
          WHERE c.project_id=$1 AND cs.source_job_id=$2
          ORDER BY c.id`,
        [ids.projectA, seeded.jobId],
      )
    ).rows,
    proposalGroups: (
      await client.query(
        `SELECT id, kind, dependency_hash
           FROM proposal_groups
          WHERE project_id=$1 AND source_job_id=$2
          ORDER BY id`,
        [ids.projectA, seeded.jobId],
      )
    ).rows,
    generatedCandidates: (
      await client.query(
        `SELECT id, payload
           FROM generated_candidates
          WHERE project_id=$1 AND job_id=$2
          ORDER BY id`,
        [ids.projectA, seeded.jobId],
      )
    ).rows,
    artifactProposals: (
      await client.query(
        `SELECT id, dependency_hash, payload
           FROM artifact_proposals
          WHERE project_id=$1 AND source_job_id=$2
          ORDER BY id`,
        [ids.projectA, seeded.jobId],
      )
    ).rows,
  };
}

function projectionIds(snapshot: Awaited<ReturnType<typeof projectionSnapshot>>) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, rows]) => [
      key,
      (rows as Array<{ id: string }>).map(({ id }) => id),
    ]),
  );
}

function expectedProjectionIds(kind: string, jobId: string, intakeSessionId?: string) {
  const expected = {
    intakeMessages: [] as string[],
    intakeSessions: [] as string[],
    conceptSets: [] as string[],
    concepts: [] as string[],
    proposalGroups: [] as string[],
    generatedCandidates: [] as string[],
    artifactProposals: [] as string[],
  };
  switch (kind) {
    case 'chat_intake_reply':
      expected.intakeMessages = [`m4:${jobId}:intake-response`];
      expected.intakeSessions = [intakeSessionId!];
      break;
    case 'concept_generation':
      expected.conceptSets = [`m4:${jobId}:concept-set`];
      expected.concepts = [1, 2, 3].map((ordinal) => `m4:${jobId}:concept-${ordinal}`);
      break;
    case 'foundation_generation':
    case 'character_generation':
    case 'outline_generation':
    case 'safe_repair':
      expected.proposalGroups = [`m4:${jobId}:proposal-group`];
      expected.generatedCandidates = [`m4:${jobId}:candidate-1`];
      break;
    case 'beat_write_judge':
      expected.proposalGroups = [`m4:${jobId}:proposal-group`];
      expected.generatedCandidates = [1, 2].map((ordinal) => `m4:${jobId}:candidate-${ordinal}`);
      break;
    case 'publish_package':
      expected.artifactProposals = [`m4:${jobId}:artifact-proposal`];
      break;
  }
  return expected;
}

schema.test(
  'projects all eight M4 workflow outputs and replay stays idempotent',
  async ({ client, databaseUrl }) => {
    await seedPlanningGraph(client);
    await client.query(
      `INSERT INTO intake_sessions
       (id, project_id, status, signal_count, schema_version, payload, created_at, updated_at)
     VALUES ('intake-1', $1, 'active', 0, 1, '{}', now(), now())`,
      [ids.projectA],
    );
    await client.query(
      `INSERT INTO prose_versions
       (id, project_id, beat_id, status, revision, content, content_hash, created_at)
     VALUES ('prose-1', $1, $2, 'draft', 0, 'Text', $3, now())`,
      [ids.projectA, ids.beatA, hash('Text')],
    );

    const cases = [
      [
        'chat_intake_reply',
        'intake',
        { intakeSessionId: 'intake-1' },
        { intake_reply: outputs.intake_reply! },
      ],
      ['concept_generation', 'concept', {}, { concepts: outputs.concepts! }],
      ['foundation_generation', 'foundation', {}, { foundation: outputs.foundation! }],
      ['character_generation', 'character', {}, { characters: outputs.characters! }],
      ['outline_generation', 'outline', {}, { outline: outputs.outline! }],
      [
        'beat_write_judge',
        'beat',
        { beatId: ids.beatA },
        { writer: outputs.writer!, judge: outputs.judge! },
      ],
      ['safe_repair', 'repair', { beatId: ids.beatA }, { repair: outputs.repair! }],
      [
        'publish_package',
        'publish',
        { proseVersionId: 'prose-1' },
        { publish_package: outputs.publish_package! },
      ],
    ] as const;

    for (const [kind, suffix, payload, stageOutputs] of cases) {
      const seeded = await seedBoundJob(client, kind, suffix, payload);
      await expect(project(databaseUrl, seeded, kind, stageOutputs)).resolves.toMatchObject({
        kind: 'published',
      });

      const firstProjection = await projectionSnapshot(client, seeded);
      expect(projectionIds(firstProjection), `${kind} first projection identities`).toEqual(
        expectedProjectionIds(
          kind,
          seeded.jobId,
          typeof payload.intakeSessionId === 'string' ? payload.intakeSessionId : undefined,
        ),
      );

      const replayFenceVersion = 3;
      await client.query(
        `UPDATE generation_jobs
            SET status='running', lease_token=$2, lease_expires_at=now()+interval '1 hour',
                fence_version=$3, updated_at=now()
          WHERE id=$1`,
        [seeded.jobId, seeded.identity.leaseToken, replayFenceVersion],
      );
      const replaySeed = {
        ...seeded,
        identity: { ...seeded.identity, fenceVersion: replayFenceVersion },
      };
      await expect(project(databaseUrl, replaySeed, kind, stageOutputs)).resolves.toMatchObject({
        kind: 'published',
      });

      const replayProjection = await projectionSnapshot(client, seeded);
      expect(projectionIds(replayProjection), `${kind} replay identities and counts`).toEqual(
        projectionIds(firstProjection),
      );
      expect(replayProjection, `${kind} replay payloads`).toEqual(firstProjection);
    }

    expect(
      (
        await client.query(
          `SELECT content FROM intake_messages WHERE job_id = 'm4-job-intake' ORDER BY id`,
        )
      ).rows,
    ).toEqual([{ content: 'Balasan Narra' }]);
    expect(
      (await client.query(`SELECT signal_count FROM intake_sessions WHERE id = 'intake-1'`)).rows,
    ).toEqual([{ signal_count: 1 }]);
    expect((await client.query(`SELECT count(*)::int count FROM concepts`)).rows[0].count).toBe(3);
    expect(
      (
        await client.query(
          `SELECT kind, count(*)::int count FROM proposal_groups GROUP BY kind ORDER BY kind`,
        )
      ).rows,
    ).toEqual([
      { kind: 'beat_write_judge', count: 1 },
      { kind: 'character_generation', count: 1 },
      { kind: 'foundation_generation', count: 1 },
      { kind: 'outline_generation', count: 1 },
      { kind: 'safe_repair', count: 1 },
    ]);
    expect(
      (await client.query(`SELECT count(*)::int count FROM generated_candidates`)).rows[0].count,
    ).toBe(6);
    expect(
      (await client.query(`SELECT payload FROM artifact_proposals`)).rows[0].payload,
    ).toMatchObject({
      artifactProposal: { formats: ['epub'] },
    });
    expect((await client.query(`SELECT count(*)::int count FROM proposals`)).rows[0].count).toBe(0);
    expect(
      (await client.query(`SELECT count(*)::int count FROM publish_artifacts`)).rows[0].count,
    ).toBe(0);
  },
);

schema.test(
  'exact dependency and job payload bindings fail closed',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    const seeded = await seedBoundJob(client, 'concept_generation', 'binding');
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    try {
      await expect(
        jobs.withFencedPublish(seeded.identity, async ({ publishM4ProductOutput }) => {
          if (!publishM4ProductOutput) throw new Error('projection port missing');
          await publishM4ProductOutput({
            projectId: ids.projectA,
            jobId: seeded.jobId,
            workflowKind: 'concept_generation',
            dependencyHash: 'wrong-dependency',
            jobPayload: { ...seeded.payload, requestBinding: 'tampered' },
            stageOutputs: { concepts: outputs.concepts! },
          });
        }),
      ).rejects.toThrow(/binding (missing|mismatch)/);
    } finally {
      await prisma.$disconnect();
    }
    expect((await client.query(`SELECT count(*)::int count FROM concept_sets`)).rows[0].count).toBe(
      0,
    );
    expect(
      (await client.query(`SELECT status FROM generation_jobs WHERE id=$1`, [seeded.jobId])).rows[0]
        .status,
    ).toBe('running');
  },
);

schema.test(
  'stale fence and cancellation publish no product rows',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    const stale = await seedBoundJob(client, 'concept_generation', 'stale');
    await client.query(`UPDATE generation_jobs SET fence_version=2 WHERE id=$1`, [stale.jobId]);
    await expect(
      project(databaseUrl, stale, 'concept_generation', { concepts: outputs.concepts! }),
    ).resolves.toEqual({ kind: 'lost' });

    const cancelled = await seedBoundJob(client, 'concept_generation', 'cancelled');
    await client.query(`UPDATE generation_jobs SET cancel_requested_at=now() WHERE id=$1`, [
      cancelled.jobId,
    ]);
    await expect(
      project(databaseUrl, cancelled, 'concept_generation', { concepts: outputs.concepts! }),
    ).resolves.toEqual({ kind: 'lost' });

    expect((await client.query(`SELECT count(*)::int count FROM concept_sets`)).rows[0].count).toBe(
      0,
    );
    expect(
      (await client.query(`SELECT status FROM generation_jobs WHERE id=$1`, [cancelled.jobId]))
        .rows[0].status,
    ).toBe('running');
  },
);

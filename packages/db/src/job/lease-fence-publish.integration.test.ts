import { createJobService } from '@narraza/application';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createJobRepo } from '../repos/job-repo.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import {
  createPrismaForUrl,
  fetchJobRow,
  insertQueuedJobRow,
  jobIds,
  leaseTokens,
  withTx,
} from './job-test-fixtures.js';

const schema = createSchemaTestSuite();

const sentinel = {
  aggregateType: 'generation_job',
  aggregateId: jobIds.a,
  eventType: 'generation_job.published',
  dedupeKey: `job-published:${jobIds.a}`,
  schemaVersion: 1,
  payload: { evidence: 'lease-fence-publish' },
} as const;

async function outboxRows(client: Parameters<typeof seedUsersAndProjects>[0]) {
  return (
    await client.query(
      `SELECT aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload
         FROM outbox_events
        WHERE aggregate_id = $1
        ORDER BY created_at,id`,
      [jobIds.a],
    )
  ).rows;
}

schema.test('lease-fence-publish', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createJobService(createUnitOfWork(prisma));

  try {
    const claimA = await service.claim({
      projectId: ids.projectA,
      leaseToken: leaseTokens.alice,
      leaseDurationMs: 30_000,
    });
    expect(claimA.kind).toBe('claimed');
    if (claimA.kind !== 'claimed') throw new Error('worker A did not claim seeded job');
    const identityA = claimA.identity;

    await client.query(
      `UPDATE generation_jobs
          SET lease_expires_at = clock_timestamp() - INTERVAL '1 millisecond'
        WHERE project_id = $1 AND id = $2`,
      [ids.projectA, jobIds.a],
    );
    await expect(service.reclaimOne({ projectId: ids.projectA })).resolves.toMatchObject({
      kind: 'requeued',
      job: { id: jobIds.a, status: 'queued', fenceVersion: identityA.fenceVersion + 1 },
    });

    const claimB = await service.claim({
      projectId: ids.projectA,
      leaseToken: leaseTokens.bob,
      leaseDurationMs: 30_000,
    });
    expect(claimB.kind).toBe('claimed');
    if (claimB.kind !== 'claimed') throw new Error('worker B did not reclaim seeded job');
    const identityB = claimB.identity;
    expect(identityB.leaseToken).not.toBe(identityA.leaseToken);
    expect(identityB.fenceVersion).toBe(identityA.fenceVersion + 2);

    await expect(service.heartbeat({ ...identityA, leaseDurationMs: 30_000 })).resolves.toEqual({
      kind: 'lost_ownership',
    });
    await expect(service.requeue({ ...identityA, delayMs: 0 })).resolves.toEqual({
      kind: 'lost_ownership',
    });
    await expect(service.finish({ ...identityA, status: 'failed' })).resolves.toEqual({
      kind: 'lost_ownership',
    });
    await expect(service.finish({ ...identityA, status: 'cancelled' })).resolves.toEqual({
      kind: 'lost_ownership',
    });
    await expect(
      withTx(prisma, 'read_committed', (tx) => createJobRepo(tx).lockForFencedPublish(identityA)),
    ).resolves.toEqual({ kind: 'lost' });

    let staleCallbackCalls = 0;
    await expect(
      service.withFencedPublish(identityA, async ({ appendSentinel }) => {
        staleCallbackCalls += 1;
        await appendSentinel(sentinel);
      }),
    ).resolves.toEqual({ kind: 'lost' });
    expect(staleCallbackCalls).toBe(0);
    expect(await outboxRows(client)).toEqual([]);

    let liveCallbackCalls = 0;
    await expect(
      service.withFencedPublish(identityB, async ({ appendSentinel }) => {
        liveCallbackCalls += 1;
        await appendSentinel(sentinel);
      }),
    ).resolves.toMatchObject({
      kind: 'published',
      job: {
        id: jobIds.a,
        status: 'succeeded',
        leaseToken: null,
        leaseExpiresAt: null,
        fenceVersion: identityB.fenceVersion + 1,
      },
    });
    expect(liveCallbackCalls).toBe(1);
    expect(await outboxRows(client)).toEqual([
      {
        aggregate_type: sentinel.aggregateType,
        aggregate_id: sentinel.aggregateId,
        event_type: sentinel.eventType,
        dedupe_key: sentinel.dedupeKey,
        schema_version: sentinel.schemaVersion,
        payload: sentinel.payload,
      },
    ]);

    const committed = await fetchJobRow(client, jobIds.a);
    let replayCallbackCalls = 0;
    await expect(
      service.withFencedPublish(identityB, async ({ appendSentinel }) => {
        replayCallbackCalls += 1;
        await appendSentinel(sentinel);
      }),
    ).resolves.toEqual({ kind: 'lost' });
    expect(replayCallbackCalls).toBe(0);
    expect(await fetchJobRow(client, jobIds.a)).toEqual(committed);
    expect(await outboxRows(client)).toHaveLength(1);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  'lease-fence-publish callback failure rolls back sentinel and running job state',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));

    try {
      const claim = await service.claim({
        projectId: ids.projectA,
        leaseToken: leaseTokens.bob,
        leaseDurationMs: 30_000,
      });
      expect(claim.kind).toBe('claimed');
      if (claim.kind !== 'claimed') throw new Error('worker did not claim seeded job');
      const before = await fetchJobRow(client, jobIds.a);
      const failure = new Error('deterministic publish failure');

      await expect(
        service.withFencedPublish(claim.identity, async ({ appendSentinel }) => {
          await appendSentinel(sentinel);
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await outboxRows(client)).toEqual([]);
      expect(await fetchJobRow(client, jobIds.a)).toEqual(before);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'lease-fence-publish terminal failure after sentinel rolls back outbox and job',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await client.query(`
      CREATE FUNCTION fail_test_job_success() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = '${jobIds.a}' AND NEW.status = 'succeeded' THEN
          RAISE EXCEPTION 'deterministic terminal failure';
        END IF;
        RETURN NEW;
      END
      $$;
    `);

    try {
      await client.query(`
        CREATE TRIGGER fail_test_job_success
          BEFORE UPDATE ON generation_jobs
          FOR EACH ROW EXECUTE FUNCTION fail_test_job_success();
      `);

      try {
        let prisma: ReturnType<typeof createPrismaForUrl> | undefined;

        try {
          prisma = createPrismaForUrl(databaseUrl);
          const service = createJobService(createUnitOfWork(prisma));
          const claim = await service.claim({
            projectId: ids.projectA,
            leaseToken: leaseTokens.bob,
            leaseDurationMs: 30_000,
          });
          expect(claim.kind).toBe('claimed');
          if (claim.kind !== 'claimed') throw new Error('worker did not claim seeded job');
          const before = await fetchJobRow(client, jobIds.a);

          await expect(
            service.withFencedPublish(claim.identity, ({ appendSentinel }) =>
              appendSentinel(sentinel),
            ),
          ).rejects.toThrow('deterministic terminal failure');
          expect(await outboxRows(client)).toEqual([]);
          expect(await fetchJobRow(client, jobIds.a)).toEqual(before);
        } finally {
          await prisma?.$disconnect();
        }
      } finally {
        await client.query('DROP TRIGGER IF EXISTS fail_test_job_success ON generation_jobs');
      }
    } finally {
      await client.query('DROP FUNCTION IF EXISTS fail_test_job_success()');
    }
  },
);

schema.test(
  'lease-fence-publish lease checks use advancing PostgreSQL clock inside one transaction',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));

    try {
      const claim = await service.claim({
        projectId: ids.projectA,
        leaseToken: leaseTokens.bob,
        leaseDurationMs: 1_000,
      });
      expect(claim.kind).toBe('claimed');
      if (claim.kind !== 'claimed') throw new Error('worker did not claim seeded job');
      await withTx(prisma, 'read_committed', async (tx) => {
        expect(await createJobRepo(tx).lockForFencedPublish(claim.identity)).toMatchObject({
          kind: 'locked',
        });
        await tx.$queryRawUnsafe(`SELECT clock_timestamp() FROM pg_sleep(1.2)`);
        expect(await createJobRepo(tx).lockForFencedPublish(claim.identity)).toEqual({
          kind: 'lost',
        });
      });

      let callbackCalls = 0;
      await expect(
        service.withFencedPublish(claim.identity, async () => {
          callbackCalls += 1;
        }),
      ).resolves.toEqual({ kind: 'lost' });
      expect(callbackCalls).toBe(0);
      expect(await outboxRows(client)).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  },
  15_000,
);

import { expect } from 'vitest';
import type { JobLeaseIdentity, JobPort } from '@narraza/application';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createJobRepo } from '../repos/job-repo.js';
import {
  createPrismaForUrl,
  dbNowSnapshot,
  fetchJobRow,
  insertQueuedJobRow,
  jobIds,
  leaseTokens,
  promoteToTerminalViaRunning,
  setCancelRequested,
  setJobOrdering,
  setRunning,
  setTerminal,
  withTx,
} from './job-test-fixtures.js';

const schema = createSchemaTestSuite();

type RepoBody = (context: {
  repo: JobPort;
  client: Parameters<typeof seedUsersAndProjects>[0];
  databaseUrl: string;
}) => Promise<void>;

function jobTest(name: string, body: RepoBody): void {
  schema.test(name, async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await withTx(prisma, 'read_committed', async (tx) =>
        body({ repo: createJobRepo(tx), client, databaseUrl }),
      );
    } finally {
      await prisma.$disconnect();
    }
  });
}

function identity(
  jobId: string,
  leaseToken = leaseTokens.alice,
  fenceVersion = 0,
): JobLeaseIdentity {
  return { projectId: ids.projectA, jobId, leaseToken, fenceVersion };
}

jobTest(
  'claimNext independently orders by available_at ASC, priority DESC, created_at ASC, id ASC',
  async ({ repo, client }) => {
    for (const [id, priority] of [
      [jobIds.a, 1],
      [jobIds.b, 100],
      [jobIds.c, 9],
      [jobIds.d, 9],
      [jobIds.e, 9],
    ] as const) {
      await insertQueuedJobRow(client, {
        id,
        projectId: id === jobIds.a || id === jobIds.c ? ids.projectB : ids.projectA,
        priority,
      });
    }
    await setJobOrdering(client, [
      { id: jobIds.a, availableOffsetMs: -20_000, createdOffsetMs: -1_000 },
      { id: jobIds.b, availableOffsetMs: -10_000, createdOffsetMs: -5_000 },
      { id: jobIds.c, availableOffsetMs: -10_000, createdOffsetMs: -4_000 },
      { id: jobIds.d, availableOffsetMs: -10_000, createdOffsetMs: -3_000 },
      { id: jobIds.e, availableOffsetMs: -10_000, createdOffsetMs: -3_000 },
    ]);

    const claimedIds: string[] = [];
    for (const leaseToken of ['order-1', 'order-2', 'order-3', 'order-4', 'order-5']) {
      const result = await repo.claimNext({
        leaseToken,
        leaseDurationMs: 30_000,
      });
      expect(result.kind).toBe('claimed');
      if (result.kind === 'claimed') {
        claimedIds.push(result.job.id);
        expect(result.identity.projectId).toBe(result.job.projectId);
      }
    }
    expect(claimedIds).toEqual([jobIds.a, jobIds.b, jobIds.c, jobIds.d, jobIds.e]);
  },
);

jobTest('claimNext returns none when only future jobs exist', async ({ repo, client }) => {
  await insertQueuedJobRow(client, {
    id: jobIds.a,
    projectId: ids.projectA,
    availableOffsetMs: 60_000,
  });
  expect(
    await repo.claimNext({
      leaseToken: leaseTokens.alice,
      leaseDurationMs: 30_000,
    }),
  ).toEqual({ kind: 'none' });
  expect((await fetchJobRow(client, jobIds.a))?.status).toBe('queued');
});

schema.test(
  'claimNext uses SKIP LOCKED so concurrent claimers take distinct jobs',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, {
      id: jobIds.a,
      projectId: ids.projectA,
      availableOffsetMs: -1_000,
    });
    await insertQueuedJobRow(client, {
      id: jobIds.b,
      projectId: ids.projectB,
      availableOffsetMs: -1_000,
    });
    const blocker = await client.connect();
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobIds.a]);
      const result = await withTx(prisma, 'read_committed', (tx) =>
        createJobRepo(tx).claimNext({
          leaseToken: leaseTokens.bob,
          leaseDurationMs: 30_000,
        }),
      );
      expect(result).toMatchObject({
        kind: 'claimed',
        job: { id: jobIds.b, projectId: ids.projectB },
        identity: { projectId: ids.projectB },
      });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'requestRunningCancellation classifies a concurrent running-to-terminal transition as state_conflict',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);

    const blocker = await client.connect();
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobIds.a]);

      const cancellation = withTx(prisma, 'read_committed', (tx) =>
        createJobRepo(tx).requestRunningCancellation({
          projectId: ids.projectA,
          jobId: jobIds.a,
        }),
      );
      await blocker.query('SELECT pg_sleep(0.2)');
      await blocker.query(
        `UPDATE generation_jobs
            SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
                fence_version = fence_version + 1, updated_at = now()
          WHERE id = $1`,
        [jobIds.a],
      );
      await blocker.query('COMMIT');

      await expect(cancellation).resolves.toEqual({ kind: 'state_conflict' });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await prisma.$disconnect();
    }
  },
  15_000,
);

jobTest('heartbeat extends a cancel-requested live exact-owner lease', async ({ repo, client }) => {
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
  await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
  await setCancelRequested(client, jobIds.a);
  const result = await repo.heartbeat({ ...identity(jobIds.a), leaseDurationMs: 60_000 });
  expect(result.kind).toBe('extended');
});

jobTest('heartbeat rejects stale identity and expired ownership', async ({ repo, client }) => {
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
  await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
  expect(
    (await repo.heartbeat({ ...identity(jobIds.a, leaseTokens.stale), leaseDurationMs: 60_000 }))
      .kind,
  ).toBe('lost_ownership');
  await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
  expect((await repo.heartbeat({ ...identity(jobIds.a), leaseDurationMs: 60_000 })).kind).toBe(
    'lost_ownership',
  );
});

schema.test(
  'lease checks observe advancing database time within one transaction',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    for (const id of [jobIds.a, jobIds.b, jobIds.c]) {
      await insertQueuedJobRow(client, { id, projectId: ids.projectA, availableOffsetMs: -1_000 });
    }
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await withTx(prisma, 'read_committed', async (tx) => {
        const repo = createJobRepo(tx);
        const identities: JobLeaseIdentity[] = [];
        for (const leaseToken of ['short-heartbeat', 'short-finish', 'short-publish']) {
          const result = await repo.claimNext({
            leaseToken,
            leaseDurationMs: 100,
          });
          expect(result.kind).toBe('claimed');
          if (result.kind === 'claimed') identities.push(result.identity);
        }

        await tx.$queryRawUnsafe(`SELECT clock_timestamp() FROM pg_sleep(0.2)`);

        expect((await repo.heartbeat({ ...identities[0]!, leaseDurationMs: 30_000 })).kind).toBe(
          'lost_ownership',
        );
        expect(
          (await repo.transitionRunningToTerminal({ ...identities[1]!, status: 'failed' })).kind,
        ).toBe('lost_ownership');
        expect((await repo.lockForFencedPublish(identities[2]!)).kind).toBe('lost');
      });
    } finally {
      await prisma.$disconnect();
    }
  },
  15_000,
);

jobTest(
  'exec-retry: owned uncancelled execution requeues with cleared lease and incremented fence',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA, fenceVersion: 4 });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    const delayMs = 30_000;
    const dbBefore = await dbNowSnapshot(client);
    const result = await repo.requeueRunning({
      ...identity(jobIds.a, leaseTokens.alice, 4),
      delayMs,
    });
    const dbAfter = await dbNowSnapshot(client);
    expect(result).toMatchObject({
      kind: 'requeued',
      job: { status: 'queued', fenceVersion: 5, leaseToken: null, leaseExpiresAt: null },
    });
    if (result.kind === 'requeued') {
      const toleranceMs = 5_000;
      expect(result.job.availableAt.getTime()).toBeGreaterThanOrEqual(
        dbBefore.getTime() + delayMs - toleranceMs,
      );
      expect(result.job.availableAt.getTime()).toBeLessThanOrEqual(
        dbAfter.getTime() + delayMs + toleranceMs,
      );
    }
  },
);

jobTest(
  'exec-retry: execution requeue rejects stale and cancel-requested owners',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    expect(
      (await repo.requeueRunning({ ...identity(jobIds.a, leaseTokens.stale), delayMs: 0 })).kind,
    ).toBe('lost_ownership');
    await setCancelRequested(client, jobIds.a);
    expect((await repo.requeueRunning({ ...identity(jobIds.a), delayMs: 0 })).kind).toBe(
      'not_allowed',
    );
  },
);

jobTest('exec-retry: expired exact owner loses ownership', async ({ repo, client }) => {
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
  await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
  expect((await repo.requeueRunning({ ...identity(jobIds.a), delayMs: 0 })).kind).toBe(
    'lost_ownership',
  );
});

jobTest(
  'exec-retry: successful requeue fences prior identity from heartbeat, terminal finish, and publish lock',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA, fenceVersion: 6 });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    const prior = identity(jobIds.a, leaseTokens.alice, 6);
    expect((await repo.requeueRunning({ ...prior, delayMs: 0 })).kind).toBe('requeued');
    expect((await repo.heartbeat({ ...prior, leaseDurationMs: 30_000 })).kind).toBe(
      'lost_ownership',
    );
    expect((await repo.transitionRunningToTerminal({ ...prior, status: 'failed' })).kind).toBe(
      'lost_ownership',
    );
    expect((await repo.lockForFencedPublish(prior)).kind).toBe('lost');
  },
);

jobTest('reclaimNextExpired requeues uncancelled expired lease', async ({ repo, client }) => {
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectB, fenceVersion: 2 });
  await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
  expect(await repo.reclaimNextExpired({})).toMatchObject({
    kind: 'requeued',
    job: { id: jobIds.a, projectId: ids.projectB, status: 'queued', fenceVersion: 3 },
  });
});

jobTest(
  'reclaimNextExpired cancels cancel-requested expired lease and ignores unexpired lease',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
    await setCancelRequested(client, jobIds.a);
    await insertQueuedJobRow(client, { id: jobIds.b, projectId: ids.projectA });
    await setRunning(client, jobIds.b, leaseTokens.bob, 60_000);
    expect(await repo.reclaimNextExpired({})).toMatchObject({
      kind: 'cancelled',
      job: { id: jobIds.a, status: 'cancelled' },
    });
    expect((await repo.reclaimNextExpired({})).kind).toBe('none');
  },
);

schema.test(
  'reclaimNextExpired uses SKIP LOCKED under concurrent recovery',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    for (const id of [jobIds.a, jobIds.b]) {
      await insertQueuedJobRow(client, { id, projectId: ids.projectA });
      await setRunning(client, id, leaseTokens.alice, -1_000);
    }
    const blocker = await client.connect();
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM generation_jobs WHERE id = $1 FOR UPDATE', [jobIds.a]);
      const result = await withTx(prisma, 'read_committed', (tx) =>
        createJobRepo(tx).reclaimNextExpired({}),
      );
      expect(result).toMatchObject({ kind: 'requeued', job: { id: jobIds.b } });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await prisma.$disconnect();
    }
  },
);

jobTest(
  'job-terminal: queued cancellation is legal and does not increment fence',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA, fenceVersion: 7 });
    expect(await repo.cancelQueued({ projectId: ids.projectA, jobId: jobIds.a })).toMatchObject({
      kind: 'cancelled',
      job: { status: 'cancelled', fenceVersion: 7 },
    });
  },
);

jobTest(
  'job-terminal: succeeded, failed, and dead are legal running outcomes with cleared lease and new fence',
  async ({ repo, client }) => {
    for (const [id, status] of [
      [jobIds.a, 'succeeded'],
      [jobIds.b, 'failed'],
      [jobIds.c, 'dead'],
    ] as const) {
      await insertQueuedJobRow(client, { id, projectId: ids.projectA });
      await setRunning(client, id, leaseTokens.alice, 30_000);
      expect(await repo.transitionRunningToTerminal({ ...identity(id), status })).toMatchObject({
        kind: 'terminalized',
        job: { status, fenceVersion: 1, leaseToken: null, leaseExpiresAt: null },
      });
    }
  },
);

jobTest(
  'job-terminal: expired exact owner cannot terminalize any running outcome',
  async ({ repo, client }) => {
    for (const [id, status] of [
      [jobIds.a, 'succeeded'],
      [jobIds.b, 'failed'],
      [jobIds.c, 'dead'],
    ] as const) {
      await insertQueuedJobRow(client, { id, projectId: ids.projectA });
      await setRunning(client, id, leaseTokens.alice, -1_000);
      expect((await repo.transitionRunningToTerminal({ ...identity(id), status })).kind).toBe(
        'lost_ownership',
      );
    }
  },
);

jobTest(
  'job-terminal: expired cancel-requested exact owner cannot cancel',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
    await setCancelRequested(client, jobIds.a);
    expect(
      (await repo.transitionRunningToTerminal({ ...identity(jobIds.a), status: 'cancelled' })).kind,
    ).toBe('lost_ownership');
  },
);

jobTest(
  'job-terminal: cancellation outcomes require live exact ownership',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    expect(
      (
        await repo.transitionRunningToTerminal({
          ...identity(jobIds.a, leaseTokens.stale),
          status: 'cancelled',
        })
      ).kind,
    ).toBe('lost_ownership');

    await setCancelRequested(client, jobIds.a);
    expect(
      (
        await repo.transitionRunningToTerminal({
          ...identity(jobIds.a, leaseTokens.stale),
          status: 'succeeded',
        })
      ).kind,
    ).toBe('lost_ownership');

    await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
    expect(
      (await repo.transitionRunningToTerminal({ ...identity(jobIds.a), status: 'succeeded' })).kind,
    ).toBe('lost_ownership');
  },
);

jobTest(
  'job-terminal: cancellation requires request and request blocks success',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    expect(
      (await repo.transitionRunningToTerminal({ ...identity(jobIds.a), status: 'cancelled' })).kind,
    ).toBe('cancellation_required');
    await setCancelRequested(client, jobIds.a);
    expect(
      (await repo.transitionRunningToTerminal({ ...identity(jobIds.a), status: 'succeeded' })).kind,
    ).toBe('cancellation_blocks_success');
    expect(
      (await repo.transitionRunningToTerminal({ ...identity(jobIds.a), status: 'cancelled' })).kind,
    ).toBe('terminalized');
  },
);

jobTest(
  'job-terminal: every terminal status rejects all lifecycle operations and remains unchanged',
  async ({ repo, client }) => {
    for (const [id, status] of [
      [jobIds.a, 'succeeded'],
      [jobIds.b, 'failed'],
      [jobIds.c, 'dead'],
      [jobIds.d, 'cancelled'],
    ] as const) {
      await insertQueuedJobRow(client, { id, projectId: ids.projectA, fenceVersion: 3 });
      await promoteToTerminalViaRunning(client, id, leaseTokens.alice, status);
      const before = await fetchJobRow(client, id);
      const staleIdentity = identity(id, leaseTokens.alice, 3);

      expect(
        await repo.claimNext({
          leaseToken: leaseTokens.bob,
          leaseDurationMs: 30_000,
        }),
      ).toEqual({ kind: 'none' });
      expect((await repo.heartbeat({ ...staleIdentity, leaseDurationMs: 30_000 })).kind).toBe(
        'lost_ownership',
      );
      expect((await repo.requeueRunning({ ...staleIdentity, delayMs: 0 })).kind).toBe(
        'lost_ownership',
      );
      expect(
        (await repo.requestRunningCancellation({ projectId: ids.projectA, jobId: id })).kind,
      ).toBe('state_conflict');
      expect((await repo.cancelQueued({ projectId: ids.projectA, jobId: id })).kind).toBe(
        'state_conflict',
      );
      expect(
        await repo.transitionQueuedToTerminal({
          projectId: ids.projectA,
          jobId: id,
          status: 'cancelled',
        }),
      ).toEqual({ kind: 'already_terminal', status });
      expect(
        await repo.transitionRunningToTerminal({ ...staleIdentity, status: 'failed' }),
      ).toEqual({ kind: 'already_terminal', status });
      expect(await repo.reclaimNextExpired({})).toEqual({ kind: 'none' });
      expect((await repo.lockForFencedPublish(staleIdentity)).kind).toBe('lost');
      expect(await fetchJobRow(client, id)).toEqual(before);
    }
  },
);

jobTest(
  'owner operations reject an otherwise exact identity from another project',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectB });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    const wrongProject = identity(jobIds.a);

    expect((await repo.heartbeat({ ...wrongProject, leaseDurationMs: 30_000 })).kind).toBe(
      'lost_ownership',
    );
    expect(
      (await repo.transitionRunningToTerminal({ ...wrongProject, status: 'failed' })).kind,
    ).toBe('lost_ownership');
    expect((await repo.lockForFencedPublish(wrongProject)).kind).toBe('lost');
  },
);

jobTest(
  'fenced publish lock rejects stale, expired, and cancel-requested owners',
  async ({ repo, client }) => {
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    expect((await repo.lockForFencedPublish(identity(jobIds.a, leaseTokens.stale))).kind).toBe(
      'lost',
    );
    await setRunning(client, jobIds.a, leaseTokens.alice, -1_000);
    expect((await repo.lockForFencedPublish(identity(jobIds.a))).kind).toBe('lost');
    await setRunning(client, jobIds.a, leaseTokens.alice, 30_000);
    await setCancelRequested(client, jobIds.a);
    expect((await repo.lockForFencedPublish(identity(jobIds.a))).kind).toBe('lost');
  },
);

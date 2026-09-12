/**
 * W3.5 corrective regression: findLatestTerminalByProject must apply payload
 * (chapter) eligibility BEFORE ordering/limit. A newer terminal job from a
 * different chapter (or a different job kind) must never hide an older
 * terminal outcome of the requested chapter, and the lookup stays
 * project-scoped and terminal-only.
 */
import { expect } from 'vitest';
import type { JobPort } from '@narraza/application';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createJobRepo } from '../repos/job-repo.js';
import {
  createPrismaForUrl,
  insertQueuedJobRow,
  promoteToTerminalViaRunning,
  withTx,
} from './job-test-fixtures.js';

const schema = createSchemaTestSuite();

const SCENE_KIND = 'scene_generation';

async function seedTerminalSceneJob(
  client: Parameters<typeof seedUsersAndProjects>[0],
  input: { id: string; projectId: string; chapterId: string; ageOffsetMs: number },
): Promise<void> {
  await insertQueuedJobRow(client, {
    id: input.id,
    projectId: input.projectId,
    kind: SCENE_KIND,
    payload: { chapterId: input.chapterId },
  });
  await promoteToTerminalViaRunning(client, input.id, `lease-${input.id}`, 'succeeded');
  await client.query(
    `UPDATE generation_jobs SET updated_at = now() - ($2::bigint * INTERVAL '1 millisecond') WHERE id = $1`,
    [input.id, BigInt(input.ageOffsetMs)],
  );
}

schema.test(
  'findLatestTerminalByProject resolves the newest terminal job within the requested payload scope',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);

    // Chapter A terminal is OLDER than chapter B terminal on the same project.
    await seedTerminalSceneJob(client, {
      id: 'terminal-lookup-a',
      projectId: ids.projectA,
      chapterId: 'chapter-a',
      ageOffsetMs: 10_000,
    });
    await seedTerminalSceneJob(client, {
      id: 'terminal-lookup-b',
      projectId: ids.projectA,
      chapterId: 'chapter-b',
      ageOffsetMs: 2_000,
    });
    // A newer non-scene job kind must not interfere with scene lookups.
    await insertQueuedJobRow(client, {
      id: 'terminal-lookup-other-kind',
      projectId: ids.projectA,
      kind: 'prose',
      payload: { chapterId: 'chapter-a' },
    });
    await promoteToTerminalViaRunning(
      client,
      'terminal-lookup-other-kind',
      'lease-other',
      'succeeded',
    );
    // An ACTIVE (queued) scene job for chapter-a is not terminal and is ignored.
    await insertQueuedJobRow(client, {
      id: 'terminal-lookup-active',
      projectId: ids.projectA,
      kind: SCENE_KIND,
      payload: { chapterId: 'chapter-a' },
    });

    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await withTx(prisma, 'read_committed', async (tx) => {
        const repo: JobPort = createJobRepo(tx);

        const chapterA = await repo.findLatestTerminalByProject({
          projectId: ids.projectA,
          kind: SCENE_KIND,
          payloadFilter: { chapterId: 'chapter-a' },
        });
        expect(chapterA?.id).toBe('terminal-lookup-a');

        const chapterB = await repo.findLatestTerminalByProject({
          projectId: ids.projectA,
          kind: SCENE_KIND,
          payloadFilter: { chapterId: 'chapter-b' },
        });
        expect(chapterB?.id).toBe('terminal-lookup-b');

        const unknownChapter = await repo.findLatestTerminalByProject({
          projectId: ids.projectA,
          kind: SCENE_KIND,
          payloadFilter: { chapterId: 'chapter-unknown' },
        });
        expect(unknownChapter).toBeNull();

        const otherKind = await repo.findLatestTerminalByProject({
          projectId: ids.projectA,
          kind: 'prose',
          payloadFilter: { chapterId: 'chapter-a' },
        });
        expect(otherKind?.id).toBe('terminal-lookup-other-kind');

        // Project scope: another project never sees project A's terminal jobs.
        const foreignProject = await repo.findLatestTerminalByProject({
          projectId: ids.projectB,
          kind: SCENE_KIND,
          payloadFilter: { chapterId: 'chapter-a' },
        });
        expect(foreignProject).toBeNull();
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

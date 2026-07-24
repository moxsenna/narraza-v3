/**
 * verification-matrix: outline-downstream
 * Beat with accepted prose rejects plain outline.update.
 */
import { expect } from 'vitest';
import {
  createCreateProject,
  createUpsertOutlineNode,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function ucTest(
  name: string,
  body: (ctx: { prisma: PrismaClient }) => Promise<void>,
  timeout?: number,
): void {
  schema.test(
    name,
    async ({ databaseUrl }) => {
      const prisma = createPrismaClient(databaseUrl);
      try {
        await body({ prisma });
      } finally {
        await prisma.$disconnect();
      }
    },
    timeout,
  );
}

async function seedUser(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
    `owner-${crypto.randomUUID()}@narraza.test`,
  );
  return rows[0]!.id;
}

ucTest('outline-downstream: accepted prose blocks plain beat upsert', async ({ prisma }) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const upsert = createUpsertOutlineNode(uow);

  const project = await createProject({ ownerUserId: userId, jalur: 'has_outline' });
  expect(project.ok).toBe(true);
  if (!project.ok) return;
  const projectId = project.value.project.id;

  const roadmap = await upsert({
    ownerUserId: userId,
    projectId,
    entityType: 'roadmap',
    title: 'Roadmap',
  });
  expect(roadmap.ok).toBe(true);
  if (!roadmap.ok) return;

  const arc = await upsert({
    ownerUserId: userId,
    projectId,
    entityType: 'arc',
    parentId: roadmap.value.node.id,
    title: 'Arc 1',
    ordinal: 0,
  });
  expect(arc.ok).toBe(true);
  if (!arc.ok) return;

  const chapter = await upsert({
    ownerUserId: userId,
    projectId,
    entityType: 'chapter',
    parentId: arc.value.node.id,
    title: 'Chapter 1',
    ordinal: 0,
    narrativeSequence: 0,
  });
  expect(chapter.ok).toBe(true);
  if (!chapter.ok) return;

  const beat = await upsert({
    ownerUserId: userId,
    projectId,
    entityType: 'beat',
    parentId: chapter.value.node.id,
    title: 'Beat 1',
    purpose: 'Open',
    ordinal: 0,
    narrativeSequence: 0,
  });
  expect(beat.ok).toBe(true);
  if (!beat.ok) return;
  const beatId = beat.value.node.id;

  // Seed accepted prose pointer without full M5 accept path.
  // prose_versions requires beat_id + content + content_hash + status.
  const proseId = crypto.randomUUID();
  const contentHash = 'f'.repeat(64);
  await prisma.$executeRawUnsafe(
    `INSERT INTO prose_versions
       (id, project_id, beat_id, status, revision, content, content_hash, created_at)
     VALUES ($1, $2, $3, 'validated', 0, 'Accepted prose body', $4, now())`,
    proseId,
    projectId,
    beatId,
    contentHash,
  );
  // Some schemas use status validated/accepted — check constraint if fails.
  await prisma.$executeRawUnsafe(
    `UPDATE beats SET accepted_prose_version_id = $1, updated_at = now()
      WHERE id = $2 AND project_id = $3`,
    proseId,
    beatId,
    projectId,
  );

  const blocked = await upsert({
    ownerUserId: userId,
    projectId,
    entityType: 'beat',
    nodeId: beatId,
    parentId: chapter.value.node.id,
    title: 'Beat 1 revised',
    purpose: 'Changed',
    expectedRevision: beat.value.node.revision,
  });
  expect(blocked.ok).toBe(false);
  if (blocked.ok) return;
  expect(blocked.error.code).toBe('OUTLINE_DOWNSTREAM_LOCKED');
});

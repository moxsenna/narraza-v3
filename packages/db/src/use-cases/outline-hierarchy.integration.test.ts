/**
 * Outline hierarchy via use cases: foundation lock required, parent scoped,
 * 10 sequential chapters.
 */
import { expect } from 'vitest';
import {
  createConfirmFoundation,
  createCreateProject,
  createLockFoundation,
  createUpdateFoundationDraft,
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

function completeFoundationPayload() {
  return {
    coreConcept: 'A promise carries a hidden cost.',
    conflict: 'The recipient wants the letter destroyed.',
    endingDirection: 'Mira reveals the cost and chooses exile.',
    readerPromise: 'A tense moral mystery with earned answers.',
    mainCharacter: {
      id: 'main',
      active: true,
      identity: 'An idealistic courier',
      goal: 'Deliver the final letter',
      motivation: 'Protect her sister',
      address: 'Mira',
      speechStyle: 'Brief and formal',
    },
    relationships: [
      {
        fromCharacterId: 'other',
        toCharacterId: 'main',
        active: true,
        description: 'Former allies forced to cooperate',
      },
    ],
    secrets: [
      {
        truth: 'Mira wrote the letter herself.',
        targetPosition: { chapterId: 'chapter-10', sequence: 10 },
        breadcrumbPositions: [
          { chapterId: 'chapter-2', sequence: 2 },
          { chapterId: 'chapter-5', sequence: 5 },
        ],
      },
    ],
  };
}

async function createLockedProject(prisma: PrismaClient, userId: string): Promise<string> {
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const update = createUpdateFoundationDraft(uow);
  const confirm = createConfirmFoundation(uow);
  const lock = createLockFoundation(uow);

  const project = await createProject({ ownerUserId: userId, jalur: 'rough_idea' });
  expect(project.ok).toBe(true);
  if (!project.ok) throw new Error('create project failed');
  const projectId = project.value.project.id;

  const draft = await update({
    ownerUserId: userId,
    projectId,
    payload: completeFoundationPayload(),
    expectedRevision: null,
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) throw new Error('draft failed');

  const confirmed = await confirm({ ownerUserId: userId, projectId });
  expect(confirmed.ok).toBe(true);

  const locked = await lock({ ownerUserId: userId, projectId, acknowledged: true });
  expect(locked.ok).toBe(true);
  if (!locked.ok) throw new Error(`lock failed: ${locked.error.code}`);
  return projectId;
}

ucTest('outline hierarchy: rejected before foundation lock', async ({ prisma }) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const upsert = createUpsertOutlineNode(uow);

  const project = await createProject({ ownerUserId: userId, jalur: 'rough_idea' });
  expect(project.ok).toBe(true);
  if (!project.ok) return;

  const result = await upsert({
    ownerUserId: userId,
    projectId: project.value.project.id,
    entityType: 'roadmap',
    title: 'Roadmap',
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('VALIDATION');
  expect(result.error.publicMessageCode).toBe('msg.outline.foundation_not_locked');
});

ucTest('outline hierarchy: roadmap → arc → 10 chapters sequential', async ({ prisma }) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const upsert = createUpsertOutlineNode(uow);
  const projectId = await createLockedProject(prisma, userId);

  const roadmap = await upsert({
    ownerUserId: userId,
    projectId,
    entityType: 'roadmap',
    title: 'Roadmap utama',
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

  const titles = [
    'Tuduhan di Meja Makan',
    'Pesan yang Dihapus',
    'Saksi Pertama',
    'Nadira Diusir',
    'Rekaman yang Hilang',
    'Kebohongan Sang Mertua',
    'Ancaman Hak Asuh',
    'Sekutu Tak Terduga',
    'Bukti dari Rumah Lama',
    'Nama Pelaku Terungkap',
  ];
  for (let i = 0; i < titles.length; i++) {
    const chapter = await upsert({
      ownerUserId: userId,
      projectId,
      entityType: 'chapter',
      parentId: arc.value.node.id,
      title: titles[i]!,
      ordinal: i + 1,
      narrativeSequence: i + 1,
    });
    expect(chapter.ok).toBe(true);
  }

  const rows = await prisma.$queryRawUnsafe<{ ordinal: number; title: string }[]>(
    `SELECT ordinal, title FROM chapters
      WHERE project_id = $1 AND deleted_at IS NULL
      ORDER BY ordinal`,
    projectId,
  );
  expect(rows).toHaveLength(10);
  expect(rows.map((r) => r.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(rows[0]!.title).toBe('Tuduhan di Meja Makan');
  expect(rows[9]!.title).toBe('Nama Pelaku Terungkap');
});

ucTest('outline hierarchy: foreign parent → NOT_FOUND', async ({ prisma }) => {
  const userA = await seedUser(prisma);
  const userB = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const upsert = createUpsertOutlineNode(uow);

  const projectA = await createLockedProject(prisma, userA);
  const projectB = await createLockedProject(prisma, userB);

  const roadmapA = await upsert({
    ownerUserId: userA,
    projectId: projectA,
    entityType: 'roadmap',
    title: 'A',
  });
  expect(roadmapA.ok).toBe(true);
  if (!roadmapA.ok) return;

  const stolen = await upsert({
    ownerUserId: userB,
    projectId: projectB,
    entityType: 'arc',
    parentId: roadmapA.value.node.id,
    title: 'Stolen arc',
    ordinal: 0,
  });
  expect(stolen.ok).toBe(false);
  if (stolen.ok) return;
  expect(stolen.error.code).toBe('NOT_FOUND');
});

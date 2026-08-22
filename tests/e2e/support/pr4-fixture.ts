/**
 * PR4 Fixture Helper
 *
 * Application-layer chapter creation following foundation-preservation pattern
 */
import { type Page, type TestInfo } from '@playwright/test';
import { createVerifiedSession } from './auth-session';
import { randomUUID } from 'node:crypto';

export type Pr4Fixture = Readonly<{
  userId: string;
  projectId: string;
  chapterId: string;
  projectTitle: string;
  chapterTitle: string;
}>;

const DATABASE_URL = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;

async function completeFoundationSeed(
  prisma: unknown,
  uow: unknown,
  ownerId: string,
  projectId: string,
): Promise<void> {
  const stamp = randomUUID();

  const seedPayload = {
    coreConcept: `Konsep awal ${stamp}`,
    conflict: `Konflik ${stamp}`,
    endingDirection: `Akhir ${stamp}`,
    readerPromise: `Janji ${stamp}`,
    mainCharacter: {
      id: `main-character-${stamp}`,
      active: true,
      identity: `Identitas ${stamp}`,
      goal: `Tujuan ${stamp}`,
      motivation: `Motivasi ${stamp}`,
      address: `Panggilan ${stamp}`,
      speechStyle: `Gaya bicara ${stamp}`,
    },
    relationships: [
      {
        fromCharacterId: `main-character-${stamp}`,
        toCharacterId: `relationship-character-${stamp}`,
        active: true,
        description: `Relasi ${stamp}`,
      },
    ],
    secrets: [
      {
        truth: `Rahasia ${stamp}`,
        targetPosition: { chapterId: `target-chapter-${stamp}`, sequence: 37 },
        breadcrumbPositions: [
          { chapterId: `breadcrumb-one-${stamp}`, sequence: 11 },
          { chapterId: `breadcrumb-two-${stamp}`, sequence: 23 },
        ],
      },
    ],
  };

  // Create Foundation draft
  const createUpdateFoundationDraft = await import('../../packages/application/dist/index.js').then(
    (m) => m.createUpdateFoundationDraft,
  );

  const updateFoundation = createUpdateFoundationDraft(uow);
  const foundationResult = await updateFoundation({
    ownerUserId: ownerId,
    projectId,
    expectedRevision: null,
    payload: seedPayload,
  });

  if (!foundationResult.ok) {
    throw new Error(`Foundation seed failed: ${foundationResult.error.publicMessageCode}`);
  }

  // Confirm Foundation
  const createConfirmFoundation = await import('../../packages/application/dist/index.js').then(
    (m) => m.createConfirmFoundation,
  );

  const confirmFoundation = createConfirmFoundation(uow);
  const confirmResult = await confirmFoundation({
    ownerUserId: ownerId,
    projectId,
  });

  if (!confirmResult.ok) {
    throw new Error(`Failed to confirm Foundation: ${confirmResult.error.publicMessageCode}`);
  }

  // Lock Foundation
  const createLockFoundation = await import('../../packages/application/dist/index.js').then(
    (m) => m.createLockFoundation,
  );

  const lockFoundation = createLockFoundation(uow);
  const lockResult = await lockFoundation({
    ownerUserId: ownerId,
    projectId,
    acknowledged: true,
  });

  if (!lockResult.ok) {
    throw new Error(`Failed to lock Foundation: ${lockResult.error.publicMessageCode}`);
  }

  if (lockResult.value.foundation.status !== 'locked') {
    throw new Error(`Foundation not locked: ${lockResult.value.foundation.status}`);
  }
}

export async function seedPr4ChapterForCurrentUser({
  page,
  testInfo,
  label,
}: {
  page: Page;
  testInfo: TestInfo;
  label: string;
}): Promise<Pr4Fixture> {
  const dbUrl = DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL or DATABASE_URL_WEB required for PR4 fixture');
  }
  const [application, db] = await Promise.all([
    import('../../packages/application/dist/index.js'),
    import('../../packages/db/dist/index.js'),
  ]);

  const email = (await createVerifiedSession(page, testInfo)).email;
  const prisma = db.createPrismaClient(DATABASE_URL);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`Registered user not found: ${email}`);
  }

  const uow = db.createUnitOfWork(prisma);

  // Create project
  const createCreateProject = application.createCreateProject;
  const projectResult = await createCreateProject(uow)({
    ownerUserId: user.id,
    jalur: 'rough_idea' as const,
    title: `PR4 Fixture Project ${label}`,
  });

  if (!projectResult.ok) {
    throw new Error(`Project seed failed: ${projectResult.error.publicMessageCode}`);
  }

  const projectId = projectResult.value.project.id;
  const projectTitle = projectResult.value.project.title;

  // Complete Foundation with full payload
  await completeFoundationSeed(prisma, uow, user.id, projectId);

  // Create roadmap
  const createUpsertOutlineNode = application.createUpsertOutlineNode;
  const roadmapResult = await createUpsertOutlineNode(uow)({
    ownerUserId: user.id,
    projectId,
    entityType: 'roadmap',
    title: `Roadmap: ${projectTitle}`,
  });

  if (!roadmapResult.ok) {
    throw new Error(`Failed to create roadmap: ${roadmapResult.error.publicMessageCode}`);
  }

  const roadmapNodeId = roadmapResult.value.node.id;

  // Create arc under roadmap
  const arcResult = await createUpsertOutlineNode(uow)({
    ownerUserId: user.id,
    projectId,
    entityType: 'arc',
    parentId: roadmapNodeId,
    title: 'Arc 1',
    ordinal: 1,
  });

  if (!arcResult.ok) {
    throw new Error(`Failed to create arc: ${arcResult.error.publicMessageCode}`);
  }

  const arcNodeId = arcResult.value.node.id;

  // Create chapter under arc
  const chapterResult = await createUpsertOutlineNode(uow)({
    ownerUserId: user.id,
    projectId,
    entityType: 'chapter',
    parentId: arcNodeId,
    title: 'Bab 1 - Pendahuluan',
    ordinal: 1,
    narrativeSequence: 1,
  });

  if (!chapterResult.ok) {
    throw new Error(`Failed to create chapter: ${chapterResult.error.publicMessageCode}`);
  }

  const chapterNode = chapterResult.value.node;

  return {
    userId: user.id,
    projectId,
    chapterId: chapterNode.id,
    projectTitle,
    chapterTitle: chapterNode.title,
  };
}

/**
 * PR4 IDOR (Insecure Direct Object Reference) Matrix
 */
import { randomUUID } from 'node:crypto';
import { type Page, type TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { createVerifiedSession } from './support/auth-session';

test.describe.configure({ timeout: 180_000 });

async function createPr4Fixture(
  page: Page,
  testInfo: TestInfo,
): Promise<{ projectId: string; chapterId: string }> {
  const [application, db] = await Promise.all([
    import('../../packages/application/dist/index.js'),
    import('../../packages/db/dist/index.js'),
  ]);

  const databaseUrl = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required');

  const prisma = db.createPrismaClient(databaseUrl);
  const { email } = await createVerifiedSession(page, testInfo);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) throw new Error(`User not found: ${email}`);

  const uow = db.createUnitOfWork(prisma);
  const stamp = randomUUID();
  const projectTitle = `PR4 IDOR Project ${stamp}`;

  const createProject = application.createCreateProject(uow);
  const projectResult = await createProject({
    ownerUserId: user.id,
    jalur: 'rough_idea' as const,
    title: projectTitle,
  });

  if (!projectResult.ok) {
    throw new Error(`Failed to create project: ${projectResult.error.publicMessageCode}`);
  }

  const projectId = projectResult.value.project.id;

  const confirmFoundation = application.createConfirmFoundationDraft(uow);
  const foundationResult = await confirmFoundation({ ownerUserId: user.id, projectId });
  if (!foundationResult.ok) {
    throw new Error(`Failed to confirm Foundation: ${foundationResult.error.publicMessageCode}`);
  }

  const lockFoundation = application.createLockFoundation(uow);
  const lockResult = await lockFoundation({ ownerUserId: user.id, projectId });
  if (!lockResult.ok) {
    throw new Error(`Failed to lock Foundation: ${lockResult.error.publicMessageCode}`);
  }

  const createRoadmap = application.createUpsertOutlineNode(uow);
  const roadmapResult = await createRoadmap({
    ownerId: user.id,
    entityType: 'roadmap' as const,
    parentId: null,
    title: `Roadmap: ${projectTitle}`,
    jalur: 'rough_idea' as const,
  });

  if (!roadmapResult.ok) {
    throw new Error(`Failed to create roadmap: ${roadmapResult.error.publicMessageCode}`);
  }

  const roadmapNodeId = roadmapResult.value.node.id;

  const createArcResult = await application.createUpsertOutlineNode(uow)({
    ownerId: user.id,
    entityType: 'arc' as const,
    parentId: roadmapNodeId,
    title: 'Arc 1',
    jalur: 'rough_idea' as const,
  });

  if (!createArcResult.ok) {
    throw new Error(`Failed to create arc: ${createArcResult.error.publicMessageCode}`);
  }

  const arcNodeId = createArcResult.value.node.id;

  const createChapterResult = await application.createUpsertOutlineNode(uow)({
    ownerId: user.id,
    entityType: 'chapter' as const,
    parentId: arcNodeId,
    title: 'Bab 1 - Pendahuluan',
    jalur: 'rough_idea' as const,
  });

  if (!createChapterResult.ok) {
    throw new Error(`Failed to create chapter: ${createChapterResult.error.publicMessageCode}`);
  }

  return { projectId, chapterId: createChapterResult.value.node.id };
}

async function getRandomUuid(): Promise<string> {
  return randomUUID();
}

test.describeParallel('Unauthorized Access Scenarios', () => {
  test('owner B cannot access owner A project + chapter combination', async ({
    page,
  }, testInfo) => {
    const [projectA, projectB] = await Promise.all([
      createPr4Fixture(page, { ...testInfo, project: { name: 'idor-a-1' } }),
      createPr4Fixture(page, { ...testInfo, project: { name: 'idor-b-1' } }),
    ]);

    const routes = [
      `/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/tulis`,
      `/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/cek`,
      `/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/selesaikan`,
      `/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/naskah`,
      `/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/publish`,
    ];

    for (const route of routes) {
      await page.goto(route);
      const body = await page.locator('body').innerText();
      expect(body.toLowerCase()).not.toContain('not found');
    }

    const foreignRoutes = routes.map((r) => r.replace(projectA.projectId, projectB.projectId));

    for (const route of foreignRoutes) {
      await page.goto(route);
      const lowerBody = (await page.locator('body').innerText()).toLowerCase();
      expect(lowerBody).toContain('not found');
      expect(lowerBody).toContain('tidak ditemukan');
    }
  });

  test('owner B cannot access random project IDs', async ({ page }, testInfo) => {
    const projectARandom = await createPr4Fixture(page, {
      ...testInfo,
      project: { name: 'idor-random-1' },
    });
    const randomProjectId = await getRandomUuid();

    const routes = [
      `/app/proyek/${randomProjectId}/bab/${projectARandom.chapterId}/tulis`,
      `/app/proyek/${randomProjectId}/bab/${projectARandom.chapterId}/cek`,
      `/app/proyek/${randomProjectId}/bab/${projectARandom.chapterId}/selesaikan`,
      `/app/proyek/${randomProjectId}/bab/${projectARandom.chapterId}/naskah`,
      `/app/proyek/${randomProjectId}/bab/${projectARandom.chapterId}/publish`,
    ];

    for (const route of routes) {
      await page.goto(route);
      const lowerBody = (await page.locator('body').innerText()).toLowerCase();
      expect(lowerBody).toContain('not found');
      expect(lowerBody).toContain('tidak ditemukan');
    }
  });

  test('foreign chapter in valid project fails identically', async ({ page }, testInfo) => {
    const projectB = await createPr4Fixture(page, {
      ...testInfo,
      project: { name: 'idor-fgch-2' },
    });
    const randomChapterId = await getRandomUuid();

    const routes = [
      `/app/proyek/${projectB.projectId}/bab/${randomChapterId}/tulis`,
      `/app/proyek/${projectB.projectId}/bab/${randomChapterId}/cek`,
      `/app/proyek/${projectB.projectId}/bab/${randomChapterId}/selesaikan`,
      `/app/proyek/${projectB.projectId}/bab/${randomChapterId}/naskah`,
      `/app/proyek/${projectB.projectId}/bab/${randomChapterId}/publish`,
    ];

    for (const route of routes) {
      await page.goto(route);
      const lowerBody = (await page.locator('body').innerText()).toLowerCase();
      expect(lowerBody).toContain('not found');
      expect(lowerBody).toContain('tidak ditemukan');
    }
  });

  test('no data leakage on denied access', async ({ page }, testInfo) => {
    const projectANoLeak = await createPr4Fixture(page, {
      ...testInfo,
      project: { name: 'idor-noleak' },
    });
    const randomProjectId = await getRandomUuid();
    const randomChapterId = await getRandomUuid();

    const route = `/app/proyek/${randomProjectId}/bab/${randomChapterId}/tulis`;
    await page.goto(route);

    const body = await page.locator('body').innerText();

    expect(body).not.toContain(projectANoLeak.projectTitle);
    expect(body).not.toContain(projectANoLeak.chapterTitle);

    const uuidPattern = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const matches = body.match(uuidPattern) || [];
    for (const match of matches) {
      expect(match).not.toContain(projectANoLeak.projectId);
      expect(match).not.toContain(projectANoLeak.chapterId);
    }
  });
});

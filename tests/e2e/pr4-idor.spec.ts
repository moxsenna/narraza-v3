/**
 * PR4 IDOR matrix for all chapter workspace routes.
 *
 * Denied combinations must render the same branded not-found surface without
 * exposing project, chapter, tenant, or requested identifier details.
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { seedPr4ChapterForCurrentUser, type Pr4Fixture } from './support/pr4-fixture';

test.describe.configure({ timeout: 180_000 });

const chapterRouteSuffixes = ['tulis', 'cek', 'selesaikan', 'naskah', 'publish'] as const;
const brandedNotFoundCopy = {
  eyebrow: '404',
  title: 'Halaman ini tidak ditemukan',
  description: 'Alamatnya mungkin berubah atau halaman belum tersedia.',
} as const;

async function expectBrandedNotFound(page: Page, secrets: readonly string[] = []): Promise<string> {
  await expect(page.getByText(brandedNotFoundCopy.eyebrow, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole('heading', { level: 1, name: brandedNotFoundCopy.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(brandedNotFoundCopy.description, { exact: true })).toBeVisible();

  const mainText = (await page.locator('main').innerText()).trim();
  const normalizedText = mainText.toLowerCase();
  for (const secret of secrets) {
    expect(normalizedText).not.toContain(secret.toLowerCase());
  }

  return mainText;
}

async function createVictimFixture(
  browser: Browser,
  testInfo: TestInfo,
  label: string,
): Promise<Pr4Fixture> {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    return await seedPr4ChapterForCurrentUser({ page, testInfo, label });
  } finally {
    await context.close();
  }
}

async function assertDeniedAcrossChapterRoutes({
  page,
  projectId,
  chapterId,
  secrets,
  expectedNotFound,
}: {
  page: Page;
  projectId: string;
  chapterId: string;
  secrets: readonly string[];
  expectedNotFound?: string;
}): Promise<string> {
  let canonicalNotFound = expectedNotFound;

  for (const suffix of chapterRouteSuffixes) {
    await test.step(`${suffix} denies without leaking context`, async () => {
      await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/${suffix}`);
      const notFoundText = await expectBrandedNotFound(page, [...secrets, projectId, chapterId]);
      canonicalNotFound ??= notFoundText;
      expect(notFoundText).toBe(canonicalNotFound);
    });
  }

  if (!canonicalNotFound) throw new Error('chapter route matrix did not run');
  return canonicalNotFound;
}

test.describe('chapter workspace IDOR', () => {
  test('foreign project and foreign chapter are denied identically across five routes', async ({
    page,
    browser,
  }, testInfo) => {
    const victim = await createVictimFixture(browser, testInfo, 'idor-foreign-project-chapter');
    const attacker = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-foreign-project-attacker',
    });

    await assertDeniedAcrossChapterRoutes({
      page,
      projectId: victim.projectId,
      chapterId: victim.chapterId,
      secrets: [
        victim.projectTitle,
        victim.chapterTitle,
        attacker.projectTitle,
        attacker.chapterTitle,
      ],
    });
  });

  test('missing project and random chapter are denied identically across five routes', async ({
    page,
  }, testInfo) => {
    const attacker = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-missing-project-random-chapter',
    });

    await assertDeniedAcrossChapterRoutes({
      page,
      projectId: randomUUID(),
      chapterId: randomUUID(),
      secrets: [attacker.projectTitle, attacker.chapterTitle],
    });
  });

  test('owned project with foreign or random chapter is denied with identical branding', async ({
    page,
    browser,
  }, testInfo) => {
    const victim = await createVictimFixture(browser, testInfo, 'idor-cross-project-victim');
    const attacker = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-owned-project-attacker',
    });

    const canonicalNotFound = await assertDeniedAcrossChapterRoutes({
      page,
      projectId: attacker.projectId,
      chapterId: victim.chapterId,
      secrets: [
        victim.projectTitle,
        victim.chapterTitle,
        attacker.projectTitle,
        attacker.chapterTitle,
      ],
    });

    await assertDeniedAcrossChapterRoutes({
      page,
      projectId: attacker.projectId,
      chapterId: randomUUID(),
      secrets: [
        victim.projectTitle,
        victim.chapterTitle,
        attacker.projectTitle,
        attacker.chapterTitle,
      ],
      expectedNotFound: canonicalNotFound,
    });
  });

  test('foreign or missing project cannot be paired with attacker chapter', async ({
    page,
    browser,
  }, testInfo) => {
    const victim = await createVictimFixture(browser, testInfo, 'idor-project-boundary-victim');
    const attacker = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-project-boundary-attacker',
    });
    const secrets = [
      victim.projectTitle,
      victim.chapterTitle,
      attacker.projectTitle,
      attacker.chapterTitle,
    ];

    const canonicalNotFound = await assertDeniedAcrossChapterRoutes({
      page,
      projectId: victim.projectId,
      chapterId: attacker.chapterId,
      secrets,
    });

    await assertDeniedAcrossChapterRoutes({
      page,
      projectId: randomUUID(),
      chapterId: attacker.chapterId,
      secrets,
      expectedNotFound: canonicalNotFound,
    });
  });

  test('all denied project/chapter classes share one branded no-leak response', async ({
    page,
    browser,
  }, testInfo) => {
    const victim = await createVictimFixture(browser, testInfo, 'idor-identical-victim');
    const attacker = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-identical-attacker',
    });
    const missingProjectId = randomUUID();
    const randomChapterId = randomUUID();
    const secrets = [
      victim.projectTitle,
      victim.chapterTitle,
      attacker.projectTitle,
      attacker.chapterTitle,
      missingProjectId,
      randomChapterId,
    ];
    const deniedPairs = [
      [victim.projectId, victim.chapterId],
      [victim.projectId, attacker.chapterId],
      [missingProjectId, randomChapterId],
      [missingProjectId, attacker.chapterId],
      [attacker.projectId, victim.chapterId],
      [attacker.projectId, randomChapterId],
    ] as const;

    let canonicalNotFound: string | undefined;
    for (const [projectId, chapterId] of deniedPairs) {
      await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/tulis`);
      const notFoundText = await expectBrandedNotFound(page, secrets);
      canonicalNotFound ??= notFoundText;
      expect(notFoundText).toBe(canonicalNotFound);
    }
  });

  test('positive control: owner can access all five chapter workspaces', async ({
    page,
  }, testInfo) => {
    const owner = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-positive-control',
    });

    for (const suffix of chapterRouteSuffixes) {
      await page.goto(`/app/proyek/${owner.projectId}/bab/${owner.chapterId}/${suffix}`);
      await expect(page.locator('main')).toContainText(owner.projectTitle);
      await expect(page.locator('main')).toContainText(owner.chapterTitle);
      await expect(
        page.getByRole('heading', { level: 1, name: brandedNotFoundCopy.title, exact: true }),
      ).toHaveCount(0);
    }
  });
});

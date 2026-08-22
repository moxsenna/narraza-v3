/**
 * PR4 IDOR (Insecure Direct Object Reference) Matrix
 *
 * Tests all combinations of unauthorized chapter access across five routes
 * Uses browser context isolation for victim/attacker separation
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type TestInfo, type Page } from '@playwright/test';
import { seedPr4ChapterForCurrentUser } from './support/pr4-fixture';

test.describe.configure({ timeout: 180_000 });

async function createRandomUuid(): Promise<string> {
  return randomUUID();
}

async function expectBrandedNotFound(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).toMatch(/tidak ditemukan|not found|halaman/i);
}

// Create victim context that owns Project A + Chapter A
async function createVictimContext(
  browser: Browser,
  testInfo: TestInfo,
  label: string,
): Promise<{ projectId: string; chapterId: string }> {
  const victimContext = await browser.newContext();
  const victimPage = await victimContext.newPage();

  try {
    const result = await seedPr4ChapterForCurrentUser({
      page: victimPage,
      testInfo,
      label,
    });

    // Close context after successful creation to clean up
    await victimContext.close();

    return { projectId: result.projectId, chapterId: result.chapterId };
  } catch (error) {
    await victimContext.close();
    throw error;
  }
}

test.describe('Unauthorized Access Scenarios', () => {
  test('owner B cannot access owner A project + chapter combination', async ({
    page,
    browser,
  }, testInfo) => {
    // Create victim (Project A + Chapter A) in isolated context
    const [projectA] = await Promise.all([createVictimContext(browser, testInfo, 'idor-victim-a')]);

    // Main page is attacker (Project B + Chapter B)
    const projectB = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-attacker-b',
    });

    // First verify own access works
    await page.goto(`/app/proyek/${projectB.projectId}/bab/${projectB.chapterId}/tulis`);
    const bodyOwn = await page.locator('body').innerText();
    expect(bodyOwn.toLowerCase()).not.toContain('tidak ditemukan');

    // Now attempt foreign access - should fail closed
    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/tulis`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/cek`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/selesaikan`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/naskah`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/publish`);
    await expectBrandedNotFound(page);
  });

  test('owner B cannot access random project IDs', async ({ page }, testInfo) => {
    const projectOwner = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-random-owner',
    });

    const randomProjectId = await createRandomUuid();

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/tulis`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/cek`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/selesaikan`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/naskah`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/publish`);
    await expectBrandedNotFound(page);
  });

  test('foreign chapter in valid project fails identically', async ({ page }, testInfo) => {
    const projectB = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-valid-project',
    });

    const randomChapterId = await createRandomUuid();

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/tulis`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/cek`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/selesaikan`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/naskah`);
    await expectBrandedNotFound(page);

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/publish`);
    await expectBrandedNotFound(page);
  });

  test('no data leakage on denied access', async ({ page }, testInfo) => {
    const projectAVictim = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-no-leak-victim',
    });

    const randomProjectId = await createRandomUuid();
    const randomChapterId = await createRandomUuid();

    const route = `/app/proyek/${randomProjectId}/bab/${randomChapterId}/tulis`;
    await page.goto(route);

    const body = await page.locator('body').innerText();

    // No leaked project/chapter titles
    expect(body).not.toContain(projectAVictim.projectTitle);
    expect(body).not.toContain(projectAVictim.chapterTitle);

    // No raw IDs exposed in readable form
    const uuidPattern = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const matches = body.match(uuidPattern) || [];
    for (const match of matches) {
      expect(match).not.toContain(projectAVictim.projectId);
      expect(match).not.toContain(projectAVictim.chapterId);
    }
  });
});

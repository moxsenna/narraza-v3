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
): Promise<{ projectId: string; chapterId: string; projectTitle: string; chapterTitle: string }> {
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

    return {
      projectId: result.projectId,
      chapterId: result.chapterId,
      projectTitle: result.projectTitle,
      chapterTitle: result.chapterTitle,
    };
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

    // Positive control: owner B can access own chapter
    await page.goto(`/app/proyek/${projectB.projectId}/bab/${projectB.chapterId}/tulis`);
    const bodyOwn = await page.locator('body').innerText();
    expect(bodyOwn.toLowerCase()).not.toContain('tidak ditemukan');
    expect(bodyOwn).toContain(projectB.projectTitle);
    expect(bodyOwn).toContain(projectB.chapterTitle);

    // CASE 1: Foreign project + foreign chapter → NOT_FOUND
    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/tulis`);
    await expectBrandedNotFound(page);
    let deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectA.projectTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectA.chapterTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectA.projectId);
    expect(deniedBody).not.toContain(projectA.chapterId);

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/cek`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectA.projectTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectA.chapterTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/selesaikan`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectA.projectTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectA.chapterTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/naskah`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectA.projectTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectA.chapterTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectA.projectId}/bab/${projectA.chapterId}/publish`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectA.projectTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectA.chapterTitle.toLowerCase());
  });

  test('owner B cannot access random project IDs', async ({ page }, testInfo) => {
    const projectOwner = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-random-owner',
    });

    const randomProjectId = await createRandomUuid();

    // CASE 2: Random project + any chapter → NOT_FOUND with no leakage
    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/tulis`);
    await expectBrandedNotFound(page);
    let deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectOwner.projectTitle.toLowerCase());
    expect(deniedBody).not.toContain(projectOwner.chapterTitle.toLowerCase());

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/cek`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectOwner.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/selesaikan`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectOwner.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/naskah`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectOwner.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${randomProjectId}/bab/${projectOwner.chapterId}/publish`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectOwner.projectTitle.toLowerCase());
  });

  test('foreign chapter in valid project fails identically', async ({ page }, testInfo) => {
    const projectB = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-valid-project',
    });

    const randomChapterId = await createRandomUuid();

    // CASE 3: Owned project + ACTUAL foreign chapter → NOT_FOUND (not random!)
    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/tulis`);
    await expectBrandedNotFound(page);
    let deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectB.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/cek`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectB.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/selesaikan`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectB.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/naskah`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectB.projectTitle.toLowerCase());

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${randomChapterId}/publish`);
    await expectBrandedNotFound(page);
    deniedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(deniedBody).not.toContain(projectB.projectTitle.toLowerCase());
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

  test('positive control: owner B can access own project + chapter', async ({ page }, testInfo) => {
    const projectB = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'idor-positive-control',
    });

    await page.goto(`/app/proyek/${projectB.projectId}/bab/${projectB.chapterId}/tulis`);
    const body = await page.locator('body').innerText();

    // Should NOT be NOT_FOUND
    expect(body.toLowerCase()).not.toContain('tidak ditemukan');

    // Must contain context
    expect(body).toContain(projectB.projectTitle);
    expect(body).toContain(projectB.chapterTitle);
  });
});

/**
 * PR4 Chapter Workspace E2E Coverage
 *
 * Verifies all five chapter routes resolve correctly with owner context
 */
import { expect, test } from '@playwright/test';
import { clearMailpit, waitForMailLink } from './mailpit';

const mailpitApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8025';
const password = 'Narraza!Pr4Test123';

test.describe.configure({ timeout: 120_000 });

async function registerAndEnterApp(page: Page, email: string): Promise<void> {
  await page.goto('/daftar');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByLabel('Ulangi kata sandi').fill(password);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText(/kami sudah mengirim tautan verifikasi/i)).toBeVisible();

  const verificationLink = await waitForMailLink({
    apiBaseUrl: mailpitApiUrl,
    recipient: email,
    subject: 'Verifikasi email Narraza-mu',
  });
  await page.goto(verificationLink);
  await expect(page).toHaveURL(/\/verifikasi\/selesaikan$/);
  await page.getByRole('button', { name: 'Verifikasi & masuk' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function createProjectWithChapter(page: Page, title: string): Promise<{ projectId: string; chapterId: string }> {
  // Create project
  await page.goto('/app/proyek/baru');
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="jalur"][value="rough_idea"]').check();
  await page.getByRole('button', { name: /Buat proyek/i }).click();
  await expect(page).toHaveURL(/\/app\/proyek\/(?!baru(?:\/|$))[^/?#]+$/, { timeout: 45_000 });
  
  const url = page.url();
  const match = url.match(/\/app\/proyek\/([^/?#]+)/);
  if (!match || match[1] === 'baru') {
    throw new Error(`project id missing from URL: ${url}`);
  }
  const projectId = match[1]!;

  // Navigate to outline and add first chapter
  await page.goto(`/app/proyek/${projectId}/outline`);
  
  // Add a chapter
  const addChapterButton = page.getByRole('button', { name: /Tambah Bab|Tambahkan Bab/i }).first();
  if (await addChapterButton.count() > 0) {
    await addChapterButton.click();
    
    const chapterTitleInput = page.locator('input[name="title"]').first();
    if (await chapterTitleInput.isVisible()) {
      await chapterTitleInput.fill(`Bab 1 - ${title.split(' ')[0]}`);
    }
    
    await page.getByRole('button', { name: /Simpan|Tambah/i }).first().click();
  }

  // Extract chapter ID by clicking on any available chapter link
  const chapterLink = page.locator('a[href*="/bab/"]').first();
  if (await chapterLink.count() > 0) {
    await chapterLink.click();
    await expect(page).toHaveURL(/\/app\/proyek\/[^/]+\/bab\/[^?]+/, { timeout: 15_000 });
    const newUrl = page.url();
    const chapterMatch = newUrl.match(/\/bab\/([^?]+)/);
    if (chapterMatch) {
      const chapterId = chapterMatch[1]!;
      // Navigate back
      await page.goto(`/app/proyek/${projectId}`);
      return { projectId, chapterId };
    }
  }

  throw new Error('Could not obtain chapter ID');
}

test.describe('PR4 Chapter Routes - Owner Context Verification', () => {
  test('five chapter routes resolve with valid owner context', async ({ page }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const email = `pr4-owner-${stamp}@example.test`;
    const projectTitle = `PR4 Test Project ${stamp}`;

    await clearMailpit(mailpitApiUrl);
    await registerAndEnterApp(page, email);

    const { projectId, chapterId } = await createProjectWithChapter(page, projectTitle);

    // Verify each route resolves without error
    const routes = [
      `/app/proyek/${projectId}/bab/${chapterId}/tulis`,
      `/app/proyek/${projectId}/bab/${chapterId}/cek`,
      `/app/proyek/${projectId}/bab/${chapterId}/selesaikan`,
      `/app/proyek/${projectId}/bab/${chapterId}/naskah`,
      `/app/proyek/${projectId}/bab/${chapterId}/publish`,
    ];

    for (const route of routes) {
      await page.goto(route);

      // Route should not be 404
      const body = await page.locator('body').innerText();
      expect(body.toLowerCase()).not.toContain('not found');
      expect(body.toLowerCase()).not.toContain('tidak ditemukan');

      // Should show honest unavailable state
      const hasUnavailableState = /belum tersedia|tidak ada|honest|capabilit/i.test(body);
      expect(hasUnavailableState).toBeTruthy();
    }
  });

  test('no raw IDs or technical jargon visible in chapter routes', async ({ page }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const email = `pr4-noid-${stamp}@example.test`;

    await clearMailpit(mailpitApiUrl);
    await registerAndEnterApp(page, email);

    const { projectId, chapterId } = await createProjectWithChapter(page, `NoID Project ${stamp}`);

    await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/tulis`);

    const body = await page.locator('body').innerText();

    // No UUIDs in body text
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    expect(body).not.toMatch(uuidPattern);

    // No technical terms exposed to users
    const forbiddenTerms = ['m4', 'backend', 'resolver', 'disabled', 'realdata'];
    for (const term of forbiddenTerms) {
      expect(body.toLowerCase()).not.toContain(term);
    }
  });

  test('responsive rendering at 375px and 1280px', async ({ page }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const email = `pr4-responsive-${stamp}@example.test`;

    await clearMailpit(mailpitApiUrl);
    await registerAndEnterApp(page, email);

    const { projectId, chapterId } = await createProjectWithChapter(page, `Responsive Test ${stamp}`);

    const routes = [
      `/app/proyek/${projectId}/bab/${chapterId}/tulis`,
      `/app/proyek/${projectId}/bab/${chapterId}/cek`,
    ];

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    for (const route of routes) {
      await page.goto(route);
      const main = page.locator('main');
      await expect(main).toBeVisible({ timeout: 15_000 });

      const html = page.locator('html');
      const scrollbarWidth = await html.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(scrollbarWidth).toBeLessThanOrEqual(0);
    }

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const route of routes) {
      await page.goto(route);
      const main = page.locator('main');
      await expect(main).toBeVisible({ timeout: 15_000 });
    }
  });

  test('capability honesty - no fake states', async ({ page }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const email = `pr4-honest-${stamp}@example.test`;

    await clearMailpit(mailpitApiUrl);
    await registerAndEnterApp(page, email);

    const { projectId, chapterId } = await createProjectWithChapter(page, `Honesty Test ${stamp}`);

    await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/tulis`);

    const body = await page.locator('body').innerText().toLowerCase();

    // Should NOT contain indicators of fake capabilities
    const fakeIndicators = [
      /generating|ai suggestion|candidate generated/,
      /accepted prose|manuscript here|writing exists/,
      /validation complete|findings resolved|clean report/,
    ];

    for (const pattern of fakeIndicators) {
      expect(body).not.toMatch(pattern);
    }
  });
});

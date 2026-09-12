import { randomUUID } from 'node:crypto';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { clearMailpit, waitForMailLink } from '../mailpit';
import { isolateE2eClientIp } from './test-client';

const mailpitApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8025';
const verifySubject = 'Verifikasi email Narraza-mu';
const password = 'Narraza!Foundation123';

export async function createVerifiedSession(
  page: Page,
  testInfo: TestInfo,
): Promise<{ email: string }> {
  const email = `foundation-${testInfo.project.name}-${randomUUID()}@example.test`;
  await isolateE2eClientIp(page);
  await clearMailpit(mailpitApiUrl);
  await page.goto('/daftar');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByLabel('Ulangi kata sandi').fill(password);
  await page.getByRole('button', { name: 'Buat akun' }).click();

  // Explicitly wait/verify registration confirmation text before proceeding
  await expect(page.getByText(/kami sudah mengirim tautan verifikasi/i)).toBeVisible({
    timeout: 15_000,
  });

  const link = await waitForMailLink({
    apiBaseUrl: mailpitApiUrl,
    recipient: email,
    subject: verifySubject,
  });
  await page.goto(link);

  // Assert verification completion URL
  await expect(page).toHaveURL(/\/verifikasi\/selesaikan$/);

  // Assert heading visible on verification page
  await expect(page.getByRole('heading', { name: 'Verifikasi email' })).toBeVisible();

  // Assert button is visible before clicking
  await expect(page.getByRole('button', { name: 'Verifikasi & masuk' })).toBeVisible();

  await page.getByRole('button', { name: 'Verifikasi & masuk' }).click();

  // Assert final /app URL
  await expect(page).toHaveURL(/\/app$/);

  // Assert authenticated UI landmark is visible
  await expect(page.getByTestId('global-shell')).toBeVisible();

  return { email };
}

export async function createOwnedProject(
  page: Page,
  title = 'Proyek Demo Frontend',
): Promise<{ projectId: string; title: string }> {
  await page.goto('/app/proyek/baru');
  await page.locator('input[name="path-selection"][value="rough_idea"]').check();
  await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole('button', { name: 'Buat proyek', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/proyek\/(?!baru(?:\/|$))[^/?#]+$/, { timeout: 45_000 });

  const match = page.url().match(/\/app\/proyek\/([^/?#]+)/);
  if (!match) throw new Error(`project id missing from URL: ${page.url()}`);
  return { projectId: match[1]!, title };
}

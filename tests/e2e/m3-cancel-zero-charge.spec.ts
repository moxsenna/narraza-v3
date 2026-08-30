/**
 * W3.5 cancel + zero-charge failure + action tampering E2E. Cancellation and
 * failure run through the REAL M3 semantics: queued cancel releases the
 * reservation immediately, a failed running job reconciles a full release,
 * and every outcome renders only with server evidence.
 */
import { expect, test } from '@playwright/test';
import {
  createM3JobDriver,
  countProjectJobs,
  seedM3ChapterForCurrentUser,
} from './support/m3-fixture';

const MICRO_IDR_PER_CREDIT = 10_000_000n;

test.describe.configure({ timeout: 180_000 });

test('queued cancel releases held credits with zero charge', async ({ page }, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'cancel-queued',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });

  await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
  await page.getByRole('button', { name: 'Buat adegan' }).click();
  await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
  const panel = page.getByTestId('job-phase-panel');
  await expect(panel).toContainText('Menunggu diproses');

  await page.getByRole('button', { name: 'Batalkan proses' }).click();
  const dialog = page.getByRole('dialog', { name: 'Batalkan proses ini?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Ya, batalkan' }).click();

  await expect(panel).toContainText('Proses dibatalkan', { timeout: 20_000 });
  await expect(panel).toContainText('Kreditmu tidak dipotong');
  await expect(page.getByTestId('header-credit-chip')).toContainText('100');

  await page.goto('/app/kredit');
  await expect(page.getByTestId('credit-held')).toContainText('0');
  await expect(page.getByTestId('credit-available')).toContainText('100');
});

test('failed job without usable output charges zero and stays recoverable-free', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'fail-zero-charge',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);

  try {
    await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    const panel = page.getByTestId('job-phase-panel');
    await expect(panel).toContainText('Menunggu diproses');

    expect(await driver.claimOnce()).toBe(true);
    await expect(panel).toContainText('Sedang diproses', { timeout: 20_000 });

    // REAL terminal failure path: transition + full reservation release.
    expect(await driver.failRunningJob()).toBe('terminalized');

    await expect(panel).toContainText('Proses gagal', { timeout: 20_000 });
    await expect(panel).toContainText('Kreditmu tidak dipotong');
    await expect(page.getByTestId('header-credit-chip')).toContainText('100');

    await page.goto('/app/kredit');
    await expect(page.getByTestId('credit-held')).toContainText('0');
    await expect(page.getByTestId('credit-available')).toContainText('100');
  } finally {
    await driver.disconnect();
  }
});

test('tamperring with the confirm form project fails closed without side effects', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'confirm-tamper',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });

  await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
  await page.getByRole('button', { name: 'Buat adegan' }).click();
  await expect(page.getByTestId('credit-quote-card')).toBeVisible();

  // Point the hidden projectId at a random foreign project before confirming.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('form input[name="projectId"]');
    if (input) input.value = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  });
  await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();

  await expect(page.getByText('Halaman tidak ditemukan.')).toBeVisible({ timeout: 20_000 });
  expect(await countProjectJobs(fixture.projectId)).toBe(0);
});

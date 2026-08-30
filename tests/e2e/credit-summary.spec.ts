/**
 * W3.5 credit-summary E2E: the header chip and /app/kredit read the same
 * CreditSummaryView snapshot semantics (D6), held credits appear while a job
 * is reserved, and the low-balance state renders from real balances only.
 */
import { expect, test } from '@playwright/test';
import { createM3JobDriver, seedM3ChapterForCurrentUser } from './support/m3-fixture';

const MICRO_IDR_PER_CREDIT = 10_000_000n;

test.describe.configure({ timeout: 180_000 });

test('header chip and credit page show the same server snapshot', async ({ page }, testInfo) => {
  // 123 credits plus a fractional remainder that must floor away.
  await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'credit-summary',
    grantMicroIdr: 123n * MICRO_IDR_PER_CREDIT + 7_000_000n,
  });

  await page.goto('/app');
  await expect(page.getByTestId('header-credit-chip')).toContainText('123');

  await page.goto('/app/kredit');
  await expect(page.getByTestId('credit-available')).toContainText('123');
  await expect(page.getByTestId('credit-held')).toContainText('0');
  await expect(page.getByTestId('credit-reconciling')).toContainText('0');
  await expect(page.getByTestId('credit-low-balance')).toHaveCount(0);
  await expect(page.getByTestId('credit-held-context')).toHaveCount(0);
});

test('held credits appear while a job is reserved and release after completion', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'credit-held',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);

  try {
    await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    await expect(page.getByTestId('credit-quote-card')).toBeVisible();
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    await expect(page.getByTestId('job-phase-panel')).toContainText('Menunggu diproses');

    // Reservation open: the 35-credit hold is subtracted from available in the
    // single CreditSummaryView snapshot, so the page and the header chip agree.
    await page.goto('/app/kredit');
    await expect(page.getByTestId('credit-available')).toContainText('65');
    await expect(page.getByTestId('credit-held')).toContainText('35');
    await expect(page.getByTestId('credit-held-context')).toBeVisible();
    await page.goto('/app');
    await expect(page.getByTestId('header-credit-chip')).toContainText('65');

    // Release through the real fenced publish path (no usable output).
    expect(await driver.claimOnce()).toBe(true);
    expect(await driver.completeWithFencedPublish()).toBe('published');

    await page.goto('/app/kredit');
    await expect(page.getByTestId('credit-held')).toContainText('0');
    await expect(page.getByTestId('credit-available')).toContainText('100');
    await page.goto('/app');
    await expect(page.getByTestId('header-credit-chip')).toContainText('100');
  } finally {
    await driver.disconnect();
  }
});

test('low balance blocks confirmation and renders the low-balance state', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'credit-low',
    grantMicroIdr: 5n * MICRO_IDR_PER_CREDIT,
  });

  await page.goto('/app');
  await expect(page.getByTestId('header-credit-chip')).toContainText('5');

  await page.goto('/app/kredit');
  await expect(page.getByTestId('credit-low-balance')).toBeVisible();

  await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
  await page.getByRole('button', { name: 'Buat adegan' }).click();
  const card = page.getByTestId('credit-quote-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Saldo kreditmu belum cukup untuk proses ini.');
  await expect(page.getByRole('button', { name: 'Konfirmasi & mulai' })).toBeDisabled();
});

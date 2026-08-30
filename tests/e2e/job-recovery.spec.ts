/**
 * W3.5 job-recovery E2E: mock job end-to-end from the UI through REAL M3
 * server behavior (quote → confirm → queued/running → fenced publish with the
 * real usable-output classifier → zero-charge release), including refresh
 * recovery and the already-active job path with no duplicate job.
 */
import { expect, test } from '@playwright/test';
import {
  createM3JobDriver,
  seedM3ChapterForCurrentUser,
  countProjectJobs,
} from './support/m3-fixture';

const MICRO_IDR_PER_CREDIT = 10_000_000n;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

test.describe.configure({ timeout: 180_000 });

test('mock job runs end-to-end from the UI and recovers after refresh', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'job-recovery',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);

  try {
    await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);

    // Quote phase: the generic card shows the server-derived cost.
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    const card = page.getByTestId('credit-quote-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('35');
    await expect(card).toContainText('Saldo tersedia');
    await expect(card).toContainText('100');

    const quotedBody = (await page.locator('body').innerText()).toLowerCase();
    expect(quotedBody).not.toContain('workflowplanhash');
    expect(quotedBody).not.toContain('dependencyhash');
    expect(quotedBody).not.toMatch(uuidPattern);

    // Confirmation starts the real GenerationJob.
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    const panel = page.getByTestId('job-phase-panel');
    await expect(panel).toContainText('Menunggu diproses');

    // REAL M3 lifecycle: claim under lease with a held mock processor.
    expect(await driver.claimOnce()).toBe(true);
    await expect(panel).toContainText('Sedang diproses', { timeout: 20_000 });

    // Exactly one job exists for the project (no duplicate).
    expect(await countProjectJobs(fixture.projectId)).toBe(1);

    // Refresh: the server resolves the active job and rebuilds the panel.
    await page.reload();
    const recovered = page.getByTestId('job-phase-panel');
    await expect(recovered).toContainText('Ada proses yang masih berjalan untuk adegan ini');
    await expect(recovered).toContainText('Sedang diproses');
    expect(await countProjectJobs(fixture.projectId)).toBe(1);

    // Held credits appear from the same CreditSummaryView source. D6 defines
    // available = book - held - reconciling, so an open 35-credit hold against
    // a 100-credit book leaves 65 spendable while the job is still running.
    await page.goto('/app/kredit');
    await expect(page.getByTestId('credit-held')).toContainText('35');
    await expect(page.getByTestId('credit-available')).toContainText('65');

    // Return to the chapter so the live polling panel is mounted again, then
    // complete through the real fenced publish; no usable output exists, so
    // the classifier releases the full reservation (zero charge).
    await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
    const live = page.getByTestId('job-phase-panel');
    await expect(live).toContainText('Ada proses yang masih berjalan untuk adegan ini');
    expect(await driver.completeWithFencedPublish()).toBe('published');

    // The live panel resolves the terminal phase through polling and states
    // the truthful zero-charge outcome before refreshing server data.
    await expect(live).toContainText('Proses selesai', { timeout: 20_000 });
    await expect(live).toContainText('Kreditmu tidak dipotong');
    await expect(page.getByTestId('header-credit-chip')).toContainText('100');
    await expect(live).not.toContainText('Menunggu diproses');

    // A fresh load still shows the truthful terminal outcome (immutable job)
    // and keeps the start flow available for the next run.
    await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
    const finalPanel = page.getByTestId('job-phase-panel');
    await expect(finalPanel).toContainText('Proses selesai');
    await expect(finalPanel).toContainText('Kreditmu tidak dipotong');
    await expect(page.getByTestId('scene-generation-start')).toBeVisible();
    await expect(page.getByTestId('header-credit-chip')).toContainText('100');
  } finally {
    await driver.disconnect();
  }
});

test('confirm replay after job start never creates a duplicate job', async ({ page }, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'job-replay',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);

  try {
    await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    await expect(page.getByTestId('job-phase-panel')).toContainText('Menunggu diproses');
    expect(await countProjectJobs(fixture.projectId)).toBe(1);

    // While the job is active the page only offers the running panel: the
    // server-derived already-active path replaces the start flow entirely.
    await page.reload();
    await expect(page.getByTestId('job-phase-panel')).toContainText(
      'Ada proses yang masih berjalan untuk adegan ini',
    );
    await expect(page.getByRole('button', { name: 'Buat adegan' })).toHaveCount(0);
    expect(await countProjectJobs(fixture.projectId)).toBe(1);
  } finally {
    await driver.disconnect();
  }
});

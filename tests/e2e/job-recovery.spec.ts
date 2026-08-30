/**
 * W3.5 job-recovery E2E: the M3 mock vertical runs through the fail-closed
 * generation harness (preview tree) with the SAME production W3.5 components
 * and REAL M3 server behavior (quote → confirm → queued/running → fenced
 * publish with the real usable-output classifier → zero-charge release).
 *
 * Covered here: refresh recovery, the already-active job path, REAL
 * confirmation exact replay (confirm invoked twice), chapter-scoped terminal
 * recovery, and production truthfulness (the product chapter workspace never
 * offers the not-yet-existing generation capability).
 */
import { expect, test } from '@playwright/test';
import {
  createM3JobDriver,
  seedM3ChapterForCurrentUser,
  seedSecondChapterInProject,
  countProjectJobs,
  countProjectReservations,
} from './support/m3-fixture';

const MICRO_IDR_PER_CREDIT = 10_000_000n;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const harnessUrl = (projectId: string, chapterId: string) =>
  `/app/__preview/m3-generation/${projectId}/${chapterId}`;

test.describe.configure({ timeout: 180_000 });

test('production chapter workspace keeps generation fail-closed', async ({ page }, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'gen-truthful',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });

  // The product route presents the honest unavailable state: no quote, no
  // reservation, no job can be created from the placeholder plan path.
  await page.goto(`/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`);
  await expect(page.getByTestId('scene-generation-unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buat adegan' })).toHaveCount(0);
  await expect(page.getByTestId('scene-generation-start')).toHaveCount(0);
  expect(await countProjectJobs(fixture.projectId)).toBe(0);

  // The same W3.5 mechanics live behind the fail-closed harness surface.
  await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));
  await expect(page.getByTestId('scene-generation-start')).toBeVisible();
});

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
    await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));

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

    // Return to the harness so the live polling panel is mounted again, then
    // complete through the real fenced publish; no usable output exists, so
    // the classifier releases the full reservation (zero charge).
    await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));
    const live = page.getByTestId('job-phase-panel');
    await expect(live).toContainText('Ada proses yang masih berjalan untuk adegan ini');
    expect(await driver.completeWithFencedPublish()).toBe('published');

    // The live panel resolves the terminal phase through polling and states
    // the truthful zero-charge outcome before refreshing server data. The
    // harness page stands outside the app shell, so the credit chip is read
    // on the real production dashboard.
    await expect(live).toContainText('Proses selesai', { timeout: 20_000 });
    await expect(live).toContainText('Kreditmu tidak dipotong');
    await expect(live).not.toContainText('Menunggu diproses');
    await page.goto('/app');
    await expect(page.getByTestId('header-credit-chip')).toContainText('100');

    // A fresh load still shows the truthful terminal outcome (immutable job)
    // and keeps the start flow available for the next run.
    await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));
    const finalPanel = page.getByTestId('job-phase-panel');
    await expect(finalPanel).toContainText('Proses selesai');
    await expect(finalPanel).toContainText('Kreditmu tidak dipotong');
    await expect(page.getByTestId('scene-generation-start')).toBeVisible();
  } finally {
    await driver.disconnect();
  }
});

test('already-active job path replaces the start flow and never duplicates the job', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'job-already-active',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);

  try {
    await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));
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

test('confirming the same quote twice is an exact replay with exactly one job', async ({
  page,
}, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'confirm-replay',
    grantMicroIdr: 100n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);

  try {
    await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    await expect(page.getByTestId('credit-quote-card')).toBeVisible();

    // REAL double confirmation: the same confirm form is submitted twice, so
    // the server receives the same quote with the same derived confirmation
    // identity twice. Task 6 replay must converge instead of conflicting.
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('form');
      if (!form) throw new Error('confirm form not found');
      form.requestSubmit();
      form.requestSubmit();
    });

    const panel = page.getByTestId('job-phase-panel');
    await expect(panel).toContainText('Menunggu diproses', { timeout: 30_000 });
    await expect(page.getByTestId('scene-generation-start')).toHaveCount(0);

    // One reservation, one job: the replay produced no second durable effect.
    expect(await countProjectJobs(fixture.projectId)).toBe(1);
    expect(await countProjectReservations(fixture.projectId)).toBe(1);

    // The replayed confirm must not surface an error/conflict to the user.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Konfirmasi tidak dapat diproses');

    // The single job continues through the real lifecycle.
    expect(await driver.claimOnce()).toBe(true);
    await expect(panel).toContainText('Sedang diproses', { timeout: 20_000 });
  } finally {
    await driver.disconnect();
  }
});

test('terminal outcome recovery is scoped per chapter', async ({ page }, testInfo) => {
  const fixture = await seedM3ChapterForCurrentUser({
    page,
    testInfo,
    label: 'terminal-multi-chapter',
    grantMicroIdr: 200n * MICRO_IDR_PER_CREDIT,
  });
  const driver = await createM3JobDriver(fixture.projectId);
  const chapterB = await seedSecondChapterInProject(fixture, 'Bab 2 - Kontras');

  const runZeroChargeJob = async (chapterId: string) => {
    await page.goto(harnessUrl(fixture.projectId, chapterId));
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    await expect(page.getByTestId('job-phase-panel')).toContainText('Menunggu diproses');
    expect(await driver.claimOnce()).toBe(true);
    expect(await driver.completeWithFencedPublish()).toBe('published');
    await expect(page.getByTestId('job-phase-panel')).toContainText('Proses selesai', {
      timeout: 20_000,
    });
  };

  try {
    // Chapter A finishes first; chapter B finishes later (newer terminal).
    await runZeroChargeJob(fixture.chapterId);
    await runZeroChargeJob(chapterB);

    // A refresh of the OLDER chapter A still shows A's truthful outcome —
    // the newer chapter B terminal job must not hide it.
    await page.goto(harnessUrl(fixture.projectId, fixture.chapterId));
    const panelA = page.getByTestId('job-phase-panel');
    await expect(panelA).toContainText('Proses selesai');
    await expect(panelA).toContainText('Kreditmu tidak dipotong');
    await expect(page.getByTestId('scene-generation-start')).toBeVisible();

    await page.goto(harnessUrl(fixture.projectId, chapterB));
    const panelB = page.getByTestId('job-phase-panel');
    await expect(panelB).toContainText('Proses selesai');
    await expect(page.getByTestId('scene-generation-start')).toBeVisible();

    expect(await countProjectJobs(fixture.projectId)).toBe(2);
  } finally {
    await driver.disconnect();
  }
});

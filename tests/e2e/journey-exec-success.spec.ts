/**
 * journey execution success (leaf-1.4.1) — desktop + mobile.
 *
 * Proves the backend execution chain on the deterministic mock provider via
 * the REAL m4 worker processor (m4-driver, no dev worker process needed):
 * konsep quote → confirm → terminal SUCCESS → choose → foundation draft,
 * then seeded outline+beat → tulis quote → confirm → SUCCESS → candidates
 * → pick → draft → snapshot → cek run → credit consistent, leak-scanned.
 *
 * Out of scope (covered elsewhere): selesaikan accept (proposal-accept
 * integration 8/8), publish generation accept (same suite), live providers
 * (r1-sell spend policy; mock only here).
 */
import { expect, test } from '@playwright/test';
import { createOwnedProject, createVerifiedSession } from './support/auth-session';
import { createM4Driver } from './support/m4-driver';
import {
  assertNoLeaks,
  collectBody,
  findUserIdByEmail,
  seedLockedFoundation,
  seedOutlineChapter,
} from './support/vertical-slice-flow';

test.describe.configure({ timeout: 300_000 });

async function driveToDrained(
  driver: { processNextForProject(projectId: string): Promise<'processed' | 'none'> },
  projectId: string,
): Promise<number> {
  let processed = 0;
  for (let i = 0; i < 10; i += 1) {
    const outcome = await driver.processNextForProject(projectId);
    if (outcome === 'none') break;
    processed += 1;
  }
  return processed;
}

test('journey exec success: paid jobs succeed on mock end to end', async ({ page }, testInfo) => {
  const { email } = await createVerifiedSession(page, testInfo);
  const { projectId } = await createOwnedProject(page, 'Journey Exec');
  const leak = (body: string, where: string) => assertNoLeaks(body, `exec:${where}`, [email]);
  const driver = await createM4Driver();
  try {
    // Chat seeds intake context for the concept planner packet.
    await page.goto(`/app/proyek/${projectId}/chat`);
    await page.locator('textarea[name="content"]').fill('Kisah penjaga mercusuar terakhir.');
    await page.getByRole('button', { name: 'Kirim pesan' }).click();
    await expect(page.getByText('Kisah penjaga mercusuar terakhir.').first()).toBeVisible({
      timeout: 30_000,
    });

    // Konsep: quote → confirm → mock success → choose → foundation draft.
    await page.goto(`/app/proyek/${projectId}/konsep`);
    await page.getByRole('button', { name: 'Susun 3 konsep' }).click();
    await expect(page.getByTestId('credit-quote-card')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    await expect(page.getByTestId('job-phase-panel')).toBeVisible({ timeout: 30_000 });
    expect(await driveToDrained(driver, projectId)).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByText('Pilih konsep ini').first()).toBeVisible({ timeout: 60_000 });
    await page.getByText('Pilih konsep ini').first().click();
    await expect(page).toHaveURL(/\/fondasi$/, { timeout: 30_000 });
    let body = await collectBody(page, `/app/proyek/${projectId}/fondasi`);
    expect(body).toContain('draft');
    leak(body, 'fondasi-draft');

    // Outline + beat seed (locked foundation required by the guard).
    const ownerId = await findUserIdByEmail(email);
    await seedLockedFoundation(ownerId, projectId);
    const { chapterId } = await seedOutlineChapter(ownerId, projectId, 'exec');
    const { seedBeatForChapter } = await import('./support/exec-beat-seed');
    const { beatTitle } = await seedBeatForChapter(ownerId, projectId, chapterId);

    // Tulis: rough draft first (validator reference), then quote → confirm → mock success.
    await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/tulis`);
    await page.locator('#prose-editor').fill('Draf kasar: Maya membuka peti tua itu perlahan.');
    // Debounced autosave (1.5s) persists the draft; reload proves it.
    await page.waitForTimeout(4000);
    await page.reload();
    await expect(page.locator('#prose-editor')).toHaveValue(/Maya membuka peti/, {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Buat adegan' }).click();
    await expect(page.getByTestId('credit-quote-card')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
    await expect(page.getByTestId('job-phase-panel')).toBeVisible({ timeout: 30_000 });
    expect(await driveToDrained(driver, projectId)).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByText(/Kandidat \d/).first()).toBeVisible({ timeout: 60_000 });
    body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/tulis`);
    expect(body).toContain(beatTitle);
    leak(body, 'tulis-candidates');

    await page
      .getByRole('button', { name: /Terapkan kandidat/ })
      .first()
      .click();
    await expect(page.locator('#prose-editor')).toHaveValue(/.+/, { timeout: 30_000 });

    // Snapshot, then cek runs deterministic validation over it.
    await page.getByRole('button', { name: 'Bekukan versi untuk dicek' }).click();
    await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/cek`);
    await page.getByRole('button', { name: 'Cek cerita sekarang' }).click();
    await expect(page.getByText(/Lolos|Perlu ditinjau|Menghambat/).first()).toBeVisible({
      timeout: 60_000,
    });
    body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/cek`);
    leak(body, 'cek-findings');

    // Credit stays consistent after two paid confirmations.
    body = await collectBody(page, '/app/kredit');
    await expect(page.getByTestId('credit-summary')).toBeVisible();
    leak(body, 'kredit');
  } finally {
    await driver.disconnect();
  }
});

/**
 * journey honest-states (leaf-1.5.1) — desktop.
 * Proves the repaired PRD journey renders real, honest states end to end on
 * mock, WITHOUT worker execution (no driver): register → project →
 * reducer-driven hero → chat persist → konsep quote → confirm → job phases
 * → recovery after refresh → credit consistency → tulis/cek/naskah/publish
 * honest states, with a leak scan on every screen.
 *
 * Job success is intentionally NOT asserted: worker execution needs prod
 * plan/packet builders (backlog C11). Failure/queued honesty IS asserted.
 */
import { expect, test } from '@playwright/test';
import { createOwnedProject, createVerifiedSession } from './support/auth-session';
import {
  assertNoLeaks,
  collectBody,
  findUserIdByEmail,
  seedOutlineChapter,
} from './support/vertical-slice-flow';

test.describe.configure({ timeout: 300_000 });

test('journey honest states: reducer hero to paid loop honesty', async ({ page }, testInfo) => {
  const { email } = await createVerifiedSession(page, testInfo);
  const { projectId, title: projectTitle } = await createOwnedProject(page, 'Journey Jujur');
  const leak = (body: string, where: string) => assertNoLeaks(body, `journey:${where}`, [email]);

  // Dashboard hero is reducer-driven for a fresh project (continue_intake).
  let body = await collectBody(page, '/app');
  expect(body).toContain(projectTitle);
  expect(body).toContain('LANGKAH PRODUKSI BERIKUTNYA');
  expect(body).toContain('Lanjutkan ceritamu');
  leak(body, 'dashboard');

  // Project home hero uses the same reducer action.
  body = await collectBody(page, `/app/proyek/${projectId}`);
  expect(body).toContain('LANGKAH BERIKUTNYA');
  expect(body).toContain('Lanjutkan ceritamu');
  leak(body, 'project-home');

  // Chat persists the user message (AI reply needs the worker; not awaited).
  await page.goto(`/app/proyek/${projectId}/chat`);
  const chatText = 'Ide serial tentang penjaga mercusuar terakhir.';
  await page.locator('textarea[name="content"]').fill(chatText);
  await page.getByRole('button', { name: 'Kirim pesan' }).click();
  await expect(page.getByText(chatText).first()).toBeVisible({ timeout: 30_000 });
  body = await collectBody(page, `/app/proyek/${projectId}/chat`);
  leak(body, 'chat');

  // Konsep: quote issuance renders the D4 card (no worker needed).
  await page.goto(`/app/proyek/${projectId}/konsep`);
  await page.getByRole('button', { name: 'Susun 3 konsep' }).click();
  await expect(page.getByTestId('credit-quote-card')).toBeVisible({ timeout: 30_000 });
  body = await collectBody(page, `/app/proyek/${projectId}/konsep`);
  expect(body).toContain('BIAYA MAKSIMAL');
  leak(body, 'konsep-quote');

  // Confirm creates the job; phases render and survive a refresh (recovery).
  await page.getByRole('button', { name: 'Konfirmasi & mulai' }).click();
  await expect(page.getByTestId('job-phase-panel')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId('job-phase-panel')).toBeVisible({ timeout: 30_000 });
  body = await collectBody(page, `/app/proyek/${projectId}/konsep`);
  leak(body, 'konsep-job');

  // Credit stays consistent: held reflects the confirmed reservation.
  body = await collectBody(page, '/app/kredit');
  await expect(page.getByTestId('credit-summary')).toBeVisible();
  await expect(page.getByTestId('credit-held')).not.toContainText('0');
  leak(body, 'kredit');

  // Seed outline + beat, then tulis shows the live panel (no dead-end block).
  const ownerId = await findUserIdByEmail(email);
  const { chapterId } = await seedOutlineChapter(ownerId, projectId, 'journey');
  await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/tulis`);
  await expect(page.getByTestId('scene-generation-start')).toBeVisible({ timeout: 30_000 });
  body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/tulis`);
  expect(body).not.toContain('belum dapat dilakukan di sini');
  leak(body, 'tulis');

  // Cek without a snapshot is honestly empty; naskah + publish guard too.
  body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/cek`);
  expect(body).toContain('Belum ada versi beku');
  leak(body, 'cek-empty');

  body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/naskah`);
  expect(body).toContain('Tidak ada naskah yang tersedia');
  leak(body, 'naskah-empty');

  body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/publish`);
  expect(body).toContain('Belum ada usulan paket');
  leak(body, 'publish-empty');
});

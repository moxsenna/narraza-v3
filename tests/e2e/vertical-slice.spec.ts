/**
 * verification-matrix: vertical-slice (S10) — desktop.
 * Register → project → chat persist → foundation lock → outline →
 * chapter honest states → credit page, with a leak scan on every screen.
 */
import { expect, test } from '@playwright/test';
import { assertNoLeaks, collectBody, runSliceUpToChapter } from './support/vertical-slice-flow';

test.describe.configure({ timeout: 300_000 });

test('vertical slice desktop: register to publish-shell with honest states', async ({
  page,
}, testInfo) => {
  const { projectId, chapterId, projectTitle, chapterTitle, email } = await runSliceUpToChapter(
    page,
    testInfo,
    'desktop',
  );
  const leak = (body: string, where: string) => assertNoLeaks(body, `desktop:${where}`, [email]);

  let body = await collectBody(page, '/app');
  expect(body).toContain(projectTitle);
  leak(body, 'dashboard');

  body = await collectBody(page, `/app/proyek/${projectId}/fondasi`);
  expect(body).toContain('Fondasi sudah dikunci.');
  expect(body).toMatch(/\d+%/);
  leak(body, 'fondasi');

  body = await collectBody(page, `/app/proyek/${projectId}/outline`);
  expect(body).toContain('Rencana Bab');
  expect(body).toContain(chapterTitle);
  leak(body, 'outline');

  const chapterRoutes = [
    ['tulis', 'Penulisan dari halaman ini belum tersedia'],
    ['cek', 'Pemeriksaan otomatis untuk bab ini belum tersedia'],
    ['selesaikan', 'Belum ada usulan yang menunggu keputusan.'],
    ['naskah', 'Tidak ada naskah yang tersedia'],
    ['publish', 'Paket terbit belum tersedia'],
  ] as const;
  for (const [suffix, honestText] of chapterRoutes) {
    const url = `/app/proyek/${projectId}/bab/${chapterId}/${suffix}`;
    const text = await collectBody(page, url);
    expect(text, suffix).toContain(projectTitle);
    expect(text, suffix).toContain(chapterTitle);
    expect(text, suffix).toContain(honestText);
    leak(text, `bab/${suffix}`);
  }

  body = await collectBody(page, '/app/kredit');
  await expect(page.getByTestId('credit-summary')).toBeVisible();
  for (const card of ['credit-available', 'credit-held', 'credit-reconciling']) {
    await expect(page.getByTestId(card)).toContainText(/\d+/);
  }
  leak(body, 'kredit');
});

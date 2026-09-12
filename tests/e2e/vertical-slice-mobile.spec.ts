/**
 * verification-matrix: vertical-slice-mobile (D20) — 375px.
 * Core path on a phone viewport plus mobile-nav presence and tap targets.
 */
import { expect, test } from '@playwright/test';
import { assertNoLeaks, collectBody, runSliceUpToChapter } from './support/vertical-slice-flow';

test.describe.configure({ timeout: 300_000 });
test.use({ viewport: { width: 375, height: 812 } });

test('vertical slice mobile: core path with bottom nav', async ({ page }, testInfo) => {
  const { projectId, chapterId, projectTitle, chapterTitle, email } = await runSliceUpToChapter(
    page,
    testInfo,
    'mobile',
  );
  const leak = (body: string, where: string) => assertNoLeaks(body, `mobile:${where}`, [email]);

  let body = await collectBody(page, '/app');
  expect(body).toContain(projectTitle);
  leak(body, 'dashboard');

  const nav = page.getByRole('navigation', { name: 'Navigasi aplikasi mobile' });
  await expect(nav).toBeVisible();
  for (const tab of ['Beranda', 'Rencana', 'Tulis', 'Cek']) {
    await expect(nav.getByText(tab, { exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('button', { name: 'Lainnya' })).toBeVisible();
  const homeLink = nav.getByRole('link', { name: /Beranda/ });
  await expect(homeLink).toBeVisible();
  const homeBox = await homeLink.boundingBox();
  expect(homeBox, 'Beranda tap target exists').not.toBeNull();
  expect(homeBox!.height).toBeGreaterThanOrEqual(44);

  body = await collectBody(page, `/app/proyek/${projectId}/fondasi`);
  expect(body).toContain('Fondasi sudah dikunci.');
  leak(body, 'fondasi');

  body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/tulis`);
  expect(body).toContain(chapterTitle);
  expect(body).toContain('Penulisan dari halaman ini belum tersedia');
  leak(body, 'bab/tulis');

  body = await collectBody(page, `/app/proyek/${projectId}/bab/${chapterId}/publish`);
  expect(body).toContain('Paket terbit belum tersedia');
  leak(body, 'bab/publish');

  body = await collectBody(page, '/app/kredit');
  await expect(page.getByTestId('credit-summary')).toBeVisible();
  await expect(page.getByTestId('credit-available')).toContainText(/\d+/);
  leak(body, 'kredit');
});

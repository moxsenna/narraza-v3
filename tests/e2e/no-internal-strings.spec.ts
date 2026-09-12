/**
 * verification-matrix: no-internal-strings (S9) — DOM scan.
 * No internal identifiers, stage names, or model IDs may render as text,
 * on public pages or deep inside the authenticated flow.
 */
import { expect, test } from '@playwright/test';
import { assertNoLeaks, collectBody, runSliceUpToChapter } from './support/vertical-slice-flow';

test.describe.configure({ timeout: 300_000 });

test('no internal leak strings in DOM', async ({ page }, testInfo) => {
  for (const url of ['/', '/masuk', '/daftar', '/privasi', '/ketentuan']) {
    const body = await collectBody(page, url);
    assertNoLeaks(body, `public:${url}`);
  }

  const { projectId, chapterId, email } = await runSliceUpToChapter(page, testInfo, 'leak');
  const authed = [
    '/app',
    `/app/proyek/${projectId}`,
    `/app/proyek/${projectId}/chat`,
    `/app/proyek/${projectId}/fondasi`,
    `/app/proyek/${projectId}/outline`,
    `/app/proyek/${projectId}/karakter`,
    `/app/proyek/${projectId}/fakta`,
    `/app/proyek/${projectId}/rahasia`,
    `/app/proyek/${projectId}/bab/${chapterId}/cek`,
    `/app/proyek/${projectId}/bab/${chapterId}/selesaikan`,
    '/app/kredit',
    '/app/pengaturan',
  ];
  for (const url of authed) {
    const body = await collectBody(page, url);
    assertNoLeaks(body, `authed:${url}`, [email]);
  }

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/app/proyek/${projectId}/chat`);
  await page.waitForTimeout(2_000);
  expect(errors, 'client runtime errors').toEqual([]);
});

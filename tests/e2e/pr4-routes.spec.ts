/**
 * PR4 Chapter Workspace E2E Coverage
 *
 * Uses application-layer fixture helper matching foundation-preservation pattern
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readPr4SideEffectSnapshot, seedPr4ChapterForCurrentUser } from './support/pr4-fixture';

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
] as const;

const routeExpectations = [
  {
    suffix: 'tulis',
    unavailableText: 'Penulisan dari halaman ini belum tersedia',
  },
  {
    suffix: 'cek',
    unavailableText: 'Pemeriksaan otomatis untuk bab ini belum tersedia',
  },
  {
    suffix: 'selesaikan',
    unavailableText: 'Status penyelesaian bab belum dapat ditentukan saat ini',
  },
  {
    suffix: 'naskah',
    unavailableText: 'Tidak ada naskah yang tersedia',
  },
  {
    suffix: 'publish',
    unavailableText: 'Paket terbit belum tersedia',
  },
] as const;

const disabledControls = {
  tulis: ['Lihat bahan', 'Minta perkiraan biaya', 'Bandingkan hasil'],
  cek: ['Cek cerita sekarang', 'Minta perkiraan biaya'],
  selesaikan: ['Terapkan & jadikan resmi', 'Buka langkah berikutnya'],
  naskah: [],
  publish: ['Salin', 'Salin semua', 'Ekspor paket', 'Buat Paket Publish'],
} as const;

async function activateNativeDisabledControl(locator: Locator): Promise<void> {
  await expect(locator).toBeDisabled();
  await locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('control must be an HTMLElement');
    element.click();
  });
  await expect(locator).toBeDisabled();
}

async function collectMutationRequests(page: Page, action: () => Promise<void>): Promise<string[]> {
  const requests: string[] = [];
  const listener = (request: { method(): string; url(): string }) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      requests.push(`${request.method()} ${request.url()}`);
    }
  };

  page.on('request', listener);
  try {
    await action();
    await page.waitForTimeout(100);
  } finally {
    page.off('request', listener);
  }
  return requests;
}

test('five chapter routes resolve with valid owner context', async ({ page }, testInfo) => {
  const { projectId, chapterId, projectTitle, chapterTitle } = await seedPr4ChapterForCurrentUser({
    page,
    testInfo,
    label: 'owner-routes',
  });

  for (const routeExpectation of routeExpectations) {
    await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/${routeExpectation.suffix}`);

    // Route should not be 404
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).not.toContain('tidak ditemukan');

    // Project and chapter context must actually be rendered
    expect(body).toContain(projectTitle);
    expect(body).toContain(chapterTitle);

    // Route-specific honest state must be visible
    expect(body).toContain(routeExpectation.unavailableText);

    // No raw UUIDs exposed in body
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    expect(body).not.toMatch(uuidPattern);

    // No internal jargon
    const forbiddenTerms = ['m4', 'backend', 'resolver', 'disabled', 'realdata'];
    for (const term of forbiddenTerms) {
      expect(body.toLowerCase()).not.toContain(term);
    }
  }
});

test('disabled presentation controls cause no network or database side effects', async ({
  page,
}, testInfo) => {
  const fixture = await seedPr4ChapterForCurrentUser({
    page,
    testInfo,
    label: 'disabled-side-effects',
  });
  const before = await readPr4SideEffectSnapshot(fixture);

  const mutationRequests = await collectMutationRequests(page, async () => {
    for (const routeExpectation of routeExpectations) {
      await page.goto(
        `/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/${routeExpectation.suffix}`,
      );

      if (routeExpectation.suffix === 'tulis') {
        await activateNativeDisabledControl(page.locator('textarea[name="prose"]'));
      }

      for (const name of disabledControls[routeExpectation.suffix]) {
        const matches = page.getByRole('button', { name, exact: true });
        const count = await matches.count();
        expect(count).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          await activateNativeDisabledControl(matches.nth(index));
        }
      }

      if (routeExpectation.suffix === 'naskah') {
        for (const name of ['Bab sebelumnya', 'Bab berikutnya']) {
          const unavailableNavigation = page.getByText(name, { exact: true });
          await expect(unavailableNavigation).toHaveAttribute('aria-disabled', 'true');
          await expect(unavailableNavigation).not.toHaveAttribute('href');
        }
      }
    }
  });

  expect(mutationRequests).toEqual([]);
  await expect.poll(() => readPr4SideEffectSnapshot(fixture)).toEqual(before);
});

test('no raw IDs or technical jargon visible in chapter routes', async ({ page }, testInfo) => {
  const { projectId, chapterId } = await seedPr4ChapterForCurrentUser({
    page,
    testInfo,
    label: 'no-id-check',
  });

  await page.goto(`/app/proyek/${projectId}/bab/${chapterId}/tulis`);

  const body = await page.locator('body').innerText();

  // No UUIDs in body text
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  expect(body).not.toMatch(uuidPattern);

  // No technical terms exposed to users
  const forbiddenTerms = ['m4', 'backend', 'resolver', 'disabled', 'realdata'];
  for (const term of forbiddenTerms) {
    expect(body.toLowerCase()).not.toContain(term);
  }
});

/**
 * Responsive coverage: 5 routes × 4 viewports = 20 cells
 * Uses single persisted fixture across all dimensions
 */
test.describe('Responsive Chapter Workspace', () => {
  test('desktop: five routes render correctly at all viewport widths', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'desktop') {
      test.skip();
    }

    const { projectId, chapterId, projectTitle, chapterTitle } = await seedPr4ChapterForCurrentUser(
      {
        page,
        testInfo,
        label: 'responsive-single-registration',
      },
    );

    for (const routeExpectation of routeExpectations) {
      for (const viewport of VIEWPORTS) {
        await test.step(`Route ${routeExpectation.suffix} @ ${viewport.width}px`, async () => {
          await page.setViewportSize(viewport);

          const routeUrl = `/app/proyek/${projectId}/bab/${chapterId}/${routeExpectation.suffix}`;

          // Attach console listener BEFORE navigation
          const errors: string[] = [];
          const onConsole = (msg: unknown) => {
            if (typeof msg === 'object' && msg && 'type' in msg) {
              const typedMsg = msg as { type(): string; text(): string };
              if (typedMsg.type() === 'error') {
                errors.push(typedMsg.text());
              }
            }
          };

          page.on('console', onConsole);

          try {
            await page.goto(routeUrl);
            await page.waitForLoadState('domcontentloaded');

            // Core visibility checks
            await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
            await expect(page.getByTestId('project-shell')).toBeVisible({ timeout: 15_000 });
            await expect(page.locator('body')).toContainText(projectTitle, { timeout: 10_000 });
            await expect(page.locator('body')).toContainText(chapterTitle, { timeout: 10_000 });
            await expect(page.locator('body')).toContainText(routeExpectation.unavailableText, {
              timeout: 10_000,
            });

            // No raw UUIDs
            const bodyText = await page.locator('body').innerText();
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
            expect(bodyText).not.toMatch(uuidPattern);

            // No internal jargon
            const forbiddenTerms = [
              'm4',
              'backend',
              'resolver',
              'REALDATA',
              'PRESENTATION',
              'DISABLED',
            ];
            for (const term of forbiddenTerms) {
              expect(bodyText.toLowerCase()).not.toContain(term.toLowerCase());
            }

            // Overflow check - no horizontal overflow (max 1px tolerance for browser rounding)
            const dimensions = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
            }));
            expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

            // Verify no accumulated console errors
            expect(errors).toEqual([]);

            // === RESPONSIVE SHELL ASSERTIONS ===
            const mobileNav = page.getByLabel('Navigasi aplikasi mobile');
            const projectSidebar = page.getByTestId('project-sidebar');
            const menuProyekButton = page.getByRole('button', { name: 'Menu proyek' });

            if (viewport.width === 375) {
              // MOBILE: bottom nav visible, sidebar hidden, drawer button not shown
              await expect(mobileNav).toBeVisible({ timeout: 10_000 });
              await expect(projectSidebar).not.toBeVisible({ timeout: 10_000 });
              await expect(menuProyekButton).not.toBeVisible({ timeout: 10_000 });
            } else if (viewport.width === 768) {
              // TABLET: bottom nav visible, sidebar hidden, drawer button shown
              await expect(mobileNav).toBeVisible({ timeout: 10_000 });
              await expect(projectSidebar).not.toBeVisible({ timeout: 10_000 });
              await expect(menuProyekButton).toBeVisible({ timeout: 10_000 });
            } else if (viewport.width === 1280 || viewport.width === 1440) {
              // DESKTOP: bottom nav hidden, sidebar visible, drawer button not shown
              await expect(mobileNav).not.toBeVisible({ timeout: 10_000 });
              await expect(projectSidebar).toBeVisible({ timeout: 10_000 });
              await expect(menuProyekButton).not.toBeVisible({ timeout: 10_000 });
            }
          } finally {
            page.off('console', onConsole);
          }
        });
      }
    }
  });
});

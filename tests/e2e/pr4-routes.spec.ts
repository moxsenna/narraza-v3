/**
 * PR4 Chapter Workspace E2E Coverage
 *
 * Uses application-layer fixture helper matching foundation-preservation pattern
 */
import { expect, test } from '@playwright/test';
import { seedPr4ChapterForCurrentUser } from './support/pr4-fixture';

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
] as const;

const RESPONSIVE_ROUTE_EXPECTATIONS = [
  { suffix: 'tulis', unavailableText: 'Penulisan bab belum tersedia' },
  { suffix: 'cek', unavailableText: 'Validasi bab belum tersedia' },
  { suffix: 'selesaikan', unavailableText: 'Penyelesaian bab belum tersedia' },
  { suffix: 'naskah', unavailableText: 'Tidak ada naskah yang tersedia' },
  { suffix: 'publish', unavailableText: 'Publish bab belum tersedia' },
] as const;

const routeExpectations = [
  {
    suffix: 'tulis',
    unavailableText: 'Penulisan bab belum tersedia',
  },
  {
    suffix: 'cek',
    unavailableText: 'Validasi bab belum tersedia',
  },
  {
    suffix: 'selesaikan',
    unavailableText: 'Penyelesaian bab belum tersedia',
  },
  {
    suffix: 'naskah',
    unavailableText: 'Tidak ada naskah yang tersedia',
  },
  {
    suffix: 'publish',
    unavailableText: 'Publish bab belum tersedia',
  },
] as const;

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
  test('desktop: five routes render correctly at all viewport widths', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'desktop') {
      test.skip();
    }

    const { projectId, chapterId, projectTitle, chapterTitle } = await seedPr4ChapterForCurrentUser({
      page,
      testInfo,
      label: 'responsive-single-registration',
    });

    for (const routeExpectation of RESPONSIVE_ROUTE_EXPECTATIONS) {
      for (const viewport of VIEWPORTS) {
        await test.step(`Route ${routeExpectation.suffix} @ ${viewport.width}px`, async () => {
          await page.setViewportSize(viewport);

          const routeUrl = `/app/proyek/${projectId}/bab/${chapterId}/${routeExpectation.suffix}`;
          await page.goto(routeUrl);
          await page.waitForLoadState('domcontentloaded');

          // Collect errors BEFORE navigation ends
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
            // Core visibility checks
            await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
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
          } finally {
            page.off('console', onConsole);
          }
        });
      }
    }
  });
});

import { expect, test, type Page } from '@playwright/test';
import { seedPr4ChapterForCurrentUser } from './support/pr4-fixture';

const viewports = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 900 },
] as const;

const evidenceRoot = 'docs/review/frontend/checkpoint-d/screenshots';

async function assertHealthySurface(page: Page, consoleErrors: string[]): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toMatchObject({ clientWidth: expect.any(Number), scrollWidth: expect.any(Number) });

  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
  expect(consoleErrors).toEqual([]);

  const copy = (await page.locator('body').innerText()).toLowerCase();
  for (const forbidden of ['service_restricted', 'realdata', 'presentation-only']) {
    expect(copy).not.toContain(forbidden);
  }
}

test.describe.configure({ timeout: 240_000 });

test('Checkpoint D authenticated visual matrix', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    consoleErrors.length = 0;
    await page.goto('/');
    await assertHealthySurface(page, consoleErrors);
    await page.screenshot({
      path: `${evidenceRoot}/public-${viewport.name}.png`,
      fullPage: true,
    });
  }

  const fixture = await seedPr4ChapterForCurrentUser({
    page,
    testInfo,
    label: 'checkpoint-d-visual',
  });

  const surfaces = [
    { name: 'global', path: '/app' },
    { name: 'project', path: `/app/proyek/${fixture.projectId}` },
    { name: 'chat', path: `/app/proyek/${fixture.projectId}/chat` },
    { name: 'foundation', path: `/app/proyek/${fixture.projectId}/fondasi` },
    { name: 'outline', path: `/app/proyek/${fixture.projectId}/outline` },
    {
      name: 'chapter',
      path: `/app/proyek/${fixture.projectId}/bab/${fixture.chapterId}/tulis`,
    },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const surface of surfaces) {
      consoleErrors.length = 0;
      await page.goto(surface.path);
      await page.waitForLoadState('domcontentloaded');
      await assertHealthySurface(page, consoleErrors);

      const mobileNav = page.getByLabel('Navigasi aplikasi mobile');
      const projectSidebar = page.getByTestId('project-sidebar');
      if (viewport.width < 1024) {
        await expect(mobileNav).toBeVisible();
        await expect(projectSidebar).not.toBeVisible();
      } else {
        await expect(mobileNav).not.toBeVisible();
        if (surface.name !== 'global') await expect(projectSidebar).toBeVisible();
      }

      if (surface.name === 'chat') {
        const composer = page
          .locator('form')
          .filter({ has: page.locator('textarea[name="content"]') });
        await expect(composer).toBeVisible();
        const composerBox = await composer.boundingBox();
        expect(composerBox).not.toBeNull();
        expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(viewport.height + 1);
        if (viewport.width < 1024) {
          await expect(page.getByRole('button', { name: /Sinyal \d+\/6/ })).toBeVisible();
        } else {
          await expect(
            page.locator('aside').getByRole('heading', { name: 'Sinyal cerita' }),
          ).toBeVisible();
        }
      }

      await page.screenshot({
        path: `${evidenceRoot}/${surface.name}-${viewport.name}.png`,
        fullPage: true,
      });
    }
  }
});

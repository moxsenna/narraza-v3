import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createOwnedProject, createVerifiedSession } from './support/auth-session';

const capture = process.env.CAPTURE_PR1_EVIDENCE === '1';
const evidenceRoot = resolve(process.cwd(), 'docs/review/frontend/pr1/screenshots');

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function shot(page: Page, name: string, width: number) {
  if (!capture) return;
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({ path: resolve(evidenceRoot, `${name}-${width}.png`), fullPage: true });
}

async function setViewport(page: Page, width: number) {
  await page.setViewportSize({ width, height: width <= 768 ? 900 : 1000 });
}

test.describe.configure({ timeout: 120_000 });

test('landing and auth responsive evidence', async ({ page }, testInfo) => {
  const widths = testInfo.project.name === 'mobile' ? [375, 768] : [1280, 1440];

  for (const width of widths) {
    await setViewport(page, width);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Tulis serial panjang tanpa kehilangan arah.' }),
    ).toBeVisible();

    if (width < 1024) {
      const trigger = page.getByRole('button', { name: 'Menu', exact: true });
      await expect(trigger).toBeVisible();
      await trigger.focus();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Navigasi utama mobile' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Masuk', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    } else {
      await expect(page.getByRole('link', { name: 'Masuk', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden();
    }

    await noOverflow(page);
    await shot(page, 'landing', width);
    await page.goto('/masuk');
    await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
    await expect(page.getByLabel('Alamat email')).toBeVisible();
    await noOverflow(page);
    await shot(page, 'auth', width);
  }
});

test('global and project shells plus distinct mobile sheet and tablet drawer', async ({
  page,
}, testInfo) => {
  await createVerifiedSession(page, testInfo);

  // Explicitly navigate to /app for this test's own state requirements
  await page.goto('/app');

  const widths = testInfo.project.name === 'mobile' ? [375, 768] : [1280, 1440];

  for (const width of widths) {
    await setViewport(page, width);
    const globalShell = page.getByTestId('global-shell');
    await expect(globalShell).toBeVisible();
    await expect(
      globalShell.getByRole('heading', { name: /^(Belum ada proyek|Proyekmu)$/ }),
    ).toBeVisible();
    await expect(page.getByTestId('project-shell')).toHaveCount(0);
    await expect(page.getByTestId('project-sidebar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Menu proyek' })).toHaveCount(0);
    await noOverflow(page);
    await shot(page, 'global-shell', width);
  }

  const project = await createOwnedProject(page);
  if (testInfo.project.name === 'desktop') {
    await setViewport(page, 1279);
    await page.goto(`/app/proyek/${project.projectId}`);
    await expect(page.getByRole('button', { name: 'Menu proyek' })).toBeVisible();
    await expect(page.getByTestId('project-sidebar')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Navigasi aplikasi mobile' })).toBeVisible();
    await noOverflow(page);
  }

  for (const width of widths) {
    await setViewport(page, width);
    await page.goto(`/app/proyek/${project.projectId}`);
    const projectShell = page.getByTestId('project-shell');
    await expect(projectShell).toBeVisible();
    await expect(
      projectShell.getByRole('heading', { name: project.title, exact: true }),
    ).toBeVisible();
    await expect(projectShell.locator('nav:visible').first()).toBeVisible();
    await expect(page.getByTestId('global-shell')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain(project.projectId);

    if (width === 375) {
      await expect(page.getByRole('link', { name: 'Beranda', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.getByRole('link', { name: 'Rencana', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/app/proyek/${project.projectId}/outline$`));
      await expect(page.getByRole('link', { name: 'Rencana', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );

      const trigger = page.getByRole('button', { name: 'Lainnya' });
      await trigger.focus();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Lainnya' });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tutup' })).toBeFocused();
      await expect(
        dialog.locator('[aria-disabled="true"]').filter({ hasText: 'Naskah' }),
      ).toHaveCount(1);
      await expect(dialog.getByRole('link', { name: 'Naskah' })).toHaveCount(0);
      await expect(dialog.getByText('Kemampuan ini belum tersedia.').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    } else if (width === 768) {
      const trigger = page.getByRole('button', { name: 'Menu proyek' });
      await expect(trigger).toBeVisible();
      await trigger.focus();
      await trigger.click();
      const drawer = page.getByRole('dialog', { name: 'Navigasi proyek' });
      await expect(drawer).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tutup navigasi proyek' })).toBeFocused();
      await expect(drawer.getByRole('link', { name: 'Beranda', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.id)).toBe(
        'project-navigation-drawer',
      );
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.id)).toBe(
        'project-navigation-drawer',
      );
      await drawer.getByRole('link', { name: 'Rencana Cerita', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/app/proyek/${project.projectId}/outline$`));
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole('link', { name: 'Rencana Cerita', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(drawer.getByText('Kemampuan ini belum tersedia.').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByRole('button', { name: 'Lainnya' })).toBeVisible();
    } else {
      const sidebar = page.getByTestId('project-sidebar');
      for (const group of [
        'PERSIAPAN',
        'PERENCANAAN',
        'PENULISAN',
        'PEMERIKSAAN',
        'PUBLIKASI',
        'LAINNYA',
      ])
        await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
      await sidebar.getByRole('link', { name: 'Chat Narra', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/app/proyek/${project.projectId}/chat$`));
      await expect(sidebar.getByRole('link', { name: 'Chat Narra', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }

    await noOverflow(page);
    await shot(page, 'project-shell', width);
  }
});

test('sheet remains usable with reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createVerifiedSession(page, testInfo);

  // Create a real project (required for project-shell navigation)
  const project = await createOwnedProject(page);

  // Navigate to the project page (explicit state setup)
  await setViewport(page, 375);
  await page.goto(`/app/proyek/${project.projectId}`);

  // Assert project-shell visible before testing other elements
  await expect(page.getByTestId('project-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lainnya' })).toBeVisible();

  // Test the "Lainnya" sheet interaction
  await page.getByRole('button', { name: 'Lainnya' }).click();
  await expect(page.getByRole('dialog', { name: 'Lainnya' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Lainnya' })).toBeHidden();
});

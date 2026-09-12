import { expect, test, type Page } from '@playwright/test';
import { clearMailpit, waitForMailLink } from './mailpit';
import { createOwnedProject } from './support/auth-session';
import { isolateE2eClientIp } from './support/test-client';

const mailpitApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8025';
const verifySubject = 'Verifikasi email Narraza-mu';
const password = 'Narraza!Task7Fix123';

async function registerAndEnterApp(page: Page, email: string): Promise<void> {
  await isolateE2eClientIp(page);
  await page.goto('/daftar');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByLabel('Ulangi kata sandi').fill(password);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText(/kami sudah mengirim tautan verifikasi/i)).toBeVisible({
    timeout: 15_000,
  });

  const verificationLink = await waitForMailLink({
    apiBaseUrl: mailpitApiUrl,
    recipient: email,
    subject: verifySubject,
  });
  await page.goto(verificationLink);
  await page.getByRole('button', { name: 'Verifikasi & masuk' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openProjectDrawer(page: Page) {
  const trigger = page.getByRole('button', { name: 'Menu proyek' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Navigasi proyek' });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

async function openMoreSheet(page: Page) {
  const trigger = page.getByRole('button', { name: 'Lainnya' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Lainnya' });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test.describe.configure({ timeout: 120_000 });

test('enabled drawer and sheet navigation closes dialogs for pointer and keyboard activation', async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  await clearMailpit(mailpitApiUrl);
  await registerAndEnterApp(page, `task-7-navigation-${stamp}@example.test`);
  const { projectId } = await createOwnedProject(page, `Task 7 navigation ${stamp}`);
  const projectBase = `/app/proyek/${projectId}`;

  await page.setViewportSize({ width: 900, height: 800 });

  const pointerDrawer = await openProjectDrawer(page);
  await expect(pointerDrawer.dialog).toHaveAttribute(
    'aria-describedby',
    'project-navigation-drawer-description',
  );
  await expect(pointerDrawer.dialog).toHaveAccessibleDescription(
    'Pilih bagian proyek yang ingin dibuka.',
  );
  await pointerDrawer.dialog.getByRole('link', { name: 'Chat Narra' }).click();
  await expect(page).toHaveURL(`${projectBase}/chat`);
  await expect(pointerDrawer.dialog).not.toBeVisible();
  await expect(pointerDrawer.trigger).toBeFocused();

  const presentationDrawer = await openProjectDrawer(page);
  await expect(presentationDrawer.dialog.getByRole('link', { name: 'Naskah' })).toHaveAttribute(
    'href',
    `${projectBase}/naskah`,
  );
  await expect(presentationDrawer.dialog.getByRole('link', { name: 'Tulis' })).toHaveAttribute(
    'href',
    `${projectBase}/tulis`,
  );
  await expect(
    presentationDrawer.dialog.locator('[aria-disabled="true"]').filter({ hasText: 'Cek Cerita' }),
  ).toHaveCount(1);
  await expect(presentationDrawer.dialog).toBeVisible();
  await page.getByRole('button', { name: 'Tutup navigasi proyek' }).click();

  const modifiedDrawer = await openProjectDrawer(page);
  const drawerPagePromise = page.context().waitForEvent('page');
  await modifiedDrawer.dialog
    .getByRole('link', { name: 'Jadwal Rahasia' })
    .click({ modifiers: ['Control'] });
  const drawerPage = await drawerPagePromise;
  await expect(drawerPage).toHaveURL(`${projectBase}/rahasia`);
  await expect(modifiedDrawer.dialog).toBeVisible();
  await drawerPage.close();
  await page.getByRole('button', { name: 'Tutup navigasi proyek' }).click();

  const keyboardDrawer = await openProjectDrawer(page);
  const foundationLink = keyboardDrawer.dialog.getByRole('link', { name: 'Fondasi' });
  await foundationLink.focus();
  await foundationLink.press('Enter');
  await expect(page).toHaveURL(`${projectBase}/fondasi`);
  await expect(keyboardDrawer.dialog).not.toBeVisible();
  await expect(keyboardDrawer.trigger).toBeFocused();

  await page.setViewportSize({ width: 375, height: 812 });

  const pointerSheet = await openMoreSheet(page);
  await pointerSheet.dialog.getByRole('link', { name: 'Karakter' }).click();
  await expect(page).toHaveURL(`${projectBase}/karakter`);
  await expect(pointerSheet.dialog).not.toBeVisible();
  await expect(pointerSheet.trigger).toBeFocused();

  const presentationSheet = await openMoreSheet(page);
  await expect(presentationSheet.dialog.getByRole('link', { name: 'Naskah' })).toHaveAttribute(
    'href',
    `${projectBase}/naskah`,
  );
  await expect(
    presentationSheet.dialog.getByRole('link', { name: 'Paket Publish' }),
  ).toHaveAttribute('href', `${projectBase}/publish`);
  await expect(presentationSheet.dialog).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('link', { name: 'Tulis', exact: true })).toHaveAttribute(
    'href',
    `${projectBase}/tulis`,
  );
  await expect(
    page
      .locator('nav[aria-label="Navigasi aplikasi mobile"] [aria-disabled="true"]')
      .filter({ hasText: 'Cek' }),
  ).toHaveCount(1);

  const modifiedSheet = await openMoreSheet(page);
  const sheetPagePromise = page.context().waitForEvent('page');
  await modifiedSheet.dialog
    .getByRole('link', { name: 'Jadwal Rahasia' })
    .click({ modifiers: ['Control'] });
  const sheetPage = await sheetPagePromise;
  await expect(sheetPage).toHaveURL(`${projectBase}/rahasia`);
  await expect(modifiedSheet.dialog).toBeVisible();
  await sheetPage.close();
  await page.keyboard.press('Escape');

  const keyboardSheet = await openMoreSheet(page);
  const factsLink = keyboardSheet.dialog.getByRole('link', { name: 'Fakta' });
  await factsLink.focus();
  await factsLink.press('Enter');
  await expect(page).toHaveURL(`${projectBase}/fakta`);
  await expect(keyboardSheet.dialog).not.toBeVisible();
  await expect(keyboardSheet.trigger).toBeFocused();

  const logoutSheet = await openMoreSheet(page);
  await logoutSheet.dialog.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/masuk$/);
});

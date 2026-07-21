import { expect, test } from '@playwright/test';
import { clearMailpit, waitForMailLink } from './mailpit';

const mailpitApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8026';
const verifySubject = 'Verifikasi email Narraza-mu';
const resetSubject = 'Atur ulang kata sandi Narraza';
const originalPassword = 'Narraza!Original123';
const newPassword = 'Narraza!Changed456';

test('register, verify, login, and reset password with real auth', async ({ page }, testInfo) => {
  const email = `auth-smoke-${testInfo.project.name}-${Date.now()}@example.test`;
  await clearMailpit(mailpitApiUrl);

  await page.goto('/daftar');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(originalPassword);
  await page.getByLabel('Ulangi kata sandi').fill(originalPassword);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText(/kami sudah mengirim tautan verifikasi/i)).toBeVisible();

  const verificationLink = await waitForMailLink({
    apiBaseUrl: mailpitApiUrl,
    recipient: email,
    subject: verifySubject,
  });
  await page.goto(verificationLink);
  await expect(page).toHaveURL(/\/verifikasi\/selesaikan$/);
  await expect(page.getByRole('heading', { name: 'Verifikasi email' })).toBeVisible();
  await page.getByRole('button', { name: 'Verifikasi & masuk' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/masuk$/);
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi').fill(originalPassword);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/masuk$/);
  await clearMailpit(mailpitApiUrl);
  await page.getByRole('link', { name: 'Lupa kata sandi?' }).click();
  await expect(page).toHaveURL(/\/lupa-password$/);
  await page.waitForLoadState('networkidle');
  const resetEmail = page.getByLabel('Alamat email');
  await resetEmail.fill(email);
  await expect(resetEmail).toHaveValue(email);
  await resetEmail.press('Enter');
  await expect(page.getByText(/kami sudah mengirim tautan untuk mengatur ulang/i)).toBeVisible();

  const resetLink = await waitForMailLink({
    apiBaseUrl: mailpitApiUrl,
    recipient: email,
    subject: resetSubject,
  });
  await page.goto(resetLink);
  await expect(page).toHaveURL(/\/reset-password\/baru$/);
  await page.getByLabel('Kata sandi baru', { exact: true }).fill(newPassword);
  await page.getByLabel('Ulangi kata sandi baru').fill(newPassword);
  await page.getByRole('button', { name: 'Simpan kata sandi baru' }).click();
  await expect(page).toHaveURL(/\/masuk\?reset=1$/);

  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi').fill(newPassword);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
});

/**
 * verification-matrix: idor (S6)
 * Foreign tenant access must be indistinguishable from missing resources:
 * always branded not-found — never FORBIDDEN or foreign data.
 */
import { expect, test, type Page } from '@playwright/test';
import { clearMailpit, waitForMailLink } from './mailpit';

const mailpitApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8026';
const verifySubject = 'Verifikasi email Narraza-mu';
const password = 'Narraza!IdorTest123';

test.describe.configure({ timeout: 120_000 });

async function registerAndEnterApp(page: Page, email: string): Promise<void> {
  await page.goto('/daftar');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByLabel('Ulangi kata sandi').fill(password);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText(/kami sudah mengirim tautan verifikasi/i)).toBeVisible();

  const verificationLink = await waitForMailLink({
    apiBaseUrl: mailpitApiUrl,
    recipient: email,
    subject: verifySubject,
  });
  await page.goto(verificationLink);
  await expect(page).toHaveURL(/\/verifikasi\/selesaikan$/);
  await page.getByRole('button', { name: 'Verifikasi & masuk' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/masuk$/);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/masuk');
  await page.getByLabel('Alamat email').fill(email);
  await page.getByLabel('Kata sandi').fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function createProject(page: Page, title: string): Promise<string> {
  await page.goto('/app/proyek/baru');
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="jalur"][value="rough_idea"]').check();
  await page.getByRole('button', { name: /Buat proyek/i }).click();
  // Must leave /baru — that segment also matches [^/]+ and was a false positive.
  await expect(page).toHaveURL(/\/app\/proyek\/(?!baru(?:\/|$))[^/?#]+$/, {
    timeout: 45_000,
  });
  const url = page.url();
  const match = url.match(/\/app\/proyek\/([^/?#]+)/);
  if (!match || match[1] === 'baru') {
    throw new Error(`project id missing from URL: ${url}`);
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title, {
    timeout: 15_000,
  });
  return match[1]!;
}

async function expectBrandedNotFound(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).toMatch(/tidak ditemukan|not found|halaman/);
}

test('idor: foreign and random project resources are indistinguishable NOT_FOUND', async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const emailA = `idor-a-${stamp}@example.test`;
  const emailB = `idor-b-${stamp}@example.test`;
  const secretTitle = `SecretProject-${stamp}`;
  const randomId = '00000000-0000-4000-8000-999999999999';

  await clearMailpit(mailpitApiUrl);

  await registerAndEnterApp(page, emailA);
  const projectA = await createProject(page, secretTitle);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(secretTitle);

  await page.goto(`/app/proyek/${projectA}/chat`);
  await expect(page.locator('textarea[name="content"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('textarea[name="content"]').fill('Pesan rahasia owner A');
  await page.getByRole('button', { name: /Kirim/i }).click();
  await expect(page.getByText('Pesan rahasia owner A')).toBeVisible({ timeout: 15_000 });

  await page.goto(`/app/proyek/${projectA}/fondasi`);
  await expect(page.locator('textarea[name="coreConcept"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('textarea[name="coreConcept"]').fill('Konsep rahasia milik A');
  await page.getByRole('button', { name: /Simpan draft/i }).click();
  // Wait for save either via alert absence or value retained after refresh.
  await page.waitForTimeout(500);
  await page.goto(`/app/proyek/${projectA}/fondasi`);
  await expect(page.locator('textarea[name="coreConcept"]')).toHaveValue('Konsep rahasia milik A');

  await logout(page);

  await clearMailpit(mailpitApiUrl);
  await registerAndEnterApp(page, emailB);
  const projectB = await createProject(page, `AttackerProject-${stamp}`);

  const foreignRoutes = [
    `/app/proyek/${projectA}`,
    `/app/proyek/${projectA}/fondasi`,
    `/app/proyek/${projectA}/chat`,
    `/app/proyek/${projectA}/outline`,
    `/app/proyek/${projectA}/karakter`,
    `/app/proyek/${projectA}/fakta`,
    `/app/proyek/${projectA}/rahasia`,
  ];
  const randomRoutes = [
    `/app/proyek/${randomId}`,
    `/app/proyek/${randomId}/fondasi`,
    `/app/proyek/${randomId}/chat`,
    `/app/proyek/${randomId}/outline`,
    `/app/proyek/${randomId}/karakter`,
    `/app/proyek/${randomId}/fakta`,
    `/app/proyek/${randomId}/rahasia`,
  ];

  for (const route of [...foreignRoutes, ...randomRoutes]) {
    await page.goto(route);
    await expectBrandedNotFound(page);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(secretTitle);
    expect(body).not.toContain('Konsep rahasia milik A');
    expect(body).not.toContain('Pesan rahasia owner A');
  }

  // Mutation IDOR: attacker posts with foreign projectId.
  await page.goto(`/app/proyek/${projectB}/chat`);
  await expect(page.locator('textarea[name="content"]')).toBeVisible();
  await page.locator('input[name="projectId"]').evaluate((el, id) => {
    (el as HTMLInputElement).value = id;
  }, projectA);
  await page.locator('textarea[name="content"]').fill('IDOR inject attempt');
  await page.getByRole('button', { name: /Kirim/i }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  const alertText = await page.getByRole('alert').innerText();
  expect(alertText.toLowerCase()).not.toContain(secretTitle.toLowerCase());

  await page.goto(`/app/proyek/${projectB}/chat`);
  await expect(page.getByText('IDOR inject attempt')).toHaveCount(0);

  // Foundation mutation IDOR.
  await page.goto(`/app/proyek/${projectB}/fondasi`);
  await page
    .locator('input[name="projectId"]')
    .first()
    .evaluate((el, id) => {
      (el as HTMLInputElement).value = id;
    }, projectA);
  await page.locator('textarea[name="coreConcept"]').fill('Hacked concept');
  await page.getByRole('button', { name: /Simpan draft/i }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });

  // Owner A data intact.
  await logout(page);
  await login(page, emailA);
  await page.goto(`/app/proyek/${projectA}/chat`);
  await expect(page.getByText('Pesan rahasia owner A')).toBeVisible();
  await expect(page.getByText('IDOR inject attempt')).toHaveCount(0);
  await page.goto(`/app/proyek/${projectA}/fondasi`);
  await expect(page.locator('textarea[name="coreConcept"]')).toHaveValue('Konsep rahasia milik A');
});

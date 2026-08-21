/**
 * verification-matrix: idor (S6)
 * Foreign tenant access must be indistinguishable from missing resources:
 * always branded not-found — never FORBIDDEN or foreign data.
 */
import { expect, test, type Page } from '@playwright/test';
import { clearMailpit, waitForMailLink } from './mailpit';

const mailpitApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8025';
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

async function createProjectWithChapter(page: Page, title: string): Promise<{ projectId: string; chapterId: string }> {
  await page.goto('/app/proyek/baru');
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="jalur"][value="rough_idea"]').check();
  await page.getByRole('button', { name: /Buat proyek/i }).click();
  await expect(page).toHaveURL(/\/app\/proyek\/(?!baru(?:\/|$))[^/?#]+$/, { timeout: 45_000 });
  
  const url = page.url();
  const match = url.match(/\/app\/proyek\/([^/?#]+)/);
  if (!match || match[1] === 'baru') {
    throw new Error(`project id missing from URL: ${url}`);
  }
  const projectId = match[1]!;

  // Navigate to outline and attempt to add a chapter
  await page.goto(`/app/proyek/${projectId}/outline`);
  
  const addChapterButton = page.getByRole('button', { name: /Tambah Bab|Tambahkan Bab/i })
    .first();
  
  if (await addChapterButton.count() > 0) {
    await addChapterButton.click();
    
    const chapterTitleInput = page.locator('input[name="title"]').first();
    if (await chapterTitleInput.isVisible()) {
      await chapterTitleInput.fill(`Bab Awal - ${title}`);
    }
    
    await page.getByRole('button', { name: /Simpan|Tambah/i }).first().click();
    await expect(page.getByText(/Bab Awal/i)).toBeVisible({ timeout: 15_000 });
  }

  // Extract chapter ID from available UI
  let chapterId: string;
  
  // Try to find chapter link in outline
  const chapterLink = page.locator('a[href*="/bab/"]').first();
  if (await chapterLink.count() > 0) {
    await chapterLink.evaluate((el) => el.setAttribute('target', '_blank'));
    const href = await chapterLink.getAttribute('href');
    if (href) {
      const parts = href.split('/');
      chapterId = parts[parts.length - 1];
      
      // Open chapter in new tab to get the ID
      await chapterLink.click();
      await page.waitForTimeout(1000);
      
      // Keep second tab open
    } else {
      throw new Error('Could not extract chapter ID from link');
    }
  } else {
    // Alternative: try data attributes or other patterns
    const chapterRow = page.locator('[data-entity-type="chapter"]').first();
    if (await chapterRow.count() > 0) {
      chapterId = await chapterRow.getAttribute('data-id') || await chapterRow.getAttribute('data-chapter-id');
    }
  }

  if (!chapterId) {
    throw new Error('Could not obtain chapter ID from outline');
  }

  // Close the new tab if we opened one
  const tabs = await page.context().pages();
  if (tabs.length > 1) {
    await tabs[1].close();
  }

  return { projectId, chapterId };
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
    `/app/proyek/${projectA}/tulis`,
  ];
  const randomRoutes = [
    `/app/proyek/${randomId}`,
    `/app/proyek/${randomId}/fondasi`,
    `/app/proyek/${randomId}/chat`,
    `/app/proyek/${randomId}/outline`,
    `/app/proyek/${randomId}/karakter`,
    `/app/proyek/${randomId}/fakta`,
    `/app/proyek/${randomId}/rahasia`,
    `/app/proyek/${randomId}/tulis`,
  ];

  for (const route of [...foreignRoutes, ...randomRoutes]) {
    await page.goto(route);
    await expectBrandedNotFound(page);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(secretTitle);
    expect(body).not.toContain('Konsep rahasia milik A');
    expect(body).not.toContain('Pesan rahasia owner A');
  }

  for (const deniedProjectId of [projectA, randomId]) {
    await page.goto(
      `/app/__preview/frontend-parity?scenario=tulis-choose&projectId=${encodeURIComponent(deniedProjectId)}`,
    );
    await expectBrandedNotFound(page);
    expect(await page.locator('body').innerText()).not.toContain(secretTitle);
  }

  // Create a second owned project with outline/chapter for PR4 IDOR testing
  const emailC = `idor-c-${stamp}@example.test`;
  await logout(page);
  await clearMailpit(mailpitApiUrl);
  await registerAndEnterApp(page, emailC);
  const { projectId: projectC, chapterId: chapterC } = await createProjectWithChapter(page, `Pr4IdorProject-${stamp}`);

  const pr4Routes = [
    `/app/proyek/${projectC}/bab/${chapterC}/tulis`,
    `/app/proyek/${projectC}/bab/${chapterC}/cek`,
    `/app/proyek/${projectC}/bab/${chapterC}/selesaikan`,
    `/app/proyek/${projectC}/bab/${chapterC}/naskah`,
    `/app/proyek/${projectC}/bab/${chapterC}/publish`,
  ];

  // Test C: owned project + foreign chapter
  const foreignChapterRoutes = pr4Routes.map(route => 
    route.replace(chapterC, randomId)
  );

  for (const route of foreignChapterRoutes) {
    await page.goto(route);
    await expectBrandedNotFound(page);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(`Pr4IdorProject-${stamp}`);
  }

  // Test D: owned project + random chapter
  const anotherRandomChapter = '11111111-1111-4111-8111-222222222222';
  const randomChapterRoutes = pr4Routes.map(route => 
    route.replace(chapterC, anotherRandomChapter)
  );

  for (const route of randomChapterRoutes) {
    await page.goto(route);
    await expectBrandedNotFound(page);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(`Pr4IdorProject-${stamp}`);
  }

  // Tests A & B extended: foreign project access to chapter routes
  const foreignProjectChapterRoutes = pr4Routes.map(route => 
    route.replace(projectC, projectA)
  );

  for (const route of foreignProjectChapterRoutes) {
    await page.goto(route);
    await expectBrandedNotFound(page);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(secretTitle);
    expect(body).not.toContain(`Pr4IdorProject-${stamp}`);
  }

  const randomProjectChapterRoutes = pr4Routes.map(route => 
    route.replace(projectC, randomId)
  );

  for (const route of randomProjectChapterRoutes) {
    await page.goto(route);
    await expectBrandedNotFound(page);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(secretTitle);
  }

  // Mutation IDOR: attacker posts with foreign projectId.
  await page.goto(`/app/proyek/${projectB}/chat`);
  await expect(page.locator('textarea[name="content"]')).toBeVisible();
  await page.locator('input[name="projectId"]').evaluate((el, id) => {
    (el as HTMLInputElement).value = id;
  }, projectA);
  await page.locator('textarea[name="content"]').fill('IDOR inject attempt');
  await page.getByRole('button', { name: /Kirim/i }).click();
  const chatForm = page.locator('form').filter({
    has: page.locator('textarea[name="content"]'),
  });
  const mutationAlert = chatForm.getByRole('alert');
  await expect(mutationAlert).toBeVisible({ timeout: 15_000 });
  const alertText = await mutationAlert.innerText();
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
  const fondasiForm = page.locator('form').filter({
    has: page.locator('textarea[name="coreConcept"]'),
  });
  const foundationRegion = fondasiForm.locator('..');
  const foundationAlert = foundationRegion.locator('p[role="alert"]');
  await expect(foundationAlert).toHaveCount(1);
  await expect(foundationAlert).toBeVisible({ timeout: 15_000 });
  const foundationAlertText = await foundationAlert.innerText();
  expect(foundationAlertText.toLowerCase()).not.toContain(secretTitle.toLowerCase());

  // Owner A data intact.
  await logout(page);
  await login(page, emailA);
  await page.goto(`/app/proyek/${projectA}/chat`);
  await expect(page.getByText('Pesan rahasia owner A')).toBeVisible();
  await expect(page.getByText('IDOR inject attempt')).toHaveCount(0);
  await page.goto(`/app/proyek/${projectA}/fondasi`);
  await expect(page.locator('textarea[name="coreConcept"]')).toHaveValue('Konsep rahasia milik A');
});

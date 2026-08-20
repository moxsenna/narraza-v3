import { expect, test, type Page } from '@playwright/test';
import { createOwnedProject, createVerifiedSession } from './support/auth-session';

test.describe.configure({ timeout: 120_000 });

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function addRoadmap(page: Page): Promise<void> {
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Tambah roadmap' }) });
  await form.locator('input[name="title"]').fill('Roadmap PR3');
  await form.getByRole('button', { name: 'Tambah roadmap' }).click();
  await expect(page.getByText('Roadmap PR3')).toBeVisible();
}

async function addArc(page: Page): Promise<void> {
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Tambah arc' }) });
  await expect(form.locator('select[name="parentId"] option')).toHaveCount(1);
  await form.locator('input[name="title"]').fill('Arc PR3');
  await form.getByRole('button', { name: 'Tambah arc' }).click();
  await expect(page.getByText('Arc PR3')).toBeVisible();
}

async function addChapter(page: Page, title: string): Promise<void> {
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Tambah bab' }) });
  await expect(form.locator('select[name="parentId"] option')).toHaveCount(1);
  await form.locator('input[name="title"]').fill(title);
  await form.getByRole('button', { name: 'Tambah bab' }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test('PR3 routes expose only honest owner-scoped presentation', async ({ page }, testInfo) => {
  await createVerifiedSession(page, testInfo);
  const { projectId, title } = await createOwnedProject(page);

  await page.goto('/app/kredit');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kredit & penggunaan' }),
  ).toBeVisible();
  await expect(
    page.getByText('Informasi kredit belum tersedia di akunmu saat ini.'),
  ).toBeVisible();
  await expect(
    page.getByText('Kamu tidak perlu melakukan apa pun untuk sekarang.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke dashboard' })).toHaveAttribute(
    'href',
    '/app',
  );
  const kreditCopy = (await page.locator('main').innerText()).toLowerCase();
  expect(kreditCopy).not.toMatch(
    /saldo|transaksi|ledger|potongan|refund|langganan|pembayaran|m4|backend|real-time|estimasi/,
  );
  await expect(page.locator('a[href*="__preview"]')).toHaveCount(0);

  await page.goto(`/app/proyek/${projectId}/tulis`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Siapkan rangkaian cerita' }),
  ).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  await expect(
    page.getByText('Buat rangkaian cerita terlebih dahulu agar penulisan memiliki arah yang jelas.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buka rangkaian cerita' })).toHaveAttribute(
    'href',
    `/app/proyek/${projectId}/outline`,
  );
  expect(await page.locator('main').innerText()).not.toContain(projectId);

  await page.goto(`/app/proyek/${projectId}/outline`);
  await addRoadmap(page);
  await page.goto(`/app/proyek/${projectId}/tulis`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Lengkapi rangkaian cerita' }),
  ).toBeVisible();
  await expect(
    page.getByText('Tambahkan bagian cerita yang dapat disiapkan untuk penulisan.'),
  ).toBeVisible();

  await page.goto(`/app/proyek/${projectId}/outline`);
  await addArc(page);
  await addChapter(page, 'Bab Pilihan PR3');
  await page.goto(`/app/proyek/${projectId}/tulis`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pilih bagian cerita' }),
  ).toBeVisible();
  await expect(page.getByText('Bab Pilihan PR3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tulis' })).toBeDisabled();
  await expect(page.getByText('Penulisan bab belum tersedia dari halaman ini.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tinjau rangkaian cerita' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke proyek' })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toContain(projectId);
  await expect(page.locator('a[href*="__preview"]')).toHaveCount(0);
});

test('preview is authenticated, allowlisted, scope-authorized, and action-disabled', async ({
  page,
}, testInfo) => {
  await page.goto('/app/__preview/frontend-parity?scenario=kredit-unavailable');
  await expect(page).toHaveURL(/\/masuk/);

  await createVerifiedSession(page, testInfo);
  const { projectId } = await createOwnedProject(page);

  await page.goto('/app/__preview/frontend-parity?scenario=unknown');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await page.locator('body').innerText()).toLowerCase()).toMatch(
    /tidak ditemukan|not found|halaman/,
  );

  await page.goto('/app/__preview/frontend-parity?scenario=kredit-unavailable');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kredit & penggunaan' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kembali ke dashboard' })).toBeDisabled();

  await page.goto(
    `/app/__preview/frontend-parity?scenario=tulis-choose&projectId=${encodeURIComponent(projectId)}`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pilih bagian cerita' }),
  ).toBeVisible();
  await expect(page.getByText('Pertemuan di Stasiun')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tulis' }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tinjau rangkaian cerita' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kembali ke proyek' })).toBeDisabled();
});

test('PR3 production routes remain responsive at locked widths with correct shells', async ({
  page,
}, testInfo) => {
  await createVerifiedSession(page, testInfo);
  const { projectId } = await createOwnedProject(page);

  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/app/kredit');
    await expect(page.getByRole('heading', { name: 'Kredit & penggunaan' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(`/app/proyek/${projectId}/tulis`);
    await expect(page.getByTestId('project-shell')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (width === 375) {
      await expect(
        page.getByRole('navigation', { name: 'Navigasi aplikasi mobile' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Menu proyek' })).toBeHidden();
      await expect(page.getByTestId('project-sidebar')).toBeHidden();
    } else if (width === 768) {
      await expect(page.getByRole('button', { name: 'Menu proyek' })).toBeVisible();
      await expect(page.getByTestId('project-sidebar')).toBeHidden();
    } else {
      await expect(page.getByTestId('project-sidebar')).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Navigasi aplikasi mobile' }),
      ).toBeHidden();
    }
  }
});

import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { JsonObject } from '@narraza/application';
import { createOwnedProject, createVerifiedSession } from './support/auth-session';

test.describe.configure({ timeout: 120_000 });

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL_WEB or DATABASE_URL is required for PR3 E2E');
  return databaseUrl;
}

async function lockCompleteFoundation(email: string, projectId: string): Promise<void> {
  const [application, database] = await Promise.all([
    import('../../packages/application/dist/index.js'),
    import('../../packages/db/dist/index.js'),
  ]);
  const prisma = database.createPrismaClient(requireDatabaseUrl());

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`registered user not found: ${email}`);

    const stamp = randomUUID();
    const mainCharacterId = `main-character-${stamp}`;
    const otherCharacterId = `relationship-character-${stamp}`;
    const payload = {
      coreConcept: `Konsep PR3 ${stamp}`,
      conflict: `Konflik PR3 ${stamp}`,
      endingDirection: `Akhir PR3 ${stamp}`,
      readerPromise: `Janji PR3 ${stamp}`,
      mainCharacter: {
        id: mainCharacterId,
        active: true,
        identity: `Identitas PR3 ${stamp}`,
        goal: `Tujuan PR3 ${stamp}`,
        motivation: `Motivasi PR3 ${stamp}`,
        address: `Panggilan PR3 ${stamp}`,
        speechStyle: `Gaya bicara PR3 ${stamp}`,
      },
      relationships: [
        {
          fromCharacterId: mainCharacterId,
          toCharacterId: otherCharacterId,
          active: true,
          description: `Relasi PR3 ${stamp}`,
        },
      ],
      secrets: [
        {
          truth: `Rahasia PR3 ${stamp}`,
          targetPosition: { chapterId: `target-chapter-${stamp}`, sequence: 37 },
          breadcrumbPositions: [
            { chapterId: `breadcrumb-one-${stamp}`, sequence: 11 },
            { chapterId: `breadcrumb-two-${stamp}`, sequence: 23 },
          ],
        },
      ],
    } satisfies JsonObject;

    const uow = database.createUnitOfWork(prisma);
    const draft = await application.createUpdateFoundationDraft(uow)({
      ownerUserId: user.id,
      projectId,
      payload,
      expectedRevision: null,
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(`Foundation seed failed: ${draft.error.publicMessageCode}`);

    const confirmed = await application.createConfirmFoundation(uow)({
      ownerUserId: user.id,
      projectId,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) {
      throw new Error(`Foundation confirm failed: ${confirmed.error.publicMessageCode}`);
    }

    const locked = await application.createLockFoundation(uow)({
      ownerUserId: user.id,
      projectId,
      acknowledged: true,
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) throw new Error(`Foundation lock failed: ${locked.error.publicMessageCode}`);
    expect(locked.value.foundation.status).toBe('locked');
  } finally {
    await prisma.$disconnect();
  }
}

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
  await expect(page.getByRole('listitem').getByText('Roadmap PR3')).toBeVisible();
}

async function addArc(page: Page): Promise<void> {
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Tambah arc' }) });
  await expect(form.locator('select[name="parentId"] option')).toHaveCount(1);
  await form.locator('input[name="title"]').fill('Arc PR3');
  await form.getByRole('button', { name: 'Tambah arc' }).click();
  await expect(page.getByRole('listitem').getByText('Arc PR3')).toBeVisible();
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
  const { email } = await createVerifiedSession(page, testInfo);
  const { projectId, title } = await createOwnedProject(page);
  await lockCompleteFoundation(email, projectId);

  await page.goto('/app/kredit');
  await expect(page.getByRole('heading', { level: 1, name: 'Kredit & penggunaan' })).toBeVisible();
  await expect(page.getByText('Informasi kredit belum tersedia di akunmu saat ini.')).toBeVisible();
  await expect(page.getByText('Kamu tidak perlu melakukan apa pun untuk sekarang.')).toBeVisible();
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
  await expect(page.getByRole('main').getByText(title)).toBeVisible();
  await expect(
    page.getByText(
      'Buat rangkaian cerita terlebih dahulu agar penulisan memiliki arah yang jelas.',
    ),
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
  await expect(page.getByRole('heading', { level: 1, name: 'Pilih bagian cerita' })).toBeVisible();
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
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await page.locator('body').innerText()).toLowerCase()).toMatch(
    /tidak ditemukan|not found|halaman/,
  );

  await createVerifiedSession(page, testInfo);
  const { projectId } = await createOwnedProject(page);

  await page.goto('/app/__preview/frontend-parity?scenario=unknown');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await page.locator('body').innerText()).toLowerCase()).toMatch(
    /tidak ditemukan|not found|halaman/,
  );

  const previewResponse = await page.goto(
    '/app/__preview/frontend-parity?scenario=kredit-unavailable',
  );
  expect(previewResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Kredit & penggunaan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kembali ke dashboard' })).toBeDisabled();

  await page.goto(
    `/app/__preview/frontend-parity?scenario=tulis-choose&projectId=${encodeURIComponent(projectId)}`,
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Pilih bagian cerita' })).toBeVisible();
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
      await expect(page.getByRole('navigation', { name: 'Navigasi aplikasi mobile' })).toBeHidden();
    }
  }
});

/**
 * M4 dev/mock exit-gate E2E (`m4-dev-mock-vertical`).
 *
 * Proves the FULL product chain from the dev/mock UI on real PostgreSQL:
 * real bundle freeze → plan → quote/system-funded admission → job → REAL M4
 * worker processor (deterministic mock provider) → fenced product projection
 * → UI observation. Also proves the preview boundary: production-style
 * environments are refused by policy (unit-tested at the gate), and both
 * unauthenticated and foreign-project requests get a non-enumerating 404.
 */
import { expect, test, type Page } from '@playwright/test';
import { createVerifiedSession } from './support/auth-session';
import { createM4Driver } from './support/m4-driver';
import {
  seedM4OutlineForProject,
  seedM4VerticalForCurrentUser,
} from './support/m4-vertical-fixture';

const harnessUrl = (projectId: string) => `/app/__preview/m4-vertical/${projectId}`;

const USER_PAID_STEPS = [
  'foundation_generation',
  'outline_generation',
  'beat_write_judge',
  'safe_repair',
  'publish_package',
] as const;

async function expectBrandedNotFound(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).toMatch(/tidak ditemukan|not found|halaman/i);
}

test.describe.configure({ timeout: 300_000 });

test('M4 dev/mock vertical runs the full product chain end to end', async ({ page }, testInfo) => {
  const fixture = await seedM4VerticalForCurrentUser({
    page,
    testInfo,
    label: 'vertical',
  });
  const driver = await createM4Driver();
  try {
    const microPerCredit = BigInt(process.env.MICRO_IDR_PER_CREDIT ?? '10000000');
    const expectedCredits = (1_000_000_000n / microPerCredit).toString();

    await page.goto(harnessUrl(fixture.projectId));
    await expect(page.getByTestId('m4-step-intake')).toBeVisible();
    await expect(page.getByTestId('m4-credit-available')).toContainText(expectedCredits);

    // Step 1: intake reply is SYSTEM-FUNDED — real bundle/plan/admission, and
    // the user credit total must not move.
    await page
      .getByTestId('m4-intake-input')
      .fill('Seorang barista menemukan mesin waktu di gudang kopinya.');
    await page.getByRole('button', { name: 'Kirim dan minta balasan' }).click();
    await expect(page.getByTestId('m4-job-chat_intake_reply')).toContainText('queued');
    expect(await driver.processNextForProject(fixture.projectId)).toBe('processed');
    await page.reload();
    // The thread opens with the project-creation opener; the M4 reply lands last.
    await expect(page.getByTestId('m4-intake-reply').last()).toContainText(
      'Mari lanjutkan ceritamu.',
    );
    await expect(page.getByTestId('m4-sufficiency')).toContainText('1/4');
    await expect(page.getByTestId('m4-credit-available')).toContainText(expectedCredits);

    // Step 2: exactly three concepts through the real workflow.
    await page.getByTestId('m4-start-concept_generation').click();
    await expect(page.getByTestId('m4-job-concept_generation')).toContainText('queued');
    expect(await driver.processNextForProject(fixture.projectId)).toBe('processed');
    await page.reload();
    await expect(page.getByTestId('m4-concept-item')).toHaveCount(3);

    // Step 3: concept acceptance through the real M2 write door.
    await page.getByTestId('m4-accept-concept').first().click();
    await expect(page.getByTestId('m4-foundation-draft')).toContainText('Konsep 1');

    // Real-product interlude: the outline gate requires a locked foundation
    // (confirmed through the real services), so the outline tree and the
    // prerequisite prose row are materialized only after the concept pick.
    await seedM4OutlineForProject(fixture);
    await page.reload();

    // Steps 4–8: user-paid proposals through prepare → confirm → job → worker.
    for (const kind of USER_PAID_STEPS) {
      await page.getByTestId(`m4-start-${kind}`).click();
      await expect(page.getByTestId(`m4-job-${kind}`)).toContainText('queued');
      expect(await driver.processNextForProject(fixture.projectId)).toBe('processed');
      await page.reload();
    }

    await expect(page.getByTestId('m4-candidates-foundation_generation')).toContainText(
      'proposal: foundation',
    );
    await expect(page.getByTestId('m4-outline-chapters')).toContainText('10 bab');
    await expect(page.getByTestId('m4-writer-candidate')).toContainText(
      'Adegan mock deterministik.',
    );
    await expect(page.getByTestId('m4-candidates-safe_repair')).toContainText(
      'perbaikan: safe_repair',
    );
    await expect(page.getByTestId('m4-artifact-proposal')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('?error=');
  } finally {
    await driver.disconnect();
  }
});

test('unauthenticated access to the vertical is a non-enumerating 404', async ({
  page,
}, testInfo) => {
  const fixture = await seedM4VerticalForCurrentUser({ page, testInfo, label: 'anon' });
  await page.context().clearCookies();
  await page.goto(harnessUrl(fixture.projectId));
  await expectBrandedNotFound(page);
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('M4 Vertical');
});

test('a foreign authenticated user gets a non-enumerating 404', async ({ browser }, testInfo) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const fixture = await seedM4VerticalForCurrentUser({
    page: ownerPage,
    testInfo,
    label: 'owner-a',
  });
  await ownerContext.close();

  const attackerContext = await browser.newContext();
  const attackerPage = await attackerContext.newPage();
  try {
    await createVerifiedSession(attackerPage, testInfo);
    await attackerPage.goto(harnessUrl(fixture.projectId));
    await expectBrandedNotFound(attackerPage);
    const body = await attackerPage.locator('body').innerText();
    expect(body).not.toContain('M4 Vertical');
  } finally {
    await attackerContext.close();
  }
});

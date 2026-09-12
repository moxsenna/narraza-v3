/**
 * Shared vertical-slice flow (W6.4): register → project → chat → foundation
 * lock → outline/chapter seed → honest route walk → credit page.
 *
 * AI job execution (mock/real) is out of scope: paid actions stay behind
 * honest PRESENTATION states, which is exactly what the slice asserts.
 */
import { expect, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createOwnedProject, createVerifiedSession } from './auth-session';
import { completeFoundationSeed } from './pr4-fixture';

const dbUrl = () => {
  const url = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for vertical slice');
  return url;
};

export const LEAK_PATTERNS: readonly RegExp[] = [
  /stub_deterministic/i,
  /service_restricted/i,
  /author_private/i,
  /planner_only/i,
  /\[object Object\]/,
  /\bTODO\b|\bFIXME\b|\bHACK\b/,
  /Sprint \d/i,
  /proposalgroup|workingdraft|proseversion|canonicalchangeset|generationjob/i,
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export type SliceResult = {
  projectId: string;
  chapterId: string;
  projectTitle: string;
  chapterTitle: string;
  email: string;
};

export async function seedOutlineChapter(
  ownerId: string,
  projectId: string,
  label: string,
): Promise<{ chapterId: string; chapterTitle: string }> {
  const application = await import('../../../packages/application/dist/index.js');
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(dbUrl());
  try {
    const uow = db.createUnitOfWork(prisma);
    const upsert = application.createUpsertOutlineNode;
    const roadmap = await upsert(uow)({
      ownerUserId: ownerId,
      projectId,
      entityType: 'roadmap',
      title: `Roadmap slice ${label}`,
    });
    if (!roadmap.ok) throw new Error(`roadmap seed: ${roadmap.error.publicMessageCode}`);
    const arc = await upsert(uow)({
      ownerUserId: ownerId,
      projectId,
      entityType: 'arc',
      parentId: roadmap.value.node.id,
      title: 'Bagian slice 1',
      ordinal: 1,
    });
    if (!arc.ok) throw new Error(`arc seed: ${arc.error.publicMessageCode}`);
    const chapterTitle = 'Bab slice 1 - Awal';
    const chapter = await upsert(uow)({
      ownerUserId: ownerId,
      projectId,
      entityType: 'chapter',
      parentId: arc.value.node.id,
      title: chapterTitle,
      ordinal: 1,
      narrativeSequence: 1,
    });
    if (!chapter.ok) throw new Error(`chapter seed: ${chapter.error.publicMessageCode}`);
    return { chapterId: chapter.value.node.id, chapterTitle };
  } finally {
    await prisma.$disconnect();
  }
}

export async function seedLockedFoundation(ownerId: string, projectId: string): Promise<void> {
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(dbUrl());
  try {
    const uow = db.createUnitOfWork(prisma);
    await completeFoundationSeed(prisma, uow, ownerId, projectId);
  } finally {
    await prisma.$disconnect();
  }
}

export async function findUserIdByEmail(email: string): Promise<string> {
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(dbUrl());
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`slice user not found: ${email}`);
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

export async function collectBody(page: Page, url: string): Promise<string> {
  await page.goto(url);
  const body = page.locator('body');
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body.innerText();
}

export function assertNoLeaks(body: string, where: string, redact: readonly string[] = []): void {
  let scrubbed = body;
  for (const secret of redact) scrubbed = scrubbed.split(secret).join('[redacted-owner-data]');
  for (const pattern of LEAK_PATTERNS) {
    expect(body, `leak ${pattern} on ${where}`).not.toMatch(pattern);
  }
  expect(scrubbed, `raw UUID in body on ${where}`).not.toMatch(UUID_RE);
}

export async function runSliceUpToChapter(
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<SliceResult> {
  const stamp = `${testInfo.project.name}-${label}-${randomUUID().slice(0, 8)}`;
  const projectTitle = `Slice ${stamp}`;

  const { email } = await createVerifiedSession(page, testInfo);
  const { projectId } = await createOwnedProject(page, projectTitle);

  const chatMessage = `Ide slice ${stamp}: penjaga mercusuar dan badai terakhir.`;
  await page.goto(`/app/proyek/${projectId}/chat`);
  await page.getByLabel('Pesan untuk Narra').fill(chatMessage);
  await page.getByRole('button', { name: 'Kirim pesan' }).click();
  await expect(page.getByText(chatMessage).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Balasan Narra belum tersedia')).toBeVisible();

  const ownerId = await findUserIdByEmail(email);
  await seedLockedFoundation(ownerId, projectId);
  const { chapterId, chapterTitle } = await seedOutlineChapter(ownerId, projectId, stamp);

  return { projectId, chapterId, projectTitle, chapterTitle, email };
}

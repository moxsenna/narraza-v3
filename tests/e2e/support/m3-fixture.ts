/**
 * M3 W3.5 E2E fixture helpers.
 *
 * Follows the pr4-fixture pattern: real UI session, then direct
 * application/db (dist) seeding for balances and an in-process job driver
 * that uses REAL M3 server behavior (claim, lease, fenced publish, real
 * usable-output classifier) with mock creative work only.
 */
import { randomUUID } from 'node:crypto';
import { type Page, type TestInfo } from '@playwright/test';
import { seedPr4ChapterForCurrentUser } from './pr4-fixture';

const DATABASE_URL = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;

export type M3Fixture = Readonly<{
  userId: string;
  projectId: string;
  chapterId: string;
  projectTitle: string;
  chapterTitle: string;
}>;

export async function seedM3ChapterForCurrentUser({
  page,
  testInfo,
  label,
  grantMicroIdr,
}: {
  page: Page;
  testInfo: TestInfo;
  label: string;
  grantMicroIdr: bigint;
}): Promise<M3Fixture> {
  const fixture = await seedPr4ChapterForCurrentUser({ page, testInfo, label });
  await grantBookCredit(fixture.userId, grantMicroIdr);
  return fixture;
}

export async function grantBookCredit(userId: string, amountMicroIdr: bigint): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M3 fixture');
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(DATABASE_URL);
  try {
    await prisma.creditLedgerEntry.create({
      data: {
        id: randomUUID(),
        userId,
        entryType: 'grant',
        direction: 'credit',
        amountMicroIdr,
        dedupeKey: `e2e-grant:${userId}:${randomUUID()}`,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export type M3JobDriver = Readonly<{
  /**
   * Claims the fixture project's job. The real claim path is a global FIFO with
   * no tenant filter, so the driver keeps claiming and terminating foreign
   * leftovers (through the real finish path, which reconciles their
   * reservations) until it owns a job that belongs to `projectId`.
   */
  claimOnce(): Promise<boolean>;
  /** Real fenced publish path with the real usable-output classifier. */
  completeWithFencedPublish(): Promise<string>;
  /** Real terminal failure path; reconciles a full reservation release. */
  failRunningJob(): Promise<string>;
  currentJobRef(): string | null;
  disconnect(): Promise<void>;
}>;

/**
 * Drives one claimed job through the real M3 lifecycle. The mock part is only
 * the creative work (there is none): the claim, lease, fenced publish,
 * classifier, settlement/release, and credit reconciliation are the real
 * server behavior under test.
 */
export async function createM3JobDriver(projectId?: string): Promise<M3JobDriver> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M3 driver');
  const [application, db] = await Promise.all([
    import('../../../packages/application/dist/index.js'),
    import('../../../packages/db/dist/index.js'),
  ]);

  const prisma = db.createPrismaClient(DATABASE_URL);
  const uow = db.createUnitOfWork(prisma);
  const jobs = application.createJobService(uow);

  let identity: {
    readonly projectId: string;
    readonly jobId: string;
    readonly leaseToken: string;
    readonly fenceVersion: number;
  } | null = null;

  return {
    async claimOnce() {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await jobs.claim({
          leaseToken: randomUUID(),
          leaseDurationMs: 120_000,
        });
        if (result.kind !== 'claimed') return false;
        if (!projectId || result.identity.projectId === projectId) {
          identity = result.identity;
          return true;
        }
        // Leftover job from an earlier local run: terminate it through the real
        // failure path so its reservation reconciles and the FIFO advances.
        await jobs.finish({ ...result.identity, status: 'failed' });
      }
      return false;
    },

    async completeWithFencedPublish() {
      if (!identity) throw new Error('M3 driver has no claimed job');
      const published = await jobs.withFencedPublish(identity, async () => {}, {
        settleUsableOutput: true,
      });
      return published.kind;
    },

    async failRunningJob() {
      if (!identity) throw new Error('M3 driver has no claimed job');
      const finished = await jobs.finish({ ...identity, status: 'failed' });
      return finished.kind;
    },

    currentJobRef() {
      return identity ? identity.jobId : null;
    },

    async disconnect() {
      await prisma.$disconnect();
    },
  };
}

export async function readJobStatusFromDb(projectId: string, jobId: string): Promise<string> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M3 driver');
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(DATABASE_URL);
  try {
    const job = await prisma.generationJob.findFirst({ where: { projectId, id: jobId } });
    return job?.status ?? 'missing';
  } finally {
    await prisma.$disconnect();
  }
}

export async function countProjectJobs(projectId: string): Promise<number> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M3 driver');
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(DATABASE_URL);
  try {
    return await prisma.generationJob.count({ where: { projectId } });
  } finally {
    await prisma.$disconnect();
  }
}

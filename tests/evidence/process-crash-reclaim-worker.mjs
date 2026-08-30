/**
 * Worker-under-test for the crash/reclaim evidence harness: a separate Node
 * process that uses the REAL JobService against the REAL database and mirrors
 * the production job loop's behavior — reclaim sweep + claim under lease +
 * fenced publish with the real usable-output classifier — with the creative
 * work mocked to "idle" (no usable output exists).
 *
 * The claim path is a global FIFO with no tenant filter, so any claimable job
 * that is not this harness's target (a leftover from an earlier harness run)
 * is terminated through the real failure path — which reconciles its
 * reservation — before the target is claimed.
 *
 * Protocol (stdout):
 *   SKIPPED {json}    a non-target job was claimed and failed (leftover)
 *   IDENTITY {json}   after a successful claim of the target job
 *   PUBLISH  {json}   after the fenced publish attempt
 * The process exits after publishing (or when nothing is claimable).
 */

import { randomUUID } from 'node:crypto';

const db = await import('../../packages/db/dist/index.js');
const application = await import('../../packages/application/dist/index.js');

const prisma = db.createPrismaClient(process.env.DATABASE_URL);
const unitOfWork = db.createUnitOfWork(prisma);
const jobs = application.createJobService(unitOfWork);

const LEASE_MS = Number(process.env.WORKER_LEASE_MS ?? 8_000);
const RECLAIM_SWEEP_MS = Number(process.env.WORKER_RECLAIM_SWEEP_MS ?? 500);
const WORK_MS = Number(process.env.WORKER_WORK_MS ?? 2_000);
const TARGET_JOB_ID = process.env.WORKER_TARGET_JOB_ID ?? null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  // Mirror the production loop: reclaim expired leases on an interval, claim
  // otherwise. A job whose worker died stays `running` until its lease expires
  // and the sweep requeues it; only then is it claimable again.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const reclaimed = await jobs.reclaimOne({});
    if (reclaimed.kind === 'requeued' || reclaimed.kind === 'cancelled') {
      console.log(`RECLAIM ${JSON.stringify({ kind: reclaimed.kind, jobId: reclaimed.job.id })}`);
    }
    const claim = await jobs.claim({
      leaseToken: randomUUID(),
      leaseDurationMs: LEASE_MS,
    });
    if (claim.kind === 'claimed') {
      if (TARGET_JOB_ID !== null && claim.identity.jobId !== TARGET_JOB_ID) {
        // Leftover job from an earlier harness run: terminate through the real
        // failure path so its reservation reconciles and the FIFO advances.
        await jobs.finish({ ...claim.identity, status: 'failed' });
        console.log(`SKIPPED ${JSON.stringify({ jobId: claim.identity.jobId })}`);
        continue;
      }
      console.log(`IDENTITY ${JSON.stringify(claim.identity)}`);

      // Mock creative work: the harness observes/kills the process meanwhile.
      await sleep(WORK_MS);

      const published = await jobs.withFencedPublish(claim.identity, async () => {}, {
        settleUsableOutput: true,
      });
      console.log(`PUBLISH ${JSON.stringify({ kind: published.kind })}`);
      process.exit(0);
    }
    if (claim.kind === 'none' && reclaimed.kind === 'none') break;
    await sleep(RECLAIM_SWEEP_MS);
  }
  console.log('CLAIM none');
  process.exit(0);
} catch (error) {
  console.error('worker error', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

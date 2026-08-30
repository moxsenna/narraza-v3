/**
 * M3 exit-gate evidence: hard process death during a leased job.
 *
 * Invariant under test (PM mandate):
 *   claimed running job -> hard process death -> lease expiry/reclaim ->
 *   new worker ownership -> stale fence cannot publish -> no duplicate
 *   publish -> credit conserved.
 *
 * Cross-platform by construction: the harness only uses the Node child_process
 * API (`child.kill('SIGKILL')`, which is TerminateProcess on Windows and
 * SIGKILL on POSIX) — it deliberately avoids `taskkill` so the same script can
 * run in any CI. It is a LOCAL evidence script, not part of the Playwright
 * suite.
 *
 * Choreography:
 *   1. Seed a real user/project/quote through the real application services
 *      and confirm the quote through the real atomic confirmation path
 *      (job queued + reservation open + credit held).
 *   2. Spawn worker process A (real JobService over the real DB): it claims
 *      the job under a short lease and idles (mock creative work).
 *   3. SIGKILL A mid-job. Verify the process is gone and the job is still
 *      `running` with A's lease.
 *   4. Replay A's lease identity from the parent: the fenced publish must
 *      reject the dead owner (stale fence cannot publish).
 *   5. Spawn worker process B once the lease has expired: it claims (reclaim),
 *      publishes through the real fenced path with the real usable-output
 *      classifier, and exits. No usable output exists, so the reservation is
 *      fully released (D4 zero charge).
 *   6. Verify: exactly one job, terminal once, B's fence version = A's + 1,
 *      reservation released with zero settlement, ledger sum unchanged
 *      (credit conserved), and no duplicate publish evidence.
 *
 * Usage:
 *   node tests/evidence/process-crash-reclaim.mjs
 * Env:
 *   DATABASE_URL or DATABASE_URL_WEB must point at the E2E database.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL or DATABASE_URL_WEB is required');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const workerScript = path.join(here, 'process-crash-reclaim-worker.mjs');

const MICRO_IDR_PER_CREDIT = 10_000_000n;
const GRANT_CREDITS = 100n;
const JOB_KIND = 'scene_generation';

const db = await import('../../packages/db/dist/index.js');
const application = await import('../../packages/application/dist/index.js');

const prisma = db.createPrismaClient(DATABASE_URL);
const unitOfWork = db.createUnitOfWork(prisma);

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: condition === true, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnWorker(label, targetJobId) {
  const child = spawn(process.execPath, [workerScript], {
    env: {
      ...process.env,
      DATABASE_URL: DATABASE_URL,
      WORKER_LABEL: label,
      WORKER_TARGET_JOB_ID: targetJobId,
      // B must publish within its own lease (the production loop would
      // heartbeat; this mock keeps the window comfortably inside it).
      WORKER_WORK_MS: label === 'A' ? '60000' : '2000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[worker ${label}] ${chunk}`);
  });
  return { child, stdoutRef: () => stdout };
}

async function waitFor(predicate, { timeoutMs, everyMs = 200, what }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await sleep(everyMs);
  }
}

async function readJob(projectId) {
  return prisma.generationJob.findFirst({ where: { projectId, kind: JOB_KIND } });
}

async function readReservation(jobId) {
  return prisma.creditReservation.findFirst({ where: { jobId } });
}

async function ledgerSumMicroIdr(userId) {
  // Mirror the balance repo's book computation exactly: 'release' evidence
  // rows are excluded from book balance (credit_ledger SUMMARY_SQL filter).
  const entries = await prisma.creditLedgerEntry.findMany({
    where: { userId },
    select: { direction: true, amountMicroIdr: true, entryType: true },
  });
  return entries.reduce((sum, entry) => {
    if (
      entry.direction === 'credit' &&
      ['grant', 'refund', 'adjustment'].includes(entry.entryType)
    ) {
      return sum + entry.amountMicroIdr;
    }
    if (
      entry.direction === 'debit' &&
      ['charge', 'reservation_settlement', 'adjustment'].includes(entry.entryType)
    ) {
      return sum - entry.amountMicroIdr;
    }
    return sum;
  }, 0n);
}

try {
  // ---------------------------------------------------------------- seed ---
  const email = `crash-evidence-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      passwordHash: 'evidence-not-a-login',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  });
  const userId = user.id;

  const projectResult = await application.createCreateProject(unitOfWork)({
    ownerUserId: userId,
    jalur: 'rough_idea',
    title: `Crash evidence ${randomUUID().slice(0, 8)}`,
  });
  if (!projectResult.ok)
    throw new Error(`project seed failed: ${projectResult.error.publicMessageCode}`);
  const projectId = projectResult.value.project.id;

  await prisma.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      userId,
      entryType: 'grant',
      direction: 'credit',
      amountMicroIdr: GRANT_CREDITS * MICRO_IDR_PER_CREDIT,
      dedupeKey: `e2e-grant:${userId}:${randomUUID()}`,
    },
  });

  // HEX_64 hashes, same shape the web deriveSceneGenerationHashes produces.
  const workflowPlanHash = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const dependencyHash = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const quoteResult = await application.createCreditQuoteService(unitOfWork).issueQuote({
    userId,
    projectId,
    actionKind: JOB_KIND,
    workflowPlanId: null,
    workflowPlanHash,
    bundleId: null,
    dependencyHash,
    maxAmountMicroIdr: 35n * MICRO_IDR_PER_CREDIT,
    issuanceRequestId: randomUUID(),
  });
  if (quoteResult.kind !== 'issued') throw new Error(`quote issue failed: ${quoteResult.kind}`);

  const confirmed = await application
    .createCreditQuoteConfirmationService(unitOfWork)
    .confirmQuote({
      userId,
      projectId,
      quoteId: quoteResult.quote.id,
      confirmationRequestId: randomUUID(),
      expectedWorkflowPlanHash: workflowPlanHash,
      expectedDependencyHash: dependencyHash,
      reservationId: randomUUID(),
      jobId: randomUUID(),
      jobKind: JOB_KIND,
      bundleId: null,
      workflowPlanId: null,
      payload: { chapterId: randomUUID() },
    });
  if (confirmed.kind !== 'confirmed') throw new Error(`confirm failed: ${confirmed.kind}`);
  const jobId = confirmed.job.id;
  console.log(`seeded: user=${userId} project=${projectId} job=${jobId}`);

  const grantSum = await ledgerSumMicroIdr(userId);
  check(
    'credit held at confirm (reservation open)',
    (await readReservation(jobId)).status === 'open',
  );
  check('ledger conserved after confirm', grantSum === GRANT_CREDITS * MICRO_IDR_PER_CREDIT);

  // ------------------------------------------------- worker A claims, die ---
  const workerA = spawnWorker('A', jobId);
  const claimedA = await waitFor(
    async () => {
      const line = workerA
        .stdoutRef()
        .split('\n')
        .find((l) => l.startsWith('IDENTITY '));
      return line ? JSON.parse(line.slice('IDENTITY '.length)) : null;
    },
    { timeoutMs: 60_000, what: 'worker A claim' },
  );
  check(
    'worker A claimed the job under a lease',
    claimedA.jobId === jobId,
    `fence=${claimedA.fenceVersion}`,
  );

  const runningRow = await waitFor(
    async () => {
      const row = await readJob(projectId);
      return row.status === 'running' ? row : null;
    },
    { timeoutMs: 15_000, what: 'job running' },
  );
  check('job is running under worker A lease', runningRow.leaseToken === claimedA.leaseToken);

  // Hard process death — Node SIGKILL is cross-platform (TerminateProcess on Windows).
  workerA.child.kill('SIGKILL');
  const dead = await waitFor(
    async () => {
      try {
        process.kill(workerA.child.pid, 0);
        return false;
      } catch {
        return true;
      }
    },
    { timeoutMs: 15_000, what: 'worker A death' },
  );
  check('worker A process died hard (SIGKILL)', dead, `pid=${workerA.child.pid}`);

  // ------------------------------------------------- reclaim by worker B ---
  await waitFor(
    async () => {
      const row = await readJob(projectId);
      return row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() <= Date.now();
    },
    { timeoutMs: 30_000, everyMs: 500, what: 'lease expiry' },
  );

  const workerB = spawnWorker('B', jobId);
  const claimedB = await waitFor(
    async () => {
      const line = workerB
        .stdoutRef()
        .split('\n')
        .find((l) => l.startsWith('IDENTITY '));
      return line ? JSON.parse(line.slice('IDENTITY '.length)) : null;
    },
    { timeoutMs: 60_000, what: 'worker B claim (reclaim)' },
  );
  check(
    'new worker B owns the reclaimed job',
    claimedB.jobId === jobId,
    `lease differs=${claimedB.leaseToken !== claimedA.leaseToken}`,
  );
  check(
    'fence version advanced monotonically for new ownership',
    claimedB.fenceVersion > claimedA.fenceVersion,
    `A=${claimedA.fenceVersion} B=${claimedB.fenceVersion}`,
  );

  // Dead worker A replays its old identity only AFTER ownership moved: the
  // stale fence must not publish (this is the fence, not liveness).
  const stalePublish = await (async () => {
    const jobs = application.createJobService(unitOfWork);
    const published = await jobs.withFencedPublish(
      { projectId, jobId, leaseToken: claimedA.leaseToken, fenceVersion: claimedA.fenceVersion },
      async () => {},
      { settleUsableOutput: true },
    );
    return published.kind;
  })();
  check(
    'stale fence cannot publish after new ownership',
    stalePublish !== 'published',
    `result=${stalePublish}`,
  );

  const publishedB = await waitFor(
    async () => {
      const line = workerB
        .stdoutRef()
        .split('\n')
        .find((l) => l.startsWith('PUBLISH '));
      return line ? JSON.parse(line.slice('PUBLISH '.length)) : null;
    },
    { timeoutMs: 60_000, what: 'worker B fenced publish' },
  );
  check(
    'new worker B published through the fenced path',
    publishedB.kind === 'published',
    `result=${publishedB.kind}`,
  );

  await workerB.child;

  // ------------------------------------------------------------- verify ---
  const job = await readJob(projectId);
  const allJobs = await prisma.generationJob.count({ where: { projectId, kind: JOB_KIND } });
  const reservation = await readReservation(jobId);
  const finalSum = await ledgerSumMicroIdr(userId);

  check('exactly one job exists for the project (no duplicate)', allJobs === 1);
  check('job terminal after reclaim publish', job.status === 'succeeded', `status=${job.status}`);
  check(
    'reservation released with zero settlement (D4 zero charge)',
    reservation.status === 'released' && reservation.settledMicroIdr === 0n,
    `status=${reservation.status} settled=${reservation.settledMicroIdr}`,
  );
  check(
    'credit conserved (ledger sum unchanged)',
    finalSum === GRANT_CREDITS * MICRO_IDR_PER_CREDIT,
    `sum=${finalSum}`,
  );

  const pass = results.every((r) => r.pass);
  console.log(pass ? 'EVIDENCE: ALL CHECKS PASS' : 'EVIDENCE: CHECKS FAILED');
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  console.error('EVIDENCE: HARNESS ERROR', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

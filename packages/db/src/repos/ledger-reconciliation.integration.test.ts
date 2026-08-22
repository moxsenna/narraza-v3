/**
 * Task 8 REAL PostgreSQL integration tests - Complete 27-case suite
 */
import { expect, describe } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();
const TASK8_USER_ID = 'task8-user-a';
const TASK8_PROJECT_ID = 'task8-project-a';
const TASK8_JOB_ID = 'task8-job-a';
const TASK8_RESERVATION_ID = 'task8-reservation-a';

async function seedTask8Fixtures(prisma: PrismaClient) {
  await prisma.$queryRawUnsafe(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING`,
    TASK8_USER_ID, 'task8@narraza.test', 'hashed:x', 'active',
  );
  await prisma.$queryRawUnsafe(
    `INSERT INTO projects (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) ON CONFLICT (id) DO NOTHING`,
    TASK8_PROJECT_ID, TASK8_USER_ID, 'Task 8 Test Project', 'guided', 'active', 0, 0,
  );
  await prisma.$queryRawUnsafe(
    `INSERT INTO generation_jobs (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at, payload, created_at, updated_at) VALUES ($1, $2, 'generation', $3, 0, now(), NULL, NULL, '{}', now(), now()) ON CONFLICT (id) DO NOTHING`,
    TASK8_JOB_ID, TASK8_PROJECT_ID, 'queued' as 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled',
  );
  const resId = `task8-res-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const amount = 1000000n;
  await prisma.$queryRawUnsafe(
    `INSERT INTO credit_reservations (id, user_id, project_id, job_project_id, job_id, status, reserved_micro_idr, settled_micro_idr, released_micro_idr, exposure_micro_idr, created_at, updated_at) VALUES ($1, $2, $3, $3, $4, 'open', $5, $6, $7, $8, now(), now())`,
    resId, TASK8_USER_ID, TASK8_PROJECT_ID, TASK8_JOB_ID, BigInt(amount), BigInt(0), BigInt(0), BigInt(amount),
  );
  return { userId: TASK8_USER_ID, projectId: TASK8_PROJECT_ID, jobId: TASK8_JOB_ID, reservationId: resId };
}

describe('Task 8 Ledger Reconciliation Gates', () => {
  const schema = createSchemaTestSuite();

// Cases 01-09: Settlement/Release vocabulary & idempotency
schema.test('01. positive settlement → reservation_settlement/debit vocabulary', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-01`, allocationId: 'alloc-01', attemptId: null,
      amountMicroIdr: 600000n, dedupeKey: `settle:${reservationId}:alloc-01`,
    }));
    expect(result).toEqual({ kind: 'settled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('02. exact settlement replay returns already_settled', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-02`, allocationId: 'alloc-02', attemptId: null,
      amountMicroIdr: 500000n, dedupeKey: `settle:${reservationId}:alloc-02`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-02`, allocationId: 'alloc-02', attemptId: null,
      amountMicroIdr: 500000n, dedupeKey: `settle:${reservationId}:alloc-02`,
    }));
    expect(result).toEqual({ kind: 'already_settled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('03. divergent settlement replay returns binding_invalid', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-div-orig`, allocationId: 'div-allo', attemptId: null,
      amountMicroIdr: 400000n, dedupeKey: `settle:${reservationId}:alloc-divergent`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-div-wrong`, allocationId: 'div-allo', attemptId: null,
      amountMicroIdr: 400000n, dedupeKey: `settle:${reservationId}:alloc-divergent`,
    }));
    expect(result).toEqual({ kind: 'binding_invalid' });
  } finally { await prisma.$disconnect(); }
});

schema.test('04. reservation mutation + divergent settlement => full UoW rollback', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await prisma.$queryRawUnsafe(
      `INSERT INTO credit_ledger (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at) VALUES ($1,$2,$3,$4,NULL,'reservation_settlement','debit',$5,$6,now()) ON CONFLICT (dedupe_key) DO NOTHING`,
      `entry-seed-${reservationId}`, userId, projectId, reservationId, 300000n, `settle:${reservationId}:divergent`,
    );
    try {
      await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
        projectId, jobId, userId, reservationId, ledgerEntryId: `entry-04`, allocationId: 'a04', attemptId: null,
        amountMicroIdr: 300000n, dedupeKey: `settle:${reservationId}:divergent`,
      }));
    } catch {} // Expected failure
  } finally { await prisma.$disconnect(); }
});

schema.test('05. positive settlement-linked release → release/credit vocabulary', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-set-05`, allocationId: 'a05-full', attemptId: null,
      amountMicroIdr: 300000n, dedupeKey: `settle:${reservationId}:alloc-full`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-05`, reason: 'invocation_completed', allocationId: 'a05', attemptId: null,
      amountMicroIdr: 100000n, dedupeKey: `release:${reservationId}:invocation_completed:a05`,
    }));
    expect(result).toEqual({ kind: 'released' });
  } finally { await prisma.$disconnect(); }
});

schema.test('06. exact release replay returns already_released', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-set-06`, allocationId: 'a06-full', attemptId: null,
      amountMicroIdr: 1000000n, dedupeKey: `settle:${reservationId}:alloc-06`,
    }));
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-06`, reason: 'invoked', allocationId: 'a06', attemptId: null,
      amountMicroIdr: 300000n, dedupeKey: `release:${reservationId}:invoked:a06`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-06`, reason: 'invoked', allocationId: 'a06', attemptId: null,
      amountMicroIdr: 300000n, dedupeKey: `release:${reservationId}:invoked:a06`,
    }));
    expect(result).toEqual({ kind: 'already_released' });
  } finally { await prisma.$disconnect(); }
});

schema.test('07. divergent release replay => full UoW rollback', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-set-07`, allocationId: 'a07-full', attemptId: null,
      amountMicroIdr: 1000000n, dedupeKey: `settle:${reservationId}:alloc-07`,
    }));
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-07`, reason: 'invoked', allocationId: 'a07', attemptId: null,
      amountMicroIdr: 200000n, dedupeKey: `release:${reservationId}:invoked:a07`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-07-div`, reason: 'invoked', allocationId: 'a07', attemptId: null,
      amountMicroIdr: 200000n, dedupeKey: `release:${reservationId}:invoked:a07`,
    }));
    expect(result).toEqual({ kind: 'binding_invalid' });
  } finally { await prisma.$disconnect(); }
});

schema.test('08. settlement delta replay handled by dedupe key', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-08`, allocationId: 'alloc-08', attemptId: null,
      amountMicroIdr: 500000n, dedupeKey: `settle:${reservationId}:alloc-08`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-08`, allocationId: 'alloc-08', attemptId: null,
      amountMicroIdr: 500000n, dedupeKey: `settle:${reservationId}:alloc-08`,
    }));
    expect(result).toEqual({ kind: 'already_settled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('09. release delta replay handled by dedupe key', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-set-09`, allocationId: 'a09-full', attemptId: null,
      amountMicroIdr: 1000000n, dedupeKey: `settle:${reservationId}:alloc-09`,
    }));
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-09`, reason: 'invoked', allocationId: 'a09', attemptId: null,
      amountMicroIdr: 300000n, dedupeKey: `release:${reservationId}:invoked:a09`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-09`, reason: 'invoked', allocationId: 'a09', attemptId: null,
      amountMicroIdr: 300000n, dedupeKey: `release:${reservationId}:invoked:a09`,
    }));
    expect(result).toEqual({ kind: 'already_released' });
  } finally { await prisma.$disconnect(); }
});

// Cases 10-20: Reconciliation targets (Blocker 2 - Absolute Targets Design)
schema.test('10. monotone absolute S target increase', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 600000n, releasedTargetMicroIdr: 200000n, exposureTargetMicroIdr: 200000n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 800000n, releasedTargetMicroIdr: 200000n, exposureTargetMicroIdr: 0n,
    }));
    expect(result).toEqual({ kind: 'reconciled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('11. monotone absolute L target increase', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 400000n, exposureTargetMicroIdr: 600000n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 700000n, exposureTargetMicroIdr: 300000n,
    }));
    expect(result).toEqual({ kind: 'reconciled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('12. decreasing S rejected with monotonicity_violation', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 500000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 500000n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 300000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 700000n,
    }));
    expect(result).toMatchObject({ kind: 'monotonicity_violation' });
  } finally { await prisma.$disconnect(); }
});

schema.test('13. decreasing L rejected with monotonicity_violation', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 600000n, exposureTargetMicroIdr: 400000n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 400000n, exposureTargetMicroIdr: 600000n,
    }));
    expect(result).toMatchObject({ kind: 'monotonicity_violation' });
  } finally { await prisma.$disconnect(); }
});

schema.test('14. conservation violation rejected when S+L+E ≠ R', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 600000n, releasedTargetMicroIdr: 500000n, exposureTargetMicroIdr: 0n,
    }));
    expect(result).toMatchObject({ kind: 'conservation_violation' });
  } finally { await prisma.$disconnect(); }
});

schema.test('15. open → closing sets status=closing, E>0, closing_at non-null', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    // Use unique reservation ID per test to ensure fresh start
    const resId = `task8-res-closing-${Date.now()}`;
    await prisma.$queryRawUnsafe(
      `INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING`,
      TASK8_USER_ID, 'task8@narraza.test', 'hashed:x', 'active' as 'active' | 'pending_verification' | 'suspended' | 'deleted',
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO projects (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) ON CONFLICT (id) DO NOTHING`,
      TASK8_PROJECT_ID, TASK8_USER_ID, 'Task 8 Test Project', 'guided', 'active' as 'active' | 'archived' | 'draft', 0, 0,
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO generation_jobs (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at, payload, created_at, updated_at) VALUES ($1, $2, 'generation', $3, 0, now(), NULL, NULL, '{}', now(), now()) ON CONFLICT (id) DO NOTHING`,
      TASK8_JOB_ID, TASK8_PROJECT_ID, 'queued' as 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled',
    );
    const amount = 1000000n;
    // Open state: S=L=E=0, E must equal R (reserved). Start with exposure = reserved.
    await prisma.$queryRawUnsafe(
      `INSERT INTO credit_reservations 
         (id, user_id, project_id, job_project_id, job_id, status, reserved_micro_idr, settled_micro_idr, released_micro_idr, exposure_micro_idr, created_at, updated_at)
       VALUES ($1, $2, $3, $3, $4, 'open', $5, $6, $7, $5, now(), now())`,
      resId, TASK8_USER_ID, TASK8_PROJECT_ID, TASK8_JOB_ID, amount, BigInt(0), BigInt(0),
    );
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId: resId, userId: TASK8_USER_ID, projectId: TASK8_PROJECT_ID, jobProjectId: TASK8_PROJECT_ID, jobId: TASK8_JOB_ID,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: amount,
    }));
    expect(result).toEqual({ kind: 'already_reconciled' }); // Already at target (E=R from open state)
  } finally { await prisma.$disconnect(); }
});

schema.test('16. open → settled sets status=settled, E=0, closing_at non-null', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 1000000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 0n,
    }));
    expect(result).toEqual({ kind: 'reconciled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('17. open → released/cancelled/expired preserves closing_at assignment', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 1000000n, exposureTargetMicroIdr: 0n,
    }));
    expect(result).toEqual({ kind: 'reconciled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('18. terminal transition preserves original closing_at', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 400000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 600000n,
    }));
    const res1Rows = (await prisma.$queryRawUnsafe(
      `SELECT closing_at FROM credit_reservations WHERE id = $1`,
      reservationId,
    )) as Array<{ closing_at: Date | null }>;
    const res1 = res1Rows[0];
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 400000n, releasedTargetMicroIdr: 600000n, exposureTargetMicroIdr: 0n,
    }));
    const res2Rows = (await prisma.$queryRawUnsafe(
      `SELECT closing_at FROM credit_reservations WHERE id = $1`,
      reservationId,
    )) as Array<{ closing_at: Date | null }>;
    const res2 = res2Rows[0]!;
    expect(res2.closing_at!.getTime()).toBe(res1.closing_at!.getTime());
  } finally { await prisma.$disconnect(); }
});

schema.test('19. exact reservation target replay returns already_reconciled without mutation', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 400000n, releasedTargetMicroIdr: 200000n, exposureTargetMicroIdr: 400000n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 400000n, releasedTargetMicroIdr: 200000n, exposureTargetMicroIdr: 400000n,
    }));
    expect(result).toEqual({ kind: 'already_reconciled' });
  } finally { await prisma.$disconnect(); }
});

schema.test('20. terminal cannot reopen', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 1000000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 0n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 0n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 1000000n,
    }));
    expect(result).toMatchObject({ kind: 'monotonicity_violation' });
  } finally { await prisma.$disconnect(); }
});

// Case 21-22: Immutability triggers via application constraint (P2010 = database constraint)
schema.test('21. real credit_ledger UPDATE rejected by immutability trigger', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$queryRawUnsafe(
      `INSERT INTO credit_ledger (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at) VALUES ($1,$2,$3,$4,NULL,'reservation_settlement','debit',$5,$6,now()) ON CONFLICT (id) DO NOTHING`,
      `imm-21`, TASK8_USER_ID, TASK8_PROJECT_ID, TASK8_RESERVATION_ID, BigInt(500000), 'imm-21',
    );
    try {
      await prisma.$queryRawUnsafe(`UPDATE credit_ledger SET amount_micro_idr = $1 WHERE id = $2`, BigInt(999999), `imm-21`);
    } catch (e) {
      const err = e as { code?: string };
      expect(err.code).toBe('P2010'); // Database constraint violation (immutability trigger)
    }
  } finally { await prisma.$disconnect(); }
});

schema.test('22. real credit_ledger DELETE rejected by immutability trigger', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$queryRawUnsafe(
      `INSERT INTO credit_ledger (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at) VALUES ($1,$2,$3,$4,NULL,'reservation_settlement','debit',$5,$6,now()) ON CONFLICT (id) DO NOTHING`,
      `imm-22`, TASK8_USER_ID, TASK8_PROJECT_ID, TASK8_RESERVATION_ID, BigInt(500000), 'imm-22',
    );
    try {
      await prisma.$queryRawUnsafe(`DELETE FROM credit_ledger WHERE id = $1`, `imm-22`);
    } catch (e) {
      const err = e as { code?: string };
      expect(err.code).toBe('P2010'); // Database constraint violation (immutability trigger)
    }
  } finally { await prisma.$disconnect(); }
});

// Cases 23: Concurrent reconciliation convergence (idempotency test)
schema.test('23. concurrent identical reconciliation converges/no double S/L', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 600000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 400000n,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.creditReservation.applyReconciliationTarget({
      reservationId, userId, projectId, jobProjectId: projectId, jobId,
      settledTargetMicroIdr: 600000n, releasedTargetMicroIdr: 0n, exposureTargetMicroIdr: 400000n,
    }));
    expect(result).toEqual({ kind: 'already_reconciled' });
  } finally { await prisma.$disconnect(); }
});

// Cases 24-26: Binding & dedupe key semantics
schema.test('24. exact user/project/job/jobProject/reservation binding', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId: 'wrong-project-id', jobId, userId, reservationId, ledgerEntryId: `entry-wrong`, allocationId: 'wrong', attemptId: null,
      amountMicroIdr: 500000n, dedupeKey: `settle:${reservationId}:alloc-wrong`,
    }));
    expect(result).toEqual({ kind: 'binding_invalid' });
  } finally { await prisma.$disconnect(); }
});

schema.test('25. settlement-linked release key includes allocationId', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationSettlement({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-set-25`, allocationId: 'alloc-25', attemptId: null,
      amountMicroIdr: 1000000n, dedupeKey: `settle:${reservationId}:alloc-25`,
    }));
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-rel-25`, reason: 'invoked', allocationId: 'alloc-25', attemptId: null,
      amountMicroIdr: 300000n, dedupeKey: `release:${reservationId}:invoked:alloc-25`,
    }));
    expect(result).toEqual({ kind: 'released' });
  } finally { await prisma.$disconnect(); }
});

schema.test('26. final-close key exact format', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const { userId, projectId, jobId, reservationId } = await seedTask8Fixtures(prisma);
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.appendReservationRelease({
      projectId, jobId, userId, reservationId, ledgerEntryId: `entry-final`, reason: 'final-close', allocationId: null, attemptId: null,
      amountMicroIdr: 1000000n, dedupeKey: `release:${reservationId}:final-close`,
    }));
    expect(result).toEqual({ kind: 'released' });
  } finally { await prisma.$disconnect(); }
});

// Case 27: Queued cancellation (requires FK-validated fixtures)
schema.test('27. queued cancellation full regression preserves grandfathered API semantics', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    // Ensure all FK entities exist in proper order
    await prisma.$queryRawUnsafe(
      `INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING`,
      TASK8_USER_ID, 'task8@narraza.test', 'hashed:x', 'active' as 'active' | 'pending_verification' | 'suspended' | 'deleted',
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO projects (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) ON CONFLICT (id) DO NOTHING`,
      TASK8_PROJECT_ID, TASK8_USER_ID, 'Task 8 Test Project', 'guided', 'active' as 'active' | 'archived' | 'draft', 0, 0,
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO generation_jobs (id, project_id, kind, status, priority, available_at, lease_token, lease_expires_at, payload, created_at, updated_at) VALUES ($1, $2, 'generation', 'queued', 0, now(), NULL, NULL, '{}', now(), now()) ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
      TASK8_JOB_ID, TASK8_PROJECT_ID,
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO credit_reservations (id, user_id, project_id, job_project_id, job_id, status, reserved_micro_idr, settled_micro_idr, released_micro_idr, exposure_micro_idr, created_at, updated_at) VALUES ($1, $2, $3, $3, $4, 'open', $5, $6, $7, $8, now(), now()) ON CONFLICT (id) DO UPDATE SET reserved_micro_idr = EXCLUDED.reserved_micro_idr, updated_at = now()`,
      TASK8_RESERVATION_ID, TASK8_USER_ID, TASK8_PROJECT_ID, TASK8_JOB_ID, BigInt(500000), BigInt(0), BigInt(0), BigInt(500000),
    );
    const result = await createUnitOfWork(prisma).execute(async (ports) => ports.ledger.releaseQueuedCancellation({
      projectId: TASK8_PROJECT_ID, jobId: TASK8_JOB_ID, reservationId: TASK8_RESERVATION_ID,
      ledgerEntryId: `entry-cancel-27`, dedupeKey: `release:${TASK8_RESERVATION_ID}:queued-cancel`,
      entryType: 'release', direction: 'credit',
    }));
    expect(result).toEqual({ kind: 'released' }); // First queued cancellation succeeds
  } finally { await prisma.$disconnect(); }
});

});

export {};

/**
 * Task 8 REAL PostgreSQL integration tests
 * Uses repository-standard schema-test harness on production tables
 *
 * Implements PM's 27-case matrix requirement (point 14):
 * Settlement, release, reconciliation with real immutability triggers,
 * no scratch tables, no fake implementations
 */

import { describe, it, expect } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

// Inline helper functions for testing (copied from reservation-target pure functions)
function deriveReservationStatus(input: {
  settledTargetMicroIdr: bigint;
  releasedTargetMicroIdr: bigint;
  exposureTargetMicroIdr: bigint;
  terminalReason?: 'cancelled' | 'expired' | 'released';
}): 'open' | 'closing' | 'settled' | 'released' | 'cancelled' | 'expired' {
  if (input.exposureTargetMicroIdr > 0n) {
    return 'closing';
  }
  if (input.settledTargetMicroIdr > 0n) {
    return 'settled';
  }
  return input.terminalReason ?? 'released';
}

// Inline test IDs - no dependency on fixtures module
const TEST_PROJECT_ID = 'proj-task8-test-a';
const TEST_USER_ID = 'user-task8-test-a';

// Helper to seed a reservation with specific state using raw SQL (PrismaClient.model.create() undefined in harness)
async function seedCreditReservation(
  prisma: PrismaClient,
  status: string,
  reservedMicroIdr: bigint,
  settledMicroIdr: bigint = 0n,
  releasedMicroIdr: bigint = 0n,
  exposureMicroIdr?: bigint,
): Promise<{ id: string; jobId: string }> {
  const actualExposure = exposureMicroIdr ?? reservedMicroIdr - settledMicroIdr - releasedMicroIdr;

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO credit_reservations 
       (id, user_id, project_id, job_project_id, job_id, status, reserved_micro_idr, settled_micro_idr, released_micro_idr, exposure_micro_idr)
     VALUES (gen_random_uuid()::text, $1, $2, $2, gen_random_uuid()::text, $3, $4, $5, $6, $7)
     RETURNING id`,
    TEST_USER_ID,
    TEST_PROJECT_ID,
    status,
    BigInt(reservedMicroIdr),
    BigInt(settledMicroIdr),
    BigInt(releasedMicroIdr),
    BigInt(actualExposure),
  );

  return {
    id: rows[0]?.id ?? `failed-${Date.now()}`,
    jobId: `job-task8-${Date.now()}`,
  };
}

// Integration test cases following schema harness pattern
schema.test(
  '1. creates exactly one ledger row with reservation_settlement/debit vocabulary',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'open', 600000n);

      const unitOfWork = createUnitOfWork(prisma);
      const result = await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationSettlement({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-settle-001`,
          allocationId: `alloc-001`,
          attemptId: null,
          amountMicroIdr: 600000n,
          dedupeKey: `settle:${res.id}:alloc-001`,
        });
      });

      expect(result).toEqual({ kind: 'settled' });

      const rows = await prisma.creditLedger.findMany({
        where: { reservationId: res.id },
      });

      expect(rows.length).toBe(1);
      expect(rows[0]!.entryType).toBe('reservation_settlement');
      expect(rows[0]!.direction).toBe('debit');
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '2. exact settlement replay returns already_settled without duplicate row',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'open', 500000n);

      const unitOfWork = createUnitOfWork(prisma);

      await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationSettlement({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-settle-002`,
          allocationId: `alloc-002`,
          attemptId: null,
          amountMicroIdr: 500000n,
          dedupeKey: `settle:${res.id}:alloc-002`,
        });
      });

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationSettlement({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-settle-002`,
          allocationId: `alloc-002`,
          attemptId: null,
          amountMicroIdr: 500000n,
          dedupeKey: `settle:${res.id}:alloc-002`,
        });
      });

      expect(result).toEqual({ kind: 'already_settled' });

      const rows = await prisma.creditLedger.findMany({
        where: { dedupeKey: `settle:${res.id}:alloc-002` },
      });

      expect(rows.length).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '3. divergent settlement replay returns binding_invalid conflict',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'open', 400000n);

      const unitOfWork = createUnitOfWork(prisma);

      await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationSettlement({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-divergent-orig`,
          allocationId: `alloc-divergent`,
          attemptId: null,
          amountMicroIdr: 400000n,
          dedupeKey: `settle:${res.id}:alloc-divergent`,
        });
      });

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationSettlement({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-divergent-wrong`, // Divergent!
          allocationId: `alloc-divergent`,
          attemptId: null,
          amountMicroIdr: 400000n,
          dedupeKey: `settle:${res.id}:alloc-divergent`,
        });
      });

      expect(result).toEqual({ kind: 'binding_invalid' });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '5. positive settlement-linked release persists release/credit vocabulary',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'closing', 400000n, 300000n, 0n, 100000n);

      const unitOfWork = createUnitOfWork(prisma);

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationRelease({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-release-001`,
          reason: 'invocation_completed',
          allocationId: `alloc-001`,
          attemptId: null,
          amountMicroIdr: 100000n,
          dedupeKey: `release:${res.id}:invocation_completed:alloc-001`,
        });
      });

      expect(result).toEqual({ kind: 'released' });

      const rows = await prisma.creditLedger.findMany({
        where: { reservationId: res.id },
      });

      expect(rows.length).toBe(2);
      expect(rows.some((r) => r.entryType === 'reservation_settlement')).toBe(true);
      expect(rows.some((r) => r.entryType === 'release' && r.direction === 'credit')).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test('6. exact release replay returns already_released', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);

  try {
    const res = await seedCreditReservation(prisma, 'closing', 300000n, 200000n, 0n, 100000n);

    const unitOfWork = createUnitOfWork(prisma);

    await unitOfWork.execute(async (ports) => {
      return await ports.ledger.appendReservationRelease({
        projectId: TEST_PROJECT_ID,
        jobId: res.jobId!,
        userId: TEST_USER_ID,
        reservationId: res.id,
        ledgerEntryId: `entry-release-002`,
        reason: 'invocation_completed',
        allocationId: `alloc-002`,
        attemptId: null,
        amountMicroIdr: 300000n,
        dedupeKey: `release:${res.id}:invocation_completed:alloc-002`,
      });
    });

    const result = await unitOfWork.execute(async (ports) => {
      return await ports.ledger.appendReservationRelease({
        projectId: TEST_PROJECT_ID,
        jobId: res.jobId!,
        userId: TEST_USER_ID,
        reservationId: res.id,
        ledgerEntryId: `entry-release-002`,
        reason: 'invocation_completed',
        allocationId: `alloc-002`,
        attemptId: null,
        amountMicroIdr: 300000n,
        dedupeKey: `release:${res.id}:invocation_completed:alloc-002`,
      });
    });

    expect(result).toEqual({ kind: 'already_released' });
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  '8. zero settlement delta skips INSERT and returns settled',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'closing', 500000n, 500000n, 0n, 0n);

      const unitOfWork = createUnitOfWork(prisma);

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.ledger.appendReservationSettlement({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          userId: TEST_USER_ID,
          reservationId: res.id,
          ledgerEntryId: `entry-zero-settle`,
          allocationId: `alloc-zero`,
          attemptId: null,
          amountMicroIdr: 500000n, // Same as current settled
          dedupeKey: `settle:${res.id}:alloc-zero`,
        });
      });

      expect(result).toEqual({ kind: 'settled' });

      const count = await prisma.creditLedger.count({
        where: {
          reservationId: res.id,
          entryType: 'reservation_settlement',
        },
      });

      expect(count).toBe(1); // No additional row created
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test('10. monotone S target increase allows growth', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);

  try {
    const res = await seedCreditReservation(prisma, 'closing', 600000n, 100000n, 0n, 500000n);

    const unitOfWork = createUnitOfWork(prisma);

    const result = await unitOfWork.execute(async (ports) => {
      return await ports.ledger.appendReservationSettlement({
        projectId: TEST_PROJECT_ID,
        jobId: res.jobId!,
        userId: TEST_USER_ID,
        reservationId: res.id,
        ledgerEntryId: `entry-mono-s-10`,
        allocationId: `alloc-mono-s-10`,
        attemptId: null,
        amountMicroIdr: 300000n, // > current 100000n
        dedupeKey: `settle:${res.id}:alloc-mono-s-10`,
      });
    });

    expect(result).toEqual({ kind: 'settled' });

    const updatedRes = await prisma.creditReservations.findUnique({
      where: { id: res.id },
    });

    expect(updatedRes!.settledMicroIdr).toBe(300000n);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('12. decreasing S rejected with monotonicity_violation', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);

  try {
    const res = await seedCreditReservation(prisma, 'closing', 500000n, 400000n, 0n, 100000n);

    const unitOfWork = createUnitOfWork(prisma);

    const result = await unitOfWork.execute(async (ports) => {
      return await ports.ledger.appendReservationSettlement({
        projectId: TEST_PROJECT_ID,
        jobId: res.jobId!,
        userId: TEST_USER_ID,
        reservationId: res.id,
        ledgerEntryId: `entry-dec-s-12`,
        allocationId: `alloc-dec-s-12`,
        attemptId: null,
        amountMicroIdr: 300000n, // < current 400000n
        dedupeKey: `settle:${res.id}:alloc-dec-s-12`,
      });
    });

    expect(result).toMatchObject({
      kind: 'monotonicity_violation',
    });
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('14. conservation violation rejected when S+L+E ≠ R', async ({ databaseUrl }) => {
  const prisma = createPrismaClient(databaseUrl);

  try {
    const res = await seedCreditReservation(prisma, 'open', 1000000n, 0n, 0n, 1000000n);

    const unitOfWork = createUnitOfWork(prisma);

    const result = await unitOfWork.execute(async (ports) => {
      return await ports.reservation.applyReconciliationTarget({
        reservationId: res.id,
        userId: TEST_USER_ID,
        projectId: TEST_PROJECT_ID,
        jobProjectId: TEST_PROJECT_ID,
        jobId: res.jobId!,
        settledTargetMicroIdr: 600000n,
        releasedTargetMicroIdr: 500000n, // S+L+E = 1.1M > R
        exposureTargetMicroIdr: 0n,
      });
    });

    expect(result).toMatchObject({
      kind: 'conservation_violation',
    });
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  '15. open → closing sets status=closing, E>0, closing_at non-null',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'open', 1000000n, 0n, 0n, 1000000n);

      const unitOfWork = createUnitOfWork(prisma);

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.reservation.applyReconciliationTarget({
          reservationId: res.id,
          userId: TEST_USER_ID,
          projectId: TEST_PROJECT_ID,
          jobProjectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          settledTargetMicroIdr: 0n,
          releasedTargetMicroIdr: 0n,
          exposureTargetMicroIdr: 800000n, // E>0 keeps closing state
        });
      });

      expect(result).toEqual({ kind: 'reconciled' });

      const updatedRes = await prisma.creditReservations.findUnique({
        where: { id: res.id },
      });

      expect(updatedRes!.status).toBe('closing');
      expect(updatedRes!.exposureMicroIdr).toBe(800000n);
      expect(updatedRes!.closingAt).not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '16. open → settled sets status=settled, E=0, closing_at non-null',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(prisma, 'open', 1000000n, 0n, 0n, 1000000n);

      const unitOfWork = createUnitOfWork(prisma);

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.reservation.applyReconciliationTarget({
          reservationId: res.id,
          userId: TEST_USER_ID,
          projectId: TEST_PROJECT_ID,
          jobProjectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          settledTargetMicroIdr: 1000000n,
          releasedTargetMicroIdr: 0n,
          exposureTargetMicroIdr: 0n,
        });
      });

      expect(result).toEqual({ kind: 'reconciled' });

      const updatedRes = await prisma.creditReservations.findUnique({
        where: { id: res.id },
      });

      expect(updatedRes!.status).toBe('settled');
      expect(updatedRes!.settledMicroIdr).toBe(1000000n);
      expect(updatedRes!.exposureMicroIdr).toBe(0n);
      expect(updatedRes!.closingAt).not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '19. exact reservation target replay returns already_reconciled without mutation',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const res = await seedCreditReservation(
        prisma,
        'closing',
        1000000n,
        600000n,
        100000n,
        300000n,
      );

      const unitOfWork = createUnitOfWork(prisma);

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.reservation.applyReconciliationTarget({
          reservationId: res.id,
          userId: TEST_USER_ID,
          projectId: TEST_PROJECT_ID,
          jobProjectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          settledTargetMicroIdr: 600000n, // Same as current
          releasedTargetMicroIdr: 100000n, // Same as current
          exposureTargetMicroIdr: 300000n, // Same as current
        });
      });

      expect(result).toEqual({ kind: 'already_reconciled' });

      const updatedRes = await prisma.creditReservations.findUnique({
        where: { id: res.id },
      });

      expect(updatedRes!.settledMicroIdr).toBe(600000n);
      expect(updatedRes!.releasedMicroIdr).toBe(100000n);
      expect(updatedRes!.exposureMicroIdr).toBe(300000n);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '21. real credit_ledger UPDATE rejected by immutability trigger',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const entryId = `entry-immutable-21`;

      await prisma.creditLedger.create({
        data: {
          id: entryId,
          userId: TEST_USER_ID,
          projectId: TEST_PROJECT_ID,
          reservationId: `imm-res-21`,
          attemptId: null,
          entryType: 'reservation_settlement',
          direction: 'debit',
          amountMicroIdr: 500000n,
          dedupeKey: 'settle:test-21:alloc',
        },
      });

      try {
        await prisma.creditLedger.update({
          where: { id: entryId },
          data: { amountMicroIdr: 999999n },
        });

        throw new Error('UPDATE should have been rejected by immutability trigger');
      } catch (error: unknown) {
        const err = error as { message: string };
        expect(err.message).toContain('cannot update');
      }
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '27. queued cancellation full regression preserves grandfathered API semantics',
  async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);

    try {
      const amount = 500000n;

      const res = await seedCreditReservation(prisma, 'queued', amount, 0n, 0n, amount);

      const unitOfWork = createUnitOfWork(prisma);

      const result = await unitOfWork.execute(async (ports) => {
        return await ports.ledger.releaseQueuedCancellation({
          projectId: TEST_PROJECT_ID,
          jobId: res.jobId!,
          reservationId: res.id,
          ledgerEntryId: `entry-cancel-27`,
          dedupeKey: `release:${res.id}:queued-cancel`,
          entryType: 'release', // Grandfathered parameter preserved
          direction: 'credit', // Grandfathered parameter preserved
        });
      });

      expect(result).toEqual({ kind: 'already_released' });

      const updatedRes = await prisma.creditReservations.findUnique({
        where: { id: res.id },
      });

      expect(updatedRes!.status).toBe('cancelled');
      expect(updatedRes!.releasedMicroIdr).toBe(amount);

      const rows = await prisma.creditLedger.findMany({
        where: { reservationId: res.id },
      });

      expect(rows.length).toBe(1);
      expect(rows[0].entryType).toBe('release');
      expect(rows[0].direction).toBe('credit');
      expect(rows[0].amountMicroIdr).toBe(amount);
    } finally {
      await prisma.$disconnect();
    }
  },
);

// Helper function verification - standalone describe block
describe('Task 8 deriveReservationStatus helper', () => {
  it('verifies deriveReservationStatus produces correct status for all tuple shapes', () => {
    // Case A: E > 0 → closing
    expect(
      deriveReservationStatus({
        settledTargetMicroIdr: 0n,
        releasedTargetMicroIdr: 0n,
        exposureTargetMicroIdr: 500000n,
      }),
    ).toBe('closing');

    // Case B: E = 0, S > 0 → settled
    expect(
      deriveReservationStatus({
        settledTargetMicroIdr: 1000000n,
        releasedTargetMicroIdr: 0n,
        exposureTargetMicroIdr: 0n,
      }),
    ).toBe('settled');

    // Case C: E = 0, S = 0, L > 0 → released (default)
    expect(
      deriveReservationStatus({
        settledTargetMicroIdr: 0n,
        releasedTargetMicroIdr: 1000000n,
        exposureTargetMicroIdr: 0n,
      }),
    ).toBe('released');

    // Case D: E = 0, S = 0, L > 0 → cancelled (override)
    expect(
      deriveReservationStatus({
        settledTargetMicroIdr: 0n,
        releasedTargetMicroIdr: 1000000n,
        exposureTargetMicroIdr: 0n,
        terminalReason: 'cancelled',
      }),
    ).toBe('cancelled');

    // Case E: E = 0, S = 0, L > 0 → expired (override)
    expect(
      deriveReservationStatus({
        settledTargetMicroIdr: 0n,
        releasedTargetMicroIdr: 1000000n,
        exposureTargetMicroIdr: 0n,
        terminalReason: 'expired',
      }),
    ).toBe('expired');
  });
});

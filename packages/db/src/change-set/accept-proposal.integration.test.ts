/**
 * verification-matrix: accept-proposal (base case)
 * Project canonical version +1 per change set (not per op). Full atomic accept
 * with supersede lands in M5; M2 proves the write-door bump invariant.
 */
import { expect } from 'vitest';
import {
  createCommitCanonicalChangeSet,
  type CanonicalOpPersist,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function changeSetTest(
  name: string,
  body: (ctx: { prisma: PrismaClient }) => Promise<void>,
  timeout?: number,
): void {
  schema.test(
    name,
    async ({ databaseUrl }) => {
      const prisma = createPrismaClient(databaseUrl);
      try {
        await body({ prisma });
      } finally {
        await prisma.$disconnect();
      }
    },
    timeout,
  );
}

async function seedOwnerAndProject(prisma: PrismaClient): Promise<{
  userId: string;
  projectId: string;
}> {
  const userRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
    `owner-${crypto.randomUUID()}@narraza.test`,
  );
  const userId = userRows[0]!.id;
  const projectRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO projects
       (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at)
     VALUES
       (gen_random_uuid()::text, $1, 'Canon +1', 'guided', 'active', 0, 0, now(), now())
     RETURNING id`,
    userId,
  );
  return { userId, projectId: projectRows[0]!.id };
}

function factCreate(id: string, key: string, ordinal: number): CanonicalOpPersist {
  return {
    operationId: crypto.randomUUID(),
    ordinal,
    operationType: 'fact.create',
    targetEntityType: 'fact',
    targetEntityId: id,
    expectedRevision: null,
    risk: 'high',
    payload: {
      factKey: key,
      statement: `Statement for ${key}`,
      canonStatus: 'confirmed',
      visibility: 'private',
      source: { kind: 'foundation' },
    },
  };
}

changeSetTest(
  'accept-proposal: multi-op change set bumps currentCanonicalVersion by exactly 1',
  async ({ prisma }) => {
    const { userId, projectId } = await seedOwnerAndProject(prisma);
    const uow = createUnitOfWork(prisma);
    const commit = createCommitCanonicalChangeSet(uow);

    const result = await commit({
      projectId,
      actorUserId: userId,
      origin: 'user',
      baseCanonicalVersion: 0,
      operationsHash: 'c'.repeat(64),
      operations: [
        factCreate(crypto.randomUUID(), 'fk-a', 0),
        factCreate(crypto.randomUUID(), 'fk-b', 1),
      ],
      requestId: 'req-accept-base-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedCanonicalVersion).toBe(1);

    const project = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
      `SELECT current_canonical_version FROM projects WHERE id = $1`,
      projectId,
    );
    expect(project[0]!.current_canonical_version).toBe(1);

    const facts = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM facts WHERE project_id = $1`,
      projectId,
    );
    expect(Number(facts[0]!.count)).toBe(2);

    // Wrong base version → CAS_FAILED, no further bump.
    const cas = await commit({
      projectId,
      actorUserId: userId,
      origin: 'user',
      baseCanonicalVersion: 0,
      operationsHash: 'd'.repeat(64),
      operations: [factCreate(crypto.randomUUID(), 'fk-stale', 0)],
      requestId: 'req-accept-stale',
    });
    expect(cas.ok).toBe(false);
    if (cas.ok) return;
    expect(cas.error.code).toBe('CAS_FAILED');

    const afterCas = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
      `SELECT current_canonical_version FROM projects WHERE id = $1`,
      projectId,
    );
    expect(afterCas[0]!.current_canonical_version).toBe(1);

    // Foreign owner → NOT_FOUND.
    const other = await commit({
      projectId,
      actorUserId: crypto.randomUUID(),
      origin: 'user',
      baseCanonicalVersion: 1,
      operationsHash: 'e'.repeat(64),
      operations: [factCreate(crypto.randomUUID(), 'fk-idor', 0)],
      requestId: 'req-accept-idor',
    });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error.code).toBe('NOT_FOUND');
  },
);

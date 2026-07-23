/**
 * verification-matrix: fact-lifecycle
 * Fact rows exist only after an applied change set (S2 / single write door).
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
       (gen_random_uuid()::text, $1, 'Fact lifecycle', 'guided', 'active', 0, 0, now(), now())
     RETURNING id`,
    userId,
  );
  return { userId, projectId: projectRows[0]!.id };
}

changeSetTest('fact-lifecycle: fact exists only after applied change set', async ({ prisma }) => {
  const { userId, projectId } = await seedOwnerAndProject(prisma);
  const uow = createUnitOfWork(prisma);
  const commit = createCommitCanonicalChangeSet(uow);

  const before = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM facts WHERE project_id = $1`,
    projectId,
  );
  expect(Number(before[0]!.count)).toBe(0);

  const factId = crypto.randomUUID();
  const ops: CanonicalOpPersist[] = [
    {
      operationId: crypto.randomUUID(),
      ordinal: 0,
      operationType: 'fact.create',
      targetEntityType: 'fact',
      targetEntityId: factId,
      expectedRevision: null,
      risk: 'high',
      payload: {
        factKey: 'fk-hero-secret',
        statement: 'Hero knows the secret',
        canonStatus: 'confirmed',
        visibility: 'private',
        source: { kind: 'foundation' },
      },
    },
  ];

  const result = await commit({
    projectId,
    actorUserId: userId,
    origin: 'user',
    baseCanonicalVersion: 0,
    operationsHash: 'a'.repeat(64),
    operations: ops,
    requestId: 'req-fact-1',
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.appliedCanonicalVersion).toBe(1);

  const facts = await prisma.$queryRawUnsafe<
    { id: string; fact_key: string; canon_status: string }[]
  >(`SELECT id, fact_key, canon_status FROM facts WHERE project_id = $1`, projectId);
  expect(facts).toHaveLength(1);
  expect(facts[0]!.id).toBe(factId);
  expect(facts[0]!.fact_key).toBe('fk-hero-secret');
  expect(facts[0]!.canon_status).toBe('confirmed');

  const project = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
    `SELECT current_canonical_version FROM projects WHERE id = $1`,
    projectId,
  );
  expect(project[0]!.current_canonical_version).toBe(1);

  const changeSets = await prisma.$queryRawUnsafe<
    { status: string; applied_canonical_version: number | null }[]
  >(
    `SELECT status, applied_canonical_version FROM canonical_change_sets WHERE project_id = $1`,
    projectId,
  );
  expect(changeSets).toHaveLength(1);
  expect(changeSets[0]!.status).toBe('applied');
  expect(changeSets[0]!.applied_canonical_version).toBe(1);

  const audits = await prisma.$queryRawUnsafe<{ action: string }[]>(
    `SELECT action FROM audit_events WHERE entity_id = $1`,
    result.value.changeSetId,
  );
  expect(audits.some((a) => a.action === 'change_set.applied')).toBe(true);

  const outbox = await prisma.$queryRawUnsafe<{ event_type: string; dedupe_key: string }[]>(
    `SELECT event_type, dedupe_key FROM outbox_events WHERE aggregate_id = $1`,
    result.value.changeSetId,
  );
  expect(outbox).toHaveLength(1);
  expect(outbox[0]!.event_type).toBe('canonical.change_set.applied');
  expect(outbox[0]!.dedupe_key).toBe(`changeset:${result.value.changeSetId}:applied`);

  // Second commit: fact.update → version 2, fact revision increments.
  const updateResult = await commit({
    projectId,
    actorUserId: userId,
    origin: 'user',
    baseCanonicalVersion: 1,
    operationsHash: 'b'.repeat(64),
    operations: [
      {
        operationId: crypto.randomUUID(),
        ordinal: 0,
        operationType: 'fact.update',
        targetEntityType: 'fact',
        targetEntityId: factId,
        expectedRevision: 0,
        risk: 'high',
        payload: {
          factKey: 'fk-hero-secret',
          statement: 'Hero knows the secret (revised)',
          canonStatus: 'confirmed',
          visibility: 'reader_known',
          source: { kind: 'foundation' },
        },
      },
    ],
    requestId: 'req-fact-2',
  });
  expect(updateResult.ok).toBe(true);
  if (!updateResult.ok) return;
  expect(updateResult.value.appliedCanonicalVersion).toBe(2);

  const afterUpdate = await prisma.$queryRawUnsafe<
    { revision: number; visibility: string }[]
  >(`SELECT revision, visibility FROM facts WHERE id = $1`, factId);
  expect(afterUpdate[0]!.revision).toBe(1);
  expect(afterUpdate[0]!.visibility).toBe('reader_known');
});

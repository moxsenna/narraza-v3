/**
 * verification-matrix: concept-accept (seeded, no AI)
 * Accept concept → foundation draft (not locked), canon +1 via single write door.
 */
import { expect } from 'vitest';
import {
  createAcceptConcept,
  createCreateProject,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function ucTest(
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

async function seedUser(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
    `owner-${crypto.randomUUID()}@narraza.test`,
  );
  return rows[0]!.id;
}

async function seedConcept(
  prisma: PrismaClient,
  projectId: string,
): Promise<{ conceptSetId: string; conceptId: string }> {
  const conceptSetId = crypto.randomUUID();
  const conceptId = crypto.randomUUID();
  const depHash = 'a'.repeat(64);
  await prisma.$executeRawUnsafe(
    `INSERT INTO concept_sets
       (id, project_id, status, dependency_hash, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, 'generated', $3, 1, '{}'::jsonb, now(), now())`,
    conceptSetId,
    projectId,
    depHash,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO concepts
       (id, project_id, concept_set_id, ordinal, title, synopsis, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 0, $4, $5, 1, $6::jsonb, now(), now())`,
    conceptId,
    projectId,
    conceptSetId,
    'Surat Terakhir',
    'Kurir membawa janji yang mahal harganya.',
    JSON.stringify({
      coreConcept: 'A promise carries a hidden cost.',
      conflict: 'The recipient wants the letter destroyed.',
      endingDirection: 'Mira reveals the cost and chooses exile.',
      readerPromise: 'A tense moral mystery with earned answers.',
    }),
  );
  return { conceptSetId, conceptId };
}

ucTest('concept-accept: seeded concept → foundation draft, unlocked, canon +1', async ({
  prisma,
}) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const accept = createAcceptConcept(uow);

  const project = await createProject({
    ownerUserId: userId,
    jalur: 'rough_idea',
    title: 'Concept accept',
  });
  expect(project.ok).toBe(true);
  if (!project.ok) return;
  const projectId = project.value.project.id;
  expect(project.value.project.currentCanonicalVersion).toBe(0);

  const { conceptId } = await seedConcept(prisma, projectId);

  const result = await accept({
    ownerUserId: userId,
    projectId,
    conceptId,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.foundation.status).toBe('draft');
  expect(result.value.foundation.lockedAt).toBeNull();
  expect(result.value.foundation.confirmedAt).toBeNull();
  expect(result.value.appliedCanonicalVersion).toBe(1);
  expect(result.value.foundation.payload.sourceConceptId).toBe(conceptId);
  expect(String(result.value.foundation.payload.coreConcept)).toContain('promise');

  const projectRow = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
    `SELECT current_canonical_version FROM projects WHERE id = $1`,
    projectId,
  );
  expect(projectRow[0]!.current_canonical_version).toBe(1);

  const foundations = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM foundations WHERE project_id = $1`,
    projectId,
  );
  expect(Number(foundations[0]!.count)).toBe(1);

  const set = await prisma.$queryRawUnsafe<{ status: string }[]>(
    `SELECT status FROM concept_sets WHERE project_id = $1`,
    projectId,
  );
  expect(set[0]!.status).toBe('selected');

  // Repeat accept — no duplicate foundation, no extra bump required for same selection.
  const repeat = await accept({ ownerUserId: userId, projectId, conceptId });
  expect(repeat.ok).toBe(true);
  if (!repeat.ok) return;
  const foundations2 = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM foundations WHERE project_id = $1`,
    projectId,
  );
  expect(Number(foundations2[0]!.count)).toBe(1);
});

ucTest('concept-accept: foreign owner → NOT_FOUND', async ({ prisma }) => {
  const ownerId = await seedUser(prisma);
  const attackerId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const accept = createAcceptConcept(uow);

  const project = await createProject({ ownerUserId: ownerId, jalur: 'rough_idea' });
  expect(project.ok).toBe(true);
  if (!project.ok) return;
  const { conceptId } = await seedConcept(prisma, project.value.project.id);

  const result = await accept({
    ownerUserId: attackerId,
    projectId: project.value.project.id,
    conceptId,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('NOT_FOUND');
});

ucTest('concept-accept: concept not in project → NOT_FOUND', async ({ prisma }) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const accept = createAcceptConcept(uow);

  const p1 = await createProject({ ownerUserId: userId, jalur: 'rough_idea', title: 'P1' });
  const p2 = await createProject({ ownerUserId: userId, jalur: 'rough_idea', title: 'P2' });
  expect(p1.ok && p2.ok).toBe(true);
  if (!p1.ok || !p2.ok) return;
  const { conceptId } = await seedConcept(prisma, p1.value.project.id);

  const result = await accept({
    ownerUserId: userId,
    projectId: p2.value.project.id,
    conceptId,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('NOT_FOUND');
});

ucTest('concept-accept: stale baseCanonicalVersion → CAS_FAILED, no partial write', async ({
  prisma,
}) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const accept = createAcceptConcept(uow);

  const project = await createProject({ ownerUserId: userId, jalur: 'rough_idea' });
  expect(project.ok).toBe(true);
  if (!project.ok) return;
  const projectId = project.value.project.id;
  const { conceptId } = await seedConcept(prisma, projectId);

  // Force project version ahead of claimed base.
  await prisma.$executeRawUnsafe(
    `UPDATE projects SET current_canonical_version = 3 WHERE id = $1`,
    projectId,
  );

  const result = await accept({
    ownerUserId: userId,
    projectId,
    conceptId,
    baseCanonicalVersion: 0,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('CAS_FAILED');

  // Foundation may have been pre-inserted in prep path only when base matched —
  // with early CAS check before prep, no foundation should exist.
  const foundations = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM foundations WHERE project_id = $1`,
    projectId,
  );
  // Acceptable: 0 foundations (preferred) or draft only if prep ran — assert no applied change set.
  const changeSets = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM canonical_change_sets
      WHERE project_id = $1 AND status = 'applied'`,
    projectId,
  );
  expect(Number(changeSets[0]!.count)).toBe(0);
  expect(Number(foundations[0]!.count)).toBe(0);
});

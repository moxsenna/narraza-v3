/**
 * verification-matrix: working-draft (W5.1)
 * One active working draft per (project, user, beat); CAS revision updates;
 * conflict returns authoritative revision with zero partial writes; candidate
 * seed initializes drafts without accept/canon/version; snapshot creates an
 * immutable ProseVersion with fenced revision allocation.
 */
import { expect } from 'vitest';
import {
  createSaveWorkingDraft,
  createSeedDraftFromCandidate,
  createSnapshotProseVersion,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function proseTest(
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

async function seedOwnerProjectBeat(prisma: PrismaClient): Promise<{
  userId: string;
  projectId: string;
  beatId: string;
}> {
  const userRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
    `prose-${crypto.randomUUID()}@narraza.test`,
  );
  const userId = userRows[0]!.id;
  const projectRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO projects
       (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'Prose', 'guided', 'active', 0, 0, now(), now())
     RETURNING id`,
    userId,
  );
  const projectId = projectRows[0]!.id;
  const roadmapId = crypto.randomUUID();
  const arcId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const beatId = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO roadmaps (id, project_id, title, revision, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, 'R', 0, 1, '{}', now(), now())`,
    roadmapId,
    projectId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO arcs (id, project_id, roadmap_id, ordinal, title, revision, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'A', 0, 1, '{}', now(), now())`,
    arcId,
    projectId,
    roadmapId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO chapters (id, project_id, arc_id, ordinal, title, narrative_sequence, revision, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'C', 1, 0, 1, '{}', now(), now())`,
    chapterId,
    projectId,
    arcId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO beats (id, project_id, chapter_id, ordinal, narrative_sequence, revision, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 1, 0, 1, '{}', now(), now())`,
    beatId,
    projectId,
    chapterId,
  );
  return { userId, projectId, beatId };
}

proseTest('working-draft: autosave creates then CAS-updates exactly once per revision', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);

  const first = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'first words',
    expectedRevision: null,
  });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.value.draft.revision).toBe(0);

  const second = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'second words',
    expectedRevision: 0,
  });
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  expect(second.value.draft.revision).toBe(1);
  expect(second.value.draft.content).toBe('second words');
});

proseTest('working-draft: revision mismatch is a typed conflict with zero writes', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);

  const first = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'original',
    expectedRevision: null,
  });
  expect(first.ok).toBe(true);

  const stale = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'stale overwrite attempt',
    expectedRevision: 7,
  });
  expect(stale.ok).toBe(false);
  if (stale.ok) return;
  expect(stale.error.code).toBe('DRAFT_CONFLICT');

  const current = await uow.execute(async (ports) =>
    ports.proseDraft!.findActive(projectId, userId, beatId),
  );
  expect(current?.content).toBe('original');
  expect(current?.revision).toBe(0);
});

proseTest('working-draft: concurrent writers serialize, one winner per revision', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);

  const first = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'base',
    expectedRevision: null,
  });
  expect(first.ok).toBe(true);

  const attempts = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      save({
        ownerUserId: userId,
        projectId,
        beatId,
        content: `racer ${i}`,
        expectedRevision: 0,
      }),
    ),
  );
  const winners = attempts.filter((r) => r.ok);
  const conflicts = attempts.filter((r) => !r.ok);
  expect(winners.length).toBe(1);
  expect(conflicts.length).toBe(4);
  for (const c of conflicts) {
    if (c.ok) continue;
    expect(c.error.code).toBe('DRAFT_CONFLICT');
  }
  const current = await uow.execute(async (ports) =>
    ports.proseDraft!.findActive(projectId, userId, beatId),
  );
  expect(current?.revision).toBe(1);
});

proseTest('working-draft: snapshot creates immutable version with fenced revision', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);
  const snapshot = createSnapshotProseVersion(uow);

  await save({ ownerUserId: userId, projectId, beatId, content: 'v1 prose', expectedRevision: null });
  const s1 = await snapshot({
    ownerUserId: userId,
    projectId,
    beatId,
    sourceCandidateId: null,
  });
  expect(s1.ok).toBe(true);
  if (!s1.ok) return;
  expect(s1.value.version.revision).toBe(0);
  expect(s1.value.version.status).toBe('draft');
  expect(s1.value.version.contentHash).toMatch(/^[0-9a-f]{64}$/);

  await save({ ownerUserId: userId, projectId, beatId, content: 'v2 prose', expectedRevision: 0 });
  const s2 = await snapshot({
    ownerUserId: userId,
    projectId,
    beatId,
    sourceCandidateId: null,
  });
  expect(s2.ok).toBe(true);
  if (!s2.ok) return;
  expect(s2.value.version.revision).toBe(1);
  expect(s2.value.version.content).toBe('v2 prose');

  const v1 = await uow.execute(async (ports) => ports.proseVersion!.findById(projectId, s1.value.version.id));
  expect(v1?.content).toBe('v1 prose');
});

proseTest('working-draft: foreign user cannot read or write another draft', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);

  await save({ ownerUserId: userId, projectId, beatId, content: 'mine', expectedRevision: null });

  const foreignRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
    `intruder-${crypto.randomUUID()}@narraza.test`,
  );
  const foreign = await save({
    ownerUserId: foreignRows[0]!.id,
    projectId,
    beatId,
    content: 'hijack',
    expectedRevision: null,
  });
  expect(foreign.ok).toBe(false);
  if (foreign.ok) return;
  expect(foreign.error.code).toBe('NOT_FOUND');
});

proseTest('working-draft: candidate seed initializes draft then preserves edits', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const seed = createSeedDraftFromCandidate(uow);
  const save = createSaveWorkingDraft(uow);

  const jobId = crypto.randomUUID();
  const candidateId = `m4:${jobId}:candidate-1`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO generation_jobs
       (id, project_id, kind, status, priority, available_at,
        fence_version, schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, 'beat_write_judge', 'succeeded', 0, now(), 1, 1, '{}', now(), now())`,
    jobId,
    projectId,
  );
  const groupId = `m4:${jobId}:proposal-group`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO proposal_groups
       (id, project_id, kind, status, dependency_hash, source_job_id, created_at, updated_at)
     VALUES ($1, $2, 'beat_write_judge', 'pending', $3, $4, now(), now())`,
    groupId,
    projectId,
    'a'.repeat(64),
    jobId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO generated_candidates
       (id, project_id, group_id, job_id, ordinal, schema_version, payload, created_at)
     VALUES ($1, $2, $3, $4, 1, 1, $5::jsonb, now())`,
    candidateId,
    projectId,
    groupId,
    jobId,
    JSON.stringify({
      output: { text: 'candidate prose words', payload: {} },
      stageOutputs: {},
    }),
  );

  // Seed path requires a real candidate row; unknown id must 404, not invent.
  const missing = await seed({ ownerUserId: userId, projectId, candidateId: 'nope', beatId });
  expect(missing.ok).toBe(false);
  if (missing.ok) return;
  expect(missing.error.code).toBe('NOT_FOUND');

  // Real candidate seeds a fresh draft with candidate text.
  const seeded = await seed({ ownerUserId: userId, projectId, candidateId, beatId });
  expect(seeded.ok).toBe(true);
  if (!seeded.ok) return;
  expect(seeded.value.draft.content).toBe('candidate prose words');
  expect(seeded.value.draft.revision).toBe(0);

  // Same candidate replay converges without duplicate drafts.
  const replay = await seed({ ownerUserId: userId, projectId, candidateId, beatId });
  expect(replay.ok).toBe(true);
  if (!replay.ok) return;
  expect(replay.value.draft.id).toBe(seeded.value.draft.id);
  expect(replay.value.draft.revision).toBe(0);

  // Materially edited draft is preserved: reseed is a typed conflict.
  const edited = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'my edited words',
    expectedRevision: 0,
  });
  expect(edited.ok).toBe(true);
  const guarded = await seed({ ownerUserId: userId, projectId, candidateId, beatId });
  expect(guarded.ok).toBe(false);
  if (guarded.ok) return;
  expect(guarded.error.code).toBe('DRAFT_CONFLICT');

  // Explicit overwrite with matching revision reseeds.
  const overwrite = await seed({
    ownerUserId: userId,
    projectId,
    candidateId,
    beatId,
    allowOverwrite: true,
    expectedRevision: 1,
  });
  expect(overwrite.ok).toBe(true);
  if (!overwrite.ok) return;
  expect(overwrite.value.draft.content).toBe('candidate prose words');
});

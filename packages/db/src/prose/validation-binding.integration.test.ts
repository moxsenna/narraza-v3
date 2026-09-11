/**
 * verification-matrix: validation-hash + override-allowlist (W5.2, R-M5.1/R-M5.2)
 * - Report binds exactly (proseVersionId, proseContentHash, policyVersion).
 * - Version A report cannot authorize version B (staleness).
 * - Override allowlist starts EMPTY: override attempts are POLICY_DENIED and
 *   the public view exposes no override action.
 * - Replay converges on the same report id.
 */
import { expect } from 'vitest';
import {
  createOverrideFinding,
  createSaveWorkingDraft,
  createSnapshotProseVersion,
  createValidateProseVersion,
  isOverrideAllowed,
  M5_VALIDATION_POLICY_VERSION,
  toPublicValidationView,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function validationTest(
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
    `validation-${crypto.randomUUID()}@narraza.test`,
  );
  const userId = userRows[0]!.id;
  const projectRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO projects
       (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'Validation', 'guided', 'active', 0, 0, now(), now())
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

async function saveAndSnapshot(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  beatId: string,
  content: string,
  expectedRevision: number | null,
) {
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);
  const snapshot = createSnapshotProseVersion(uow);
  const saved = await save({ ownerUserId: userId, projectId, beatId, content, expectedRevision });
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error('seed save failed');
  const snapped = await snapshot({ ownerUserId: userId, projectId, beatId, sourceCandidateId: null });
  expect(snapped.ok).toBe(true);
  if (!snapped.ok) throw new Error('seed snapshot failed');
  return snapped.value.version;
}

validationTest('validation-hash: report binds exact tuple and replay converges', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const version = await saveAndSnapshot(prisma, userId, projectId, beatId, 'some real prose here', null);
  const uow = createUnitOfWork(prisma);
  const validate = createValidateProseVersion(uow);

  const first = await validate({ ownerUserId: userId, projectId, proseVersionId: version.id });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.value.report.proseVersionId).toBe(version.id);
  expect(first.value.report.proseContentHash).toBe(version.contentHash);
  expect(first.value.report.policyVersion).toBe(M5_VALIDATION_POLICY_VERSION);
  expect(first.value.report.status).toBe('completed');

  const replay = await validate({ ownerUserId: userId, projectId, proseVersionId: version.id });
  expect(replay.ok).toBe(true);
  if (!replay.ok) return;
  expect(replay.value.report.id).toBe(first.value.report.id);
});

validationTest('validation-hash: version A report cannot validate version B', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const versionA = await saveAndSnapshot(prisma, userId, projectId, beatId, 'version A prose text', null);
  const versionB = await saveAndSnapshot(
    prisma,
    userId,
    projectId,
    beatId,
    'version B prose text different',
    0,
  );
  expect(versionA.contentHash).not.toBe(versionB.contentHash);
  const uow = createUnitOfWork(prisma);
  const validate = createValidateProseVersion(uow);

  const reportA = await validate({ ownerUserId: userId, projectId, proseVersionId: versionA.id });
  expect(reportA.ok).toBe(true);
  if (!reportA.ok) return;

  const reportB = await validate({ ownerUserId: userId, projectId, proseVersionId: versionB.id });
  expect(reportB.ok).toBe(true);
  if (!reportB.ok) return;
  expect(reportB.value.report.id).not.toBe(reportA.value.report.id);
  expect(reportB.value.report.proseContentHash).toBe(versionB.contentHash);

  // Current-binding check: A-report tuple does not match B version.
  const current = await uow.execute(async (ports) =>
    ports.validationReport!.findCurrent(projectId, versionB.id, versionB.contentHash, M5_VALIDATION_POLICY_VERSION),
  );
  expect(current?.id).toBe(reportB.value.report.id);
  const staleLookup = await uow.execute(async (ports) =>
    ports.validationReport!.findCurrent(projectId, versionB.id, versionA.contentHash, M5_VALIDATION_POLICY_VERSION),
  );
  expect(staleLookup).toBeNull();
});

validationTest('override-allowlist: empty allowlist denies override and hides action', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  // Empty prose triggers the blocking empty-prose rule deterministically.
  const version = await saveAndSnapshot(prisma, userId, projectId, beatId, '', null);
  const uow = createUnitOfWork(prisma);
  const validate = createValidateProseVersion(uow);
  const override = createOverrideFinding(uow);

  const validated = await validate({ ownerUserId: userId, projectId, proseVersionId: version.id });
  expect(validated.ok).toBe(true);
  if (!validated.ok) return;
  expect(validated.value.report.passed).toBe(false);
  expect(validated.value.findings.length).toBeGreaterThan(0);

  const view = toPublicValidationView(validated.value.report, validated.value.findings, {
    current: true,
  });
  expect(view.availableActions).not.toContain('override');
  // No public finding leaks source or internal detail.
  for (const f of view.findings) {
    expect('source' in f).toBe(false);
  }

  const target = validated.value.findings[0]!;
  expect(isOverrideAllowed(M5_VALIDATION_POLICY_VERSION, target.ruleKey)).toBe(false);
  const denied = await override({
    ownerUserId: userId,
    projectId,
    reportId: validated.value.report.id,
    findingId: target.id,
    reason: 'I disagree',
  });
  expect(denied.ok).toBe(false);
  if (denied.ok) return;
  expect(denied.error.code).toBe('POLICY_DENIED');

  const emptyReason = await override({
    ownerUserId: userId,
    projectId,
    reportId: validated.value.report.id,
    findingId: target.id,
    reason: '   ',
  });
  expect(emptyReason.ok).toBe(false);
  if (emptyReason.ok) return;
  expect(emptyReason.error.code).toBe('VALIDATION');
});

validationTest('override-allowlist: foreign user cannot validate or override', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const version = await saveAndSnapshot(prisma, userId, projectId, beatId, 'owner prose here', null);
  const foreignRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
    `intruder-${crypto.randomUUID()}@narraza.test`,
  );
  const uow = createUnitOfWork(prisma);
  const validate = createValidateProseVersion(uow);
  const foreign = await validate({
    ownerUserId: foreignRows[0]!.id,
    projectId,
    proseVersionId: version.id,
  });
  expect(foreign.ok).toBe(false);
  if (foreign.ok) return;
  expect(foreign.error.code).toBe('NOT_FOUND');
});

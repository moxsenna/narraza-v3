/**
 * verification-matrix: safe-repair orchestration (W5.2).
 * - Repair builds ONLY from the CURRENT report binding; edited draft (hash
 *   changed, no current report) → VALIDATION_STALE, no packet.
 * - Directives carry exactly { findingKey, publicMessageCode, instruction } —
 *   static server-authored instructions, no finding content, no model output.
 * - Stop conditions via core decideRepairStop (first attempt continues when
 *   blockers remain; repeated fingerprint stops).
 * - Repair never auto-accepts: no proposal/accept writes, beat accepted
 *   pointer untouched.
 */
import { expect } from 'vitest';
import {
  createRequestSafeRepair,
  createSaveWorkingDraft,
  createSnapshotProseVersion,
  createValidateProseVersion,
  M5_VALIDATION_POLICY_VERSION,
  repairInstructionFor,
  severityScoreFor,
  toRepairDirective,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function repairTest(
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
    `repair-${crypto.randomUUID()}@narraza.test`,
  );
  const userId = userRows[0]!.id;
  const projectRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO projects
       (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'Repair', 'guided', 'active', 0, 0, now(), now())
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

repairTest('safe-repair: blocking report yields sanitized writer_safe packet', async ({
  prisma,
}) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);
  const snapshot = createSnapshotProseVersion(uow);
  const repair = createRequestSafeRepair(uow);

  // Non-empty prose: the repair packet schema requires non-empty repairable
  // content, and the minimal W5.2 validator contract only yields blockers on
  // empty prose — so the bound blocking report is seeded directly through the
  // ports with the exact (versionId, contentHash, policyVersion) binding.
  const content = 'Mira menatap laut dan menghela napas panjang.';
  const saved = await save({ ownerUserId: userId, projectId, beatId, content, expectedRevision: null });
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;
  const snapped = await snapshot({ ownerUserId: userId, projectId, beatId, sourceCandidateId: null });
  expect(snapped.ok).toBe(true);
  if (!snapped.ok) return;
  const version = snapped.value.version;
  const reportId = await uow.execute(async (ports) => {
    const report = await ports.validationReport!.insert({
      id: ports.allocateId(),
      projectId,
      proseVersionId: version.id,
      proseContentHash: version.contentHash,
      policyVersion: M5_VALIDATION_POLICY_VERSION,
      status: 'completed',
      passed: false,
    });
    await ports.validationFinding!.insertMany([
      {
        id: ports.allocateId(),
        projectId,
        reportId: report.id,
        proseVersionId: version.id,
        source: 'validator',
        severity: 'blocking',
        ruleKey: 'beat.length.out_of_range',
        message: 'validation.length.out_of_range',
      },
    ]);
    return report.id;
  });

  const result = await repair({ ownerUserId: userId, projectId, proseVersionId: version.id });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.reportId).toBe(reportId);
  expect(result.value.directives.length).toBeGreaterThan(0);
  // Sanitized shape: exact keys only, static instructions.
  for (const d of result.value.directives) {
    expect(Object.keys(d).sort()).toEqual(['findingKey', 'instruction', 'publicMessageCode']);
    expect(d.instruction).toBe(repairInstructionFor(d.publicMessageCode));
    expect(d.instruction.length).toBeGreaterThan(0);
  }
  expect(result.value.packet.kind).toBe('repair');
  expect(result.value.packet.dataClass).toBe('writer_safe');
  expect(result.value.packet.repairableProse.proseVersionId).toBe(version.id);
  // First attempt with remaining blockers → continue.
  expect(result.value.stop.shouldStop).toBe(false);
  expect(result.value.stop.reason).toBe('continue');

  // Never auto-accepts: no proposals created, beat pointer untouched.
  const proposals = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT count(*)::text AS n FROM proposals WHERE project_id = $1`,
    projectId,
  );
  expect(proposals[0]!.n).toBe('0');
  const beats = await prisma.$queryRawUnsafe<{ accepted: string | null }[]>(
    `SELECT accepted_prose_version_id AS accepted FROM beats WHERE id = $1`,
    beatId,
  );
  expect(beats[0]!.accepted).toBeNull();
});

repairTest('safe-repair: edited draft without current report is stale', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);
  const snapshot = createSnapshotProseVersion(uow);
  const validate = createValidateProseVersion(uow);
  const repair = createRequestSafeRepair(uow);

  const first = await save({ ownerUserId: userId, projectId, beatId, content: '', expectedRevision: null });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const snapped = await snapshot({ ownerUserId: userId, projectId, beatId, sourceCandidateId: null });
  expect(snapped.ok).toBe(true);
  if (!snapped.ok) return;
  const validated = await validate({ ownerUserId: userId, projectId, proseVersionId: snapped.value.version.id });
  expect(validated.ok).toBe(true);
  if (!validated.ok) return;

  // Edit draft + snapshot a new version: the new version has no report.
  const second = await save({ ownerUserId: userId, projectId, beatId, content: '', expectedRevision: 0 });
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  const snapped2 = await snapshot({ ownerUserId: userId, projectId, beatId, sourceCandidateId: null });
  expect(snapped2.ok).toBe(true);
  if (!snapped2.ok) return;

  const stale = await repair({ ownerUserId: userId, projectId, proseVersionId: snapped2.value.version.id });
  expect(stale.ok).toBe(false);
  if (stale.ok) return;
  expect(stale.error.code).toBe('CONFLICT');
});

repairTest('safe-repair: repeated fingerprint stops', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);
  const snapshot = createSnapshotProseVersion(uow);
  const repair = createRequestSafeRepair(uow);

  const saved = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'Mira menatap laut dan menghela napas panjang.',
    expectedRevision: null,
  });
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;
  const snapped = await snapshot({ ownerUserId: userId, projectId, beatId, sourceCandidateId: null });
  expect(snapped.ok).toBe(true);
  if (!snapped.ok) return;
  const version = snapped.value.version;
  await uow.execute(async (ports) => {
    const report = await ports.validationReport!.insert({
      id: ports.allocateId(),
      projectId,
      proseVersionId: version.id,
      proseContentHash: version.contentHash,
      policyVersion: M5_VALIDATION_POLICY_VERSION,
      status: 'completed',
      passed: false,
    });
    await ports.validationFinding!.insertMany([
      {
        id: ports.allocateId(),
        projectId,
        reportId: report.id,
        proseVersionId: version.id,
        source: 'validator',
        severity: 'blocking',
        ruleKey: 'beat.length.out_of_range',
        message: 'validation.length.out_of_range',
      },
    ]);
  });

  const first = await repair({ ownerUserId: userId, projectId, proseVersionId: version.id });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const blockers = [{ ruleKey: 'beat.length.out_of_range', severityScore: severityScoreFor('blocking') }];
  const repeated = await repair({
    ownerUserId: userId,
    projectId,
    proseVersionId: version.id,
    previous: { blockers, completedAttempts: 1 },
  });
  expect(repeated.ok).toBe(true);
  if (!repeated.ok) return;
  expect(repeated.value.stop.shouldStop).toBe(true);
  expect(repeated.value.stop.reason).toBe('same_findings_repeated');
});

repairTest('safe-repair: passing version has nothing to repair', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  const uow = createUnitOfWork(prisma);
  const save = createSaveWorkingDraft(uow);
  const snapshot = createSnapshotProseVersion(uow);
  const validate = createValidateProseVersion(uow);
  const repair = createRequestSafeRepair(uow);

  const saved = await save({
    ownerUserId: userId,
    projectId,
    beatId,
    content: 'Mira menatap laut dan menghela napas panjang.',
    expectedRevision: null,
  });
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;
  const snapped = await snapshot({ ownerUserId: userId, projectId, beatId, sourceCandidateId: null });
  expect(snapped.ok).toBe(true);
  if (!snapped.ok) return;
  const validated = await validate({ ownerUserId: userId, projectId, proseVersionId: snapped.value.version.id });
  expect(validated.ok).toBe(true);
  if (!validated.ok) return;
  expect(validated.value.report.passed).toBe(true);

  const result = await repair({ ownerUserId: userId, projectId, proseVersionId: snapped.value.version.id });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('VALIDATION');
});

repairTest('safe-repair: directive projection is pure and static', async () => {
  expect(repairInstructionFor('validation.prose.empty').length).toBeGreaterThan(0);
  expect(repairInstructionFor('unknown.code.here')).toBe('Perbaiki adegan sesuai temuan validasi.');
  expect(severityScoreFor('blocking')).toBe(3);
  expect(severityScoreFor('nope')).toBe(0);
  const d = toRepairDirective({
    id: 'f-1',
    projectId: 'p',
    reportId: 'r',
    proseVersionId: 'v',
    source: 'validator',
    severity: 'blocking',
    ruleKey: 'beat.prose.empty',
    message: 'validation.prose.empty',
    overrideStatus: null,
    overrideReason: null,
  });
  expect(Object.keys(d).sort()).toEqual(['findingKey', 'instruction', 'publicMessageCode']);
});

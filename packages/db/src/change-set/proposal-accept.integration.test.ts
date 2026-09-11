/**
 * verification-matrix: W5.3 atomic proposal accept (S4.4).
 * - accept-proposal: full prose flow — prepare → accept → canon +1 exactly
 *   once, beat accepted pointer set, proposal+group accepted.
 * - accept-cas-stale: CAS fail → proposal stale in NEW tx (conditional).
 * - accept-supersede: sibling proposals superseded in the SAME tx.
 * - proposal-unrelated-version-bump: unrelated canon bump does not invalidate.
 * - user-proposal: source=user with server-owned dependency hash.
 * - publish-artifact: publish accept does not bump canon version.
 * - proposal-operation-hash: tampered ops fail the declared-hash binding.
 */
import { expect } from 'vitest';
import {
  createAcceptProposal,
  createCommitCanonicalChangeSet,
  createGetPendingProposals,
  createMarkStaleProposal,
  createPrepareProseProposal,
  createPublishArtifact,
  createRejectProposal,
  type CanonicalOpPersist,
} from '@narraza/application';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();

function proposalTest(
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
    `w53-${crypto.randomUUID()}@narraza.test`,
  );
  const userId = userRows[0]!.id;
  const projectRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO projects
       (id, owner_user_id, title, intake_path, status, current_canonical_version, revision, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'W53', 'guided', 'active', 0, 0, now(), now())
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

async function prepareUserProposal(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  beatId: string,
  content: string,
) {
  const uow = createUnitOfWork(prisma);
  const prepare = createPrepareProseProposal(uow);
  const result = await prepare({
    ownerUserId: userId,
    projectId,
    beatId,
    source: 'user',
    content,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`prepare failed: ${result.error.publicMessageCode}`);
  return result.value.proposal;
}

proposalTest(
  'accept-proposal: user prose accept bumps canon once and sets beat pointer',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
    const prepared = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'User authored prose for the beat.',
    );
    expect(prepared.operations.map((op) => op.operationType)).toEqual([
      'prose.version.create',
      'prose.accept',
    ]);
    expect(prepared.operationsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.dependencyHash).toMatch(/^[0-9a-f]{64}$/);

    const uow = createUnitOfWork(prisma);
    const accept = createAcceptProposal(uow);
    const result = await accept({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
      baseCanonicalVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedCanonicalVersion).toBe(1);

    // Canon bumped exactly once; change set applied.
    const project = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
      `SELECT current_canonical_version FROM projects WHERE id = $1`,
      projectId,
    );
    expect(project[0]!.current_canonical_version).toBe(1);
    const setRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM canonical_change_sets WHERE id = $1`,
      result.value.changeSetId,
    );
    expect(setRow[0]!.status).toBe('applied');

    // Beat accepted pointer set; proposal + group accepted; no siblings.
    const beatRow = await prisma.$queryRawUnsafe<{ accepted_prose_version_id: string }[]>(
      `SELECT accepted_prose_version_id FROM beats WHERE id = $1`,
      beatId,
    );
    expect(beatRow[0]!.accepted_prose_version_id).toBe(prepared.proseVersionId);
    const proposalRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM proposals WHERE id = $1`,
      prepared.proposalId,
    );
    expect(proposalRow[0]!.status).toBe('accepted');
    const groupRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM proposal_groups WHERE id = $1`,
      prepared.proposalGroupId,
    );
    expect(groupRow[0]!.status).toBe('accepted');

    // Replay accept is rejected (no longer pending).
    const replay = await accept({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
      baseCanonicalVersion: 1,
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.error.code).toBe('CONFLICT');
  },
);

proposalTest(
  'accept-cas-stale: base moved → CAS fail, stale mark in new tx',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
    const prepared = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'Prose waiting on canon.',
    );

    // Unrelated canon bump moves the base to 1.
    const uow = createUnitOfWork(prisma);
    const commit = createCommitCanonicalChangeSet(uow);
    const factOp: CanonicalOpPersist = {
      operationId: crypto.randomUUID(),
      ordinal: 0,
      operationType: 'fact.create',
      targetEntityType: 'fact',
      targetEntityId: crypto.randomUUID(),
      expectedRevision: null,
      risk: 'high',
      payload: {
        factKey: `fk-${crypto.randomUUID().slice(0, 8)}`,
        statement: 'Unrelated canon fact',
        canonStatus: 'confirmed',
        visibility: 'private',
        source: { kind: 'foundation' },
      },
    };
    const bumped = await commit({
      projectId,
      actorUserId: userId,
      origin: 'user',
      baseCanonicalVersion: 0,
      operationsHash: 'b'.repeat(64),
      operations: [factOp],
      requestId: 'req-cas-stale-bump',
    });
    expect(bumped.ok).toBe(true);

    // Stale accept: caller still passes base 0.
    const accept = createAcceptProposal(uow);
    const failed = await accept({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
      baseCanonicalVersion: 0,
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error.code).toBe('CAS_FAILED');

    // Proposal still pending in its own tx (failed accept must not mutate).
    const pendingRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM proposals WHERE id = $1`,
      prepared.proposalId,
    );
    expect(pendingRow[0]!.status).toBe('pending');

    // NEW tx: conditional stale mark.
    const markStale = createMarkStaleProposal(uow);
    const marked = await markStale({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
    });
    expect(marked.ok).toBe(true);
    if (!marked.ok) return;
    expect(marked.value.marked).toBe(true);
    const staleRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM proposals WHERE id = $1`,
      prepared.proposalId,
    );
    expect(staleRow[0]!.status).toBe('stale');

    // Idempotent: second mark is a no-op.
    const remarked = await markStale({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
    });
    expect(remarked.ok).toBe(true);
    if (!remarked.ok) return;
    expect(remarked.value.marked).toBe(false);

    // Foreign user cannot mark.
    const foreignRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
      `intruder-${crypto.randomUUID()}@narraza.test`,
    );
    const foreign = await markStale({
      ownerUserId: foreignRows[0]!.id,
      projectId,
      proposalId: prepared.proposalId,
    });
    expect(foreign.ok).toBe(false);
  },
);

proposalTest(
  'accept-supersede: sibling proposals superseded in the same tx',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
    const first = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'First candidate prose.',
    );
    const second = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'Second candidate prose.',
    );
    // Same auto-created group per (project, beat) prepare? prepare creates a
    // group per user proposal; supersede targets siblings WITHIN one group,
    // so re-point the second proposal into the first's group (same group).
    await prisma.$executeRawUnsafe(
      `UPDATE proposals SET group_id = $1 WHERE id = $2`,
      first.proposalGroupId,
      second.proposalId,
    );

    const uow = createUnitOfWork(prisma);
    const accept = createAcceptProposal(uow);
    const result = await accept({
      ownerUserId: userId,
      projectId,
      proposalId: first.proposalId,
      baseCanonicalVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supersededProposalIds).toEqual([second.proposalId]);

    const statuses = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
      `SELECT id, status FROM proposals WHERE project_id = $1 ORDER BY id`,
      projectId,
    );
    const byId = new Map(statuses.map((row) => [row.id, row.status]));
    expect(byId.get(first.proposalId)).toBe('accepted');
    expect(byId.get(second.proposalId)).toBe('superseded');
  },
);

proposalTest(
  'proposal-unrelated-version-bump: unrelated canon bump keeps proposal valid',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
    const prepared = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'Prose unaffected by facts.',
    );

    // Unrelated fact accept bumps canon without touching the beat.
    const uow = createUnitOfWork(prisma);
    const commit = createCommitCanonicalChangeSet(uow);
    const factOp: CanonicalOpPersist = {
      operationId: crypto.randomUUID(),
      ordinal: 0,
      operationType: 'fact.create',
      targetEntityType: 'fact',
      targetEntityId: crypto.randomUUID(),
      expectedRevision: null,
      risk: 'high',
      payload: {
        factKey: `fk-${crypto.randomUUID().slice(0, 8)}`,
        statement: 'Another unrelated canon fact',
        canonStatus: 'confirmed',
        visibility: 'private',
        source: { kind: 'foundation' },
      },
    };
    const bumped = await commit({
      projectId,
      actorUserId: userId,
      origin: 'user',
      baseCanonicalVersion: 0,
      operationsHash: 'c'.repeat(64),
      operations: [factOp],
      requestId: 'req-unrelated-bump',
    });
    expect(bumped.ok).toBe(true);

    // Accept proceeds at the new base: dependency hash (beat-bound) unchanged.
    const accept = createAcceptProposal(uow);
    const result = await accept({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
      baseCanonicalVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedCanonicalVersion).toBe(2);
  },
);

proposalTest(
  'user-proposal: source=user with server-owned hashes and content required',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);

    // Empty content rejected.
    const uow = createUnitOfWork(prisma);
    const prepare = createPrepareProseProposal(uow);
    const empty = await prepare({
      ownerUserId: userId,
      projectId,
      beatId,
      source: 'user',
      content: '   ',
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.code).toBe('VALIDATION');

    const prepared = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'Manual edit prose.',
    );
    const row = await prisma.$queryRawUnsafe<
      {
        source: string;
        operations_hash: string;
        dependency_hash: string;
        change_set_id: string;
      }[]
    >(
      `SELECT source, operations_hash, dependency_hash, change_set_id
       FROM proposals WHERE id = $1`,
      prepared.proposalId,
    );
    expect(row[0]!.source).toBe('user');
    expect(row[0]!.operations_hash).toBe(prepared.operationsHash);
    expect(row[0]!.dependency_hash).toBe(prepared.dependencyHash);
    expect(row[0]!.change_set_id).toBe(prepared.operationsHash ? row[0]!.change_set_id : '');
    // Real pending change set with the two prose ops persisted.
    const opRows = await prisma.$queryRawUnsafe<{ operation_type: string }[]>(
      `SELECT operation_type FROM canonical_change_operations
      WHERE project_id = $1 AND change_set_id = $2 ORDER BY ordinal`,
      projectId,
      row[0]!.change_set_id,
    );
    expect(opRows.map((r) => r.operation_type)).toEqual(['prose.version.create', 'prose.accept']);

    // Foreign owner cannot prepare.
    const foreignRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', 'active'::user_status, now(), now())
     RETURNING id`,
      `intruder-${crypto.randomUUID()}@narraza.test`,
    );
    const foreign = await prepare({
      ownerUserId: foreignRows[0]!.id,
      projectId,
      beatId,
      source: 'user',
      content: 'foreign text',
    });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.code).toBe('NOT_FOUND');
  },
);

proposalTest(
  'proposal-operation-hash: tampered ops fail the declared-hash binding',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
    const prepared = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'Prose with tampering check.',
    );

    // Tamper with a persisted op payload behind the proposal's back.
    await prisma.$executeRawUnsafe(
      `UPDATE canonical_change_operations
        SET payload = payload || '{"tampered": true}'::jsonb
      WHERE project_id = $1 AND change_set_id = $2 AND operation_type = 'prose.version.create'`,
      projectId,
      (
        await prisma.$queryRawUnsafe<{ change_set_id: string }[]>(
          `SELECT change_set_id FROM proposals WHERE id = $1`,
          prepared.proposalId,
        )
      )[0]!.change_set_id,
    );

    const uow = createUnitOfWork(prisma);
    const accept = createAcceptProposal(uow);
    const result = await accept({
      ownerUserId: userId,
      projectId,
      proposalId: prepared.proposalId,
      baseCanonicalVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.publicMessageCode).toBe('msg.proposal.operations_hash_mismatch');
    // Nothing applied.
    const project = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
      `SELECT current_canonical_version FROM projects WHERE id = $1`,
      projectId,
    );
    expect(project[0]!.current_canonical_version).toBe(0);
  },
);

proposalTest('publish-artifact: publish accept does not bump canon version', async ({ prisma }) => {
  const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
  // Accept prose first so the beat has an accepted version.
  const prepared = await prepareUserProposal(
    prisma,
    userId,
    projectId,
    beatId,
    'Accepted prose to publish.',
  );
  const uow = createUnitOfWork(prisma);
  const accept = createAcceptProposal(uow);
  const accepted = await accept({
    ownerUserId: userId,
    projectId,
    proposalId: prepared.proposalId,
    baseCanonicalVersion: 0,
  });
  expect(accepted.ok).toBe(true);

  // Seed an M4-style pending artifact proposal over the accepted prose.
  const artifactProposalId = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO artifact_proposals
       (id, project_id, prose_version_id, status, dependency_hash, source_job_id,
        schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, NULL, 1, '{}'::jsonb, now(), now())`,
    artifactProposalId,
    projectId,
    prepared.proseVersionId,
    'd'.repeat(64),
  );

  const publish = createPublishArtifact(uow);
  const result = await publish({
    ownerUserId: userId,
    projectId,
    artifactProposalId,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // Canon unchanged by publish.
  expect(result.value.canonicalVersionAfter).toBe(1);
  const project = await prisma.$queryRawUnsafe<{ current_canonical_version: number }[]>(
    `SELECT current_canonical_version FROM projects WHERE id = $1`,
    projectId,
  );
  expect(project[0]!.current_canonical_version).toBe(1);

  // Artifacts materialized with distinct types + content hashes.
  expect(result.value.artifacts.map((a) => a.artifactType)).toEqual(['text', 'markdown']);
  for (const artifact of result.value.artifacts) {
    expect(artifact.contentHash).toMatch(/^[0-9a-f]{64}$/);
  }
  const proposalRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
    `SELECT status FROM artifact_proposals WHERE id = $1`,
    artifactProposalId,
  );
  expect(proposalRow[0]!.status).toBe('accepted');

  // Replay publish is rejected.
  const replay = await publish({
    ownerUserId: userId,
    projectId,
    artifactProposalId,
  });
  expect(replay.ok).toBe(false);
  if (replay.ok) return;
  expect(replay.error.code).toBe('CONFLICT');

  // Publish refuses non-accepted prose: fresh proposal over unaccepted prose.
  const notAccepted = await prepareUserProposal(
    prisma,
    userId,
    projectId,
    beatId,
    'Draft prose never accepted.',
  );
  const artifactProposal2 = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO artifact_proposals
       (id, project_id, prose_version_id, status, dependency_hash, source_job_id,
        schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, NULL, 1, '{}'::jsonb, now(), now())`,
    artifactProposal2,
    projectId,
    notAccepted.proseVersionId,
    'e'.repeat(64),
  );
  const rejected = await publish({
    ownerUserId: userId,
    projectId,
    artifactProposalId: artifactProposal2,
  });
  expect(rejected.ok).toBe(false);
  if (rejected.ok) return;
  expect(rejected.error.publicMessageCode).toBe('msg.artifact.prose_not_accepted');
});

proposalTest(
  'proposal-view: pending list, reject, and needs_revalidation projection',
  async ({ prisma }) => {
    const { userId, projectId, beatId } = await seedOwnerProjectBeat(prisma);
    const first = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'First prose candidate for review.',
    );
    const second = await prepareUserProposal(
      prisma,
      userId,
      projectId,
      beatId,
      'Second prose candidate for review.',
    );
    await prisma.$executeRawUnsafe(
      `UPDATE proposals SET group_id = $1 WHERE id = $2`,
      first.proposalGroupId,
      second.proposalId,
    );

    const uow = createUnitOfWork(prisma);
    const listPending = createGetPendingProposals(uow);
    const reject = createRejectProposal(uow);

    // Both pending proposals visible with server-derived actions.
    const listed = await listPending({ ownerUserId: userId, projectId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const byId = new Map(listed.value.map((row) => [row.view.proposalId, row]));
    expect(byId.size).toBe(2);
    const firstView = byId.get(first.proposalId)!.view;
    expect(firstView.availableActions).toEqual(['accept', 'reject']);
    expect(firstView.source).toBe('user');
    expect(firstView.highRisk).toBe(true);
    expect(firstView.proseExcerpt).toContain('First prose candidate');
    expect(firstView.operations.map((op) => op.kind)).toEqual([
      'prose.version.create',
      'prose.accept',
    ]);

    // Sanitization: serialized view carries no payload/hash keys.
    for (const row of listed.value) {
      const keys = Object.keys(JSON.parse(JSON.stringify(row.view)) as Record<string, unknown>);
      expect(keys).not.toContain('operationsHash');
      expect(keys).not.toContain('dependencyHash');
      expect(keys).not.toContain('payload');
    }

    // Reject one; the sibling remains actionable.
    const rejected = await reject({
      ownerUserId: userId,
      projectId,
      proposalId: second.proposalId,
    });
    expect(rejected.ok).toBe(true);
    const afterReject = await listPending({ ownerUserId: userId, projectId });
    expect(afterReject.ok).toBe(true);
    if (!afterReject.ok) return;
    expect(afterReject.value.map((row) => row.view.proposalId)).toEqual([first.proposalId]);
    // Group stays pending while a sibling is pending.
    const groupRow = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM proposal_groups WHERE id = $1`,
      first.proposalGroupId,
    );
    expect(groupRow[0]!.status).toBe('pending');

    // Beat revision bump (unrelated outline edit) → needs_revalidation view.
    await prisma.$executeRawUnsafe(
      `UPDATE beats SET revision = revision + 1, payload = '{"title":"moved"}'::jsonb WHERE id = $1`,
      beatId,
    );
    const staleListed = await listPending({ ownerUserId: userId, projectId });
    expect(staleListed.ok).toBe(true);
    if (!staleListed.ok) return;
    expect(staleListed.value[0]!.view.status).toBe('needs_revalidation');
    expect(staleListed.value[0]!.view.availableActions).toEqual([]);

    // Reject on a decided proposal conflicts.
    const secondReject = await reject({
      ownerUserId: userId,
      projectId,
      proposalId: second.proposalId,
    });
    expect(secondReject.ok).toBe(false);
    if (secondReject.ok) return;
    expect(secondReject.error.code).toBe('CONFLICT');
  },
);

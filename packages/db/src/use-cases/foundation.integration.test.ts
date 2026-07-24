/**
 * Foundation draft / confirm / lock + readiness guard.
 */
import { expect } from 'vitest';
import {
  createConfirmFoundation,
  createCreateProject,
  createLockFoundation,
  createUpdateFoundationDraft,
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

/** Complete readiness payload matching core foundation-readiness fixtures. */
function completePayload() {
  return {
    coreConcept: 'A promise carries a hidden cost.',
    mainCharacter: {
      id: 'main',
      active: true,
      identity: 'An idealistic courier',
      goal: 'Deliver the final letter',
      motivation: 'Protect her sister',
      address: 'Mira',
      speechStyle: 'Brief and formal',
    },
    relationships: [
      {
        fromCharacterId: 'other',
        toCharacterId: 'main',
        active: true,
        description: 'Former allies forced to cooperate',
      },
    ],
    conflict: 'The recipient wants the letter destroyed.',
    endingDirection: 'Mira reveals the cost and chooses exile.',
    readerPromise: 'A tense moral mystery with earned answers.',
    secrets: [
      {
        truth: 'Mira wrote the letter herself.',
        targetPosition: { chapterId: 'chapter-8', sequence: 8 },
        breadcrumbPositions: [
          { chapterId: 'chapter-2', sequence: 2 },
          { chapterId: 'chapter-5', sequence: 5 },
        ],
      },
    ],
  };
}

ucTest('foundation draft save, lock blocked when incomplete, lock succeeds when ready', async ({
  prisma,
}) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const updateDraft = createUpdateFoundationDraft(uow);
  const confirm = createConfirmFoundation(uow);
  const lock = createLockFoundation(uow);

  const project = await createProject({ ownerUserId: userId, jalur: 'rough_idea' });
  expect(project.ok).toBe(true);
  if (!project.ok) return;
  const projectId = project.value.project.id;

  // Incomplete draft
  const draft = await updateDraft({
    ownerUserId: userId,
    projectId,
    payload: { coreConcept: 'Only a seed', mainCharacter: null, relationships: [], conflict: null, endingDirection: null, readerPromise: null, secrets: [] },
    expectedRevision: null,
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) return;
  expect(draft.value.foundation.status).toBe('draft');

  // Confirm incomplete is allowed (confirm ≠ lock)
  const confirmed = await confirm({ ownerUserId: userId, projectId });
  expect(confirmed.ok).toBe(true);
  if (!confirmed.ok) return;
  expect(confirmed.value.foundation.status).toBe('confirmed');

  // Lock incomplete → FOUNDATION_NOT_READY
  const blocked = await lock({ ownerUserId: userId, projectId, acknowledged: true });
  expect(blocked.ok).toBe(false);
  if (blocked.ok) return;
  expect(blocked.error.code).toBe('FOUNDATION_NOT_READY');

  // Need draft again to edit: re-insert path is blocked when confirmed.
  // For M2: set payload via raw SQL to complete, keep status confirmed, then lock.
  await prisma.$executeRawUnsafe(
    `UPDATE foundations SET payload = $1::jsonb, updated_at = now() WHERE project_id = $2`,
    JSON.stringify(completePayload()),
    projectId,
  );

  const locked = await lock({ ownerUserId: userId, projectId, acknowledged: true });
  expect(locked.ok).toBe(true);
  if (!locked.ok) return;
  expect(locked.value.foundation.status).toBe('locked');

  // Further draft update rejected
  const afterLock = await updateDraft({
    ownerUserId: userId,
    projectId,
    payload: { coreConcept: 'nope' },
    expectedRevision: null,
  });
  expect(afterLock.ok).toBe(false);
  if (afterLock.ok) return;
  expect(afterLock.error.code).toBe('FOUNDATION_LOCKED');
});

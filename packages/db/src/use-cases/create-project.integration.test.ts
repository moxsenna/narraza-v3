/**
 * Integration: createProject + appendIntakeMessage (W2.3).
 */
import { expect } from 'vitest';
import {
  createAppendIntakeMessage,
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

ucTest('createProject inserts project + intake session + opening assistant message', async ({
  prisma,
}) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);

  const result = await createProject({
    ownerUserId: userId,
    jalur: 'rough_idea',
    title: 'Cerita uji',
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.project.ownerUserId).toBe(userId);
  expect(result.value.project.title).toBe('Cerita uji');
  expect(result.value.project.intakePath).toBe('guided');
  expect(result.value.project.status).toBe('active');
  expect(result.value.intakeSession.projectId).toBe(result.value.project.id);
  expect(result.value.openingMessage.role).toBe('assistant');
  expect(result.value.openingMessage.sequence).toBe(0);
  expect(result.value.openingMessage.content.length).toBeGreaterThan(0);

  const msgs = await prisma.$queryRawUnsafe<{ role: string; sequence: number }[]>(
    `SELECT role, sequence FROM intake_messages WHERE project_id = $1 ORDER BY sequence`,
    result.value.project.id,
  );
  expect(msgs).toHaveLength(1);
  expect(msgs[0]!.role).toBe('assistant');
});

ucTest('createProject rejects has_draft jalur', async ({ prisma }) => {
  const userId = await seedUser(prisma);
  const createProject = createCreateProject(createUnitOfWork(prisma));
  const result = await createProject({ ownerUserId: userId, jalur: 'has_draft' });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('VALIDATION');
});

ucTest('appendIntakeMessage appends user message with monotonic sequence', async ({
  prisma,
}) => {
  const userId = await seedUser(prisma);
  const uow = createUnitOfWork(prisma);
  const createProject = createCreateProject(uow);
  const append = createAppendIntakeMessage(uow);

  const created = await createProject({ ownerUserId: userId, jalur: 'no_idea' });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const r1 = await append({
    ownerUserId: userId,
    projectId: created.value.project.id,
    content: 'Aku ingin cerita tentang hujan.',
  });
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;
  expect(r1.value.message.role).toBe('user');
  expect(r1.value.sequence).toBe(1);

  const r2 = await append({
    ownerUserId: userId,
    projectId: created.value.project.id,
    content: 'Tokoh utamanya seorang penari.',
  });
  expect(r2.ok).toBe(true);
  if (!r2.ok) return;
  expect(r2.value.sequence).toBe(2);

  // Wrong owner → NOT_FOUND
  const idor = await append({
    ownerUserId: crypto.randomUUID(),
    projectId: created.value.project.id,
    content: 'hack',
  });
  expect(idor.ok).toBe(false);
  if (idor.ok) return;
  expect(idor.error.code).toBe('NOT_FOUND');
});

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { JsonObject } from '@narraza/application';
import { createVerifiedSession } from './support/auth-session';

const syntheticFallbackValues = ['main', 'other', 'chapter-10', 'chapter-2', 'chapter-5'];

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_WEB or DATABASE_URL is required for Foundation preservation E2E');
  }
  return databaseUrl;
}

function expectNoSyntheticValues(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const fallback of syntheticFallbackValues) {
    expect(serialized).not.toContain(`"${fallback}"`);
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function preservationProjection(payloadValue: unknown) {
  const payload = requireRecord(payloadValue, 'payload');
  const mainCharacter = requireRecord(payload.mainCharacter, 'payload.mainCharacter');
  const relationship = requireRecord(
    requireArray(payload.relationships, 'payload.relationships')[0],
    'payload.relationships[0]',
  );
  const secret = requireRecord(
    requireArray(payload.secrets, 'payload.secrets')[0],
    'payload.secrets[0]',
  );
  const target = requireRecord(secret.targetPosition, 'payload.secrets[0].targetPosition');
  const breadcrumbs = requireArray(
    secret.breadcrumbPositions,
    'payload.secrets[0].breadcrumbPositions',
  );
  const breadcrumb0 = requireRecord(breadcrumbs[0], 'payload.secrets[0].breadcrumbPositions[0]');
  const breadcrumb1 = requireRecord(breadcrumbs[1], 'payload.secrets[0].breadcrumbPositions[1]');

  return {
    payload,
    mainCharacterId: requireString(mainCharacter.id, 'payload.mainCharacter.id'),
    relationshipFromCharacterId: requireString(
      relationship.fromCharacterId,
      'payload.relationships[0].fromCharacterId',
    ),
    relationshipToCharacterId: requireString(
      relationship.toCharacterId,
      'payload.relationships[0].toCharacterId',
    ),
    relationshipDescription: requireString(
      relationship.description,
      'payload.relationships[0].description',
    ),
    targetChapterId: requireString(target.chapterId, 'payload.secrets[0].targetPosition.chapterId'),
    targetSequence: requireNumber(target.sequence, 'payload.secrets[0].targetPosition.sequence'),
    breadcrumb0ChapterId: requireString(
      breadcrumb0.chapterId,
      'payload.secrets[0].breadcrumbPositions[0].chapterId',
    ),
    breadcrumb0Sequence: requireNumber(
      breadcrumb0.sequence,
      'payload.secrets[0].breadcrumbPositions[0].sequence',
    ),
    breadcrumb1ChapterId: requireString(
      breadcrumb1.chapterId,
      'payload.secrets[0].breadcrumbPositions[1].chapterId',
    ),
    breadcrumb1Sequence: requireNumber(
      breadcrumb1.sequence,
      'payload.secrets[0].breadcrumbPositions[1].sequence',
    ),
  };
}

test.describe.configure({ timeout: 120_000 });

test('persisted Foundation projection survives editing only coreConcept in browser', async ({
  page,
}, testInfo) => {
  const [
    { createCreateProject, createUpdateFoundationDraft },
    { createPrismaClient, createUnitOfWork },
  ] = await Promise.all([
    import('../../packages/application/dist/index.js'),
    import('../../packages/db/dist/index.js'),
  ]);
  const prisma = createPrismaClient(requireDatabaseUrl());

  try {
    const { email } = await createVerifiedSession(page, testInfo);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    if (!user) throw new Error(`registered user not found: ${email}`);

    const stamp = randomUUID();
    const mainCharacterId = `main-character-${stamp}`;
    const otherCharacterId = `relationship-character-${stamp}`;
    const targetChapterId = `target-chapter-${stamp}`;
    const breadcrumb1ChapterId = `breadcrumb-one-${stamp}`;
    const breadcrumb2ChapterId = `breadcrumb-two-${stamp}`;
    const originalCoreConcept = `Konsep awal ${stamp}`;
    const changedCoreConcept = `Konsep hasil edit ${stamp}`;

    const uow = createUnitOfWork(prisma);
    const createProject = createCreateProject(uow);
    const projectResult = await createProject({
      ownerUserId: user.id,
      jalur: 'rough_idea',
      title: `Foundation preservation ${stamp}`,
    });
    expect(projectResult.ok).toBe(true);
    if (!projectResult.ok) {
      throw new Error(`project seed failed: ${projectResult.error.publicMessageCode}`);
    }
    const projectId = projectResult.value.project.id;

    const seedPayload = {
      coreConcept: originalCoreConcept,
      conflict: `Konflik ${stamp}`,
      endingDirection: `Akhir ${stamp}`,
      readerPromise: `Janji ${stamp}`,
      mainCharacter: {
        id: mainCharacterId,
        active: true,
        identity: `Identitas ${stamp}`,
        goal: `Tujuan ${stamp}`,
        motivation: `Motivasi ${stamp}`,
        address: `Panggilan ${stamp}`,
        speechStyle: `Gaya bicara ${stamp}`,
      },
      relationships: [
        {
          fromCharacterId: mainCharacterId,
          toCharacterId: otherCharacterId,
          active: true,
          description: `Relasi ${stamp}`,
        },
      ],
      secrets: [
        {
          truth: `Rahasia ${stamp}`,
          targetPosition: { chapterId: targetChapterId, sequence: 37 },
          breadcrumbPositions: [
            { chapterId: breadcrumb1ChapterId, sequence: 11 },
            { chapterId: breadcrumb2ChapterId, sequence: 23 },
          ],
        },
      ],
    } satisfies JsonObject;

    const updateFoundation = createUpdateFoundationDraft(uow);
    const foundationResult = await updateFoundation({
      ownerUserId: user.id,
      projectId,
      payload: seedPayload,
      expectedRevision: null,
    });
    expect(foundationResult.ok).toBe(true);
    if (!foundationResult.ok) {
      throw new Error(`Foundation seed failed: ${foundationResult.error.publicMessageCode}`);
    }

    const before = await prisma.foundation.findUniqueOrThrow({ where: { projectId } });
    const beforeProjection = preservationProjection(before.payload);
    expect(beforeProjection.payload).toEqual(seedPayload);
    expect(beforeProjection.relationshipFromCharacterId).toBe(mainCharacterId);
    expect(beforeProjection.relationshipToCharacterId).toBe(otherCharacterId);
    expectNoSyntheticValues(before.payload);

    await page.goto(`/app/proyek/${projectId}/fondasi`);
    await expect(page.locator('textarea[name="coreConcept"]')).toHaveValue(originalCoreConcept);
    await expect(page.locator('input[name="mainCharacterId"]')).toHaveValue(mainCharacterId);
    await expect(page.locator('input[name="relationshipOtherId"]')).toHaveValue(otherCharacterId);
    await expect(page.locator('input[name="relationshipMainIsFrom"]')).toHaveValue('true');
    await expect(page.locator('input[name="secretTargetChapterId"]')).toHaveValue(targetChapterId);
    await expect(page.locator('input[name="secretTargetSequence"]')).toHaveValue('37');
    await expect(page.locator('input[name="secretBreadcrumb1ChapterId"]')).toHaveValue(
      breadcrumb1ChapterId,
    );
    await expect(page.locator('input[name="secretBreadcrumb1Sequence"]')).toHaveValue('11');
    await expect(page.locator('input[name="secretBreadcrumb2ChapterId"]')).toHaveValue(
      breadcrumb2ChapterId,
    );
    await expect(page.locator('input[name="secretBreadcrumb2Sequence"]')).toHaveValue('23');

    const hiddenValues = await page
      .locator('input[type="hidden"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    expectNoSyntheticValues(hiddenValues);

    await page.locator('textarea[name="coreConcept"]').fill(changedCoreConcept);
    await page.getByRole('button', { name: 'Simpan draft' }).click();

    await expect
      .poll(
        async () => {
          const persisted = await prisma.foundation.findUniqueOrThrow({ where: { projectId } });
          const payload = persisted.payload as Record<string, unknown>;
          return { coreConcept: payload.coreConcept, revision: persisted.revision };
        },
        { timeout: 15_000 },
      )
      .toEqual({ coreConcept: changedCoreConcept, revision: before.revision + 1 });

    const after = await prisma.foundation.findUniqueOrThrow({ where: { projectId } });
    const afterProjection = preservationProjection(after.payload);
    expect(afterProjection.payload.coreConcept).toBe(changedCoreConcept);

    expect(afterProjection.mainCharacterId).toBe(beforeProjection.mainCharacterId);
    expect(afterProjection.relationshipFromCharacterId).toBe(mainCharacterId);
    expect(afterProjection.relationshipToCharacterId).toBe(otherCharacterId);
    expect(afterProjection.relationshipFromCharacterId).toBe(
      beforeProjection.relationshipFromCharacterId,
    );
    expect(afterProjection.relationshipToCharacterId).toBe(
      beforeProjection.relationshipToCharacterId,
    );
    expect(afterProjection.relationshipDescription).toBe(beforeProjection.relationshipDescription);
    expect(afterProjection.targetChapterId).toBe(beforeProjection.targetChapterId);
    expect(afterProjection.targetSequence).toBe(beforeProjection.targetSequence);
    expect(afterProjection.breadcrumb0ChapterId).toBe(beforeProjection.breadcrumb0ChapterId);
    expect(afterProjection.breadcrumb0Sequence).toBe(beforeProjection.breadcrumb0Sequence);
    expect(afterProjection.breadcrumb1ChapterId).toBe(beforeProjection.breadcrumb1ChapterId);
    expect(afterProjection.breadcrumb1Sequence).toBe(beforeProjection.breadcrumb1Sequence);

    expect(afterProjection.payload.conflict).toEqual(beforeProjection.payload.conflict);
    expect(afterProjection.payload.endingDirection).toEqual(
      beforeProjection.payload.endingDirection,
    );
    expect(afterProjection.payload.readerPromise).toEqual(beforeProjection.payload.readerPromise);
    expect(afterProjection.payload.mainCharacter).toEqual(beforeProjection.payload.mainCharacter);
    expect(afterProjection.payload.relationships).toEqual(beforeProjection.payload.relationships);
    expect(afterProjection.payload.secrets).toEqual(beforeProjection.payload.secrets);
    expectNoSyntheticValues(after.payload);
  } finally {
    await prisma.$disconnect();
  }
});

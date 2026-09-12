/**
 * M4 dev/mock vertical E2E fixture.
 *
 * Seeds real product state through real application services: verified
 * session, project, and a credit grant. Outline nodes are created through the
 * REAL outline services — but only AFTER the concept acceptance, because the
 * real product gate (msg.outline.foundation_not_locked) requires a locked
 * foundation before outline authoring while concept acceptance requires an
 * unlocked one. The ONE driver-seeded row is the prerequisite ProseVersion —
 * prose authoring is an M5/M6 capability, so the worker-side test support
 * (never the web app) materializes the row the repair/publish projections
 * bind to, mirroring the m4-actual-worker-certification seeding approach.
 */
import { createHash, randomUUID } from 'node:crypto';
import { type Page, type TestInfo } from '@playwright/test';
import { createVerifiedSession } from './auth-session';
import { grantBookCredit } from './m3-fixture';

const DATABASE_URL = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;

export type M4VerticalFixture = Readonly<{
  userId: string;
  projectId: string;
}>;

export async function seedM4VerticalForCurrentUser({
  page,
  testInfo,
  label,
}: {
  page: Page;
  testInfo: TestInfo;
  label: string;
}): Promise<M4VerticalFixture> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M4 fixture');
  const [application, db] = await Promise.all([
    import('../../../packages/application/dist/index.js'),
    import('../../../packages/db/dist/index.js'),
  ]);

  const email = (await createVerifiedSession(page, testInfo)).email;
  const prisma = db.createPrismaClient(DATABASE_URL);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Registered user not found: ${email}`);
    const uow = db.createUnitOfWork(prisma);

    const projectResult = await application.createCreateProject(uow)({
      ownerUserId: user.id,
      jalur: 'rough_idea' as const,
      title: `M4 Vertical ${label}`,
    });
    if (!projectResult.ok) {
      throw new Error(`project seed failed: ${projectResult.error.publicMessageCode}`);
    }
    const projectId = projectResult.value.project.id;
    await prisma.$disconnect();
    await grantBookCredit(user.id, 1_000_000_000n);

    return { userId: user.id, projectId };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Second-stage seed, run AFTER the harness concept acceptance: confirm + lock
 * the real foundation draft, create the outline tree through the REAL outline
 * services (the real product gate requires a locked foundation), and
 * materialize the prerequisite prose row.
 */
export async function seedM4OutlineForProject(fixture: M4VerticalFixture): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M4 fixture');
  const application = await import('../../../packages/application/dist/index.js');
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(DATABASE_URL);
  try {
    const uow = db.createUnitOfWork(prisma);
    // The concept-derived draft is incomplete (the mock concept carries no
    // structured fields), so the owner completes it through the REAL M2
    // foundation edit flow before confirm/lock — the same CAS-guarded door
    // the product UI uses.
    const current = await prisma.foundation.findUnique({
      where: { projectId: fixture.projectId },
    });
    if (!current) throw new Error('foundation draft missing after concept accept');
    const edit = application.createUpdateFoundationDraft(uow);
    const edited = await edit({
      ownerUserId: fixture.userId,
      projectId: fixture.projectId,
      expectedRevision: current.revision,
      payload: {
        coreConcept: current.payload['coreConcept'],
        conflict: 'Konflik mesin waktu vs ritme harian kedai.',
        endingDirection: 'Akhir: kedai bertahan karena rahasia terungkap.',
        readerPromise: 'Janji: tiap bab membuka satu kejutan kecil.',
        mainCharacter: {
          id: 'main-character-m4',
          active: true,
          identity: 'Barista pemilik kedai',
          goal: 'Menyelamatkan kedai dari kebangkrutan',
          motivation: 'Cinta pada tempat kerjanya',
          address: 'Kamu',
          speechStyle: 'Hangat dan singkat',
        },
        relationships: [
          {
            fromCharacterId: 'main-character-m4',
            toCharacterId: 'relationship-character-m4',
            active: true,
            description: 'Relasi pelanggan tetap yang menyimpan rahasia',
          },
        ],
        secrets: [
          {
            truth: 'Mesin waktu menyimpan ingatan pelanggan pertama',
            targetPosition: { chapterId: 'target-chapter-m4', sequence: 10 },
            breadcrumbPositions: [{ chapterId: 'breadcrumb-m4', sequence: 4 }],
          },
        ],
      },
    });
    if (!edited.ok) throw new Error(`foundation edit failed: ${edited.error.publicMessageCode}`);

    const confirm = application.createConfirmFoundation(uow);
    const confirmed = await confirm({ ownerUserId: fixture.userId, projectId: fixture.projectId });
    if (!confirmed.ok) {
      throw new Error(`confirm failed: ${confirmed.error.publicMessageCode}`);
    }
    const lock = application.createLockFoundation(uow);
    const locked = await lock({
      ownerUserId: fixture.userId,
      projectId: fixture.projectId,
      acknowledged: true,
    });
    if (!locked.ok) throw new Error(`lock failed: ${locked.error.publicMessageCode}`);

    const upsert = application.createUpsertOutlineNode(uow);
    const roadmap = await upsert({
      ownerUserId: fixture.userId,
      projectId: fixture.projectId,
      entityType: 'roadmap',
      title: 'Roadmap: M4 Vertical',
    });
    if (!roadmap.ok) throw new Error(`roadmap seed failed: ${roadmap.error.publicMessageCode}`);
    const arc = await upsert({
      ownerUserId: fixture.userId,
      projectId: fixture.projectId,
      entityType: 'arc',
      parentId: roadmap.value.node.id,
      title: 'Arc 1',
      ordinal: 1,
    });
    if (!arc.ok) throw new Error(`arc seed failed: ${arc.error.publicMessageCode}`);
    const chapter = await upsert({
      ownerUserId: fixture.userId,
      projectId: fixture.projectId,
      entityType: 'chapter',
      parentId: arc.value.node.id,
      title: 'Bab 1 - Awal',
      ordinal: 1,
      narrativeSequence: 1,
    });
    if (!chapter.ok) throw new Error(`chapter seed failed: ${chapter.error.publicMessageCode}`);
    const beat = await upsert({
      ownerUserId: fixture.userId,
      projectId: fixture.projectId,
      entityType: 'beat',
      parentId: chapter.value.node.id,
      title: 'Adegan 1',
      ordinal: 1,
      narrativeSequence: 1,
    });
    if (!beat.ok) throw new Error(`beat seed failed: ${beat.error.publicMessageCode}`);

    const proseContent = 'Draf konteks nyata untuk peraduan M4.';
    await prisma.proseVersion.create({
      data: {
        id: `e2e-prose-${randomUUID()}`,
        projectId: fixture.projectId,
        beatId: beat.value.node.id,
        status: 'draft',
        revision: 0,
        content: proseContent,
        contentHash: createHash('sha256').update(proseContent).digest('hex'),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

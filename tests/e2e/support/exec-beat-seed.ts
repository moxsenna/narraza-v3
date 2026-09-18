const dbUrl = () => {
  const url = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for exec beat seed');
  return url;
};

/** Seeds one open beat under the chapter for the exec-success spec. */
export async function seedBeatForChapter(
  ownerId: string,
  projectId: string,
  chapterId: string,
): Promise<{ beatId: string; beatTitle: string }> {
  const application = await import('../../../packages/application/dist/index.js');
  const db = await import('../../../packages/db/dist/index.js');
  const prisma = db.createPrismaClient(dbUrl());
  try {
    const uow = db.createUnitOfWork(prisma);
    const beatTitle = 'Adegan eksekusi 1';
    const beat = await application.createUpsertOutlineNode(uow)({
      ownerUserId: ownerId,
      projectId,
      entityType: 'beat',
      parentId: chapterId,
      title: beatTitle,
      ordinal: 1,
      narrativeSequence: 1,
    });
    if (!beat.ok) throw new Error(`beat seed: ${beat.error.publicMessageCode}`);
    return { beatId: beat.value.node.id, beatTitle };
  } finally {
    await prisma.$disconnect();
  }
}

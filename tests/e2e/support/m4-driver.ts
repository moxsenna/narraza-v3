/**
 * M4 dev/mock vertical driver.
 *
 * Drives jobs created by the harness UI through the REAL worker path: the
 * global FIFO claim service (terminating foreign leftovers through the real
 * failure path, exactly like the M3 driver) followed by the REAL M4 job
 * processor from apps/worker-gen with the deterministic mock provider. The
 * mock only replaces the provider transport; claim, lease, plan/bundle
 * binding, stage orchestration, usage settlement, and the fenced product
 * projection are the actual server behavior.
 */
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL;

export type M4Driver = Readonly<{
  /** Claims and processes the next job for `projectId`; 'none' if the queue has none. */
  processNextForProject(projectId: string): Promise<'processed' | 'none'>;
  disconnect(): Promise<void>;
}>;

export async function createM4Driver(): Promise<M4Driver> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_WEB required for M4 driver');
  const [application, db, ai, worker] = await Promise.all([
    import('../../../packages/application/dist/index.js'),
    import('../../../packages/db/dist/index.js'),
    import('../../../packages/ai/dist/index.js'),
    import('../../../apps/worker-gen/dist/m4-job-processor.js'),
  ]);

  const prisma = db.createPrismaClient(DATABASE_URL);
  const uow = db.createUnitOfWork(prisma);
  const jobs = application.createJobService(uow);
  const processor = worker.createM4JobProcessor({
    unitOfWork: uow,
    providers: new Map([['mock', ai.createM4MockProvider()]]),
  });

  return {
    async processNextForProject(projectId) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const claimed = await jobs.claim({
          leaseToken: randomUUID(),
          leaseDurationMs: 120_000,
        });
        if (claimed.kind !== 'claimed') return 'none';
        if (claimed.identity.projectId !== projectId) {
          await jobs.finish({ ...claimed.identity, status: 'failed' });
          continue;
        }
        const job = await uow.execute((ports) =>
          ports.job.findById({
            projectId: claimed.identity.projectId,
            jobId: claimed.identity.jobId,
          }),
        );
        if (!job) throw new Error('claimed M4 job disappeared before processing');
        const outcome = await processor(job, new AbortController().signal);
        if (outcome.kind === 'requeue') continue;
        return 'processed';
      }
      return 'none';
    },

    async disconnect() {
      await prisma.$disconnect();
    },
  };
}

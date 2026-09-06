import { describe, expect, it, vi } from 'vitest';
import { createJobLoop } from './job-loop.js';

const claimedJob = {
  id: 'job-1',
  projectId: 'project-1',
  leaseToken: 'lease-1',
  fenceVersion: 1,
};

function loopFor(processor: () => Promise<{ kind: 'terminalized' }>) {
  const service = {
    claim: vi.fn().mockResolvedValue({
      kind: 'claimed',
      job: claimedJob,
      identity: {
        projectId: claimedJob.projectId,
        jobId: claimedJob.id,
        leaseToken: claimedJob.leaseToken,
        fenceVersion: claimedJob.fenceVersion,
      },
    }),
    heartbeat: vi.fn().mockResolvedValue({ kind: 'extended', job: claimedJob }),
    reclaimOne: vi.fn().mockResolvedValue({ kind: 'none' }),
    requeue: vi.fn(),
    withFencedPublish: vi.fn(),
  };
  return {
    service,
    loop: createJobLoop({
      service,
      processor,
      sweepCreditRetention: vi.fn().mockResolvedValue({ deletedQuotes: 0, deletedBundles: 0 }),
      settings: {
        leaseMs: 60_000,
        heartbeatMs: 20_000,
        reclaimSweepMs: 30_000,
        pollMs: 1,
        errorBackoffMs: 1,
        shutdownDrainMs: 30_000,
        retentionSweepMs: 60_000,
        retentionMaxAgeHours: 24,
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn(() => setTimeout(() => undefined, 60_000)),
      cancelTimer: clearTimeout,
      disconnect: vi.fn().mockResolvedValue(undefined),
      createLeaseToken: () => 'lease-1',
      logger: { info: vi.fn(), error: vi.fn() },
    }),
  };
}

describe('M4 processor publish ownership', () => {
  it('does not perform loop-level fenced publish after processor terminalizes', async () => {
    const processor = vi.fn().mockResolvedValue({ kind: 'terminalized' as const });
    const { service, loop } = loopFor(processor);
    await loop.pollOnce();
    expect(processor).toHaveBeenCalledOnce();
    expect(service.withFencedPublish).not.toHaveBeenCalled();
    expect(service.requeue).not.toHaveBeenCalled();
    await loop.shutdown();
  });
});

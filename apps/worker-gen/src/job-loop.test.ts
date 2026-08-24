import { describe, expect, it, vi } from 'vitest';
import { createJobLoop, type JobLoopDependencies } from './job-loop.js';

const identity = { projectId: 'p', jobId: 'j', leaseToken: 'token', fenceVersion: 1 };
const claimed = { kind: 'claimed' as const, job: { id: 'j' }, identity };

function harness(overrides: Partial<JobLoopDependencies> = {}) {
  const service = {
    claim: vi.fn().mockResolvedValue({ kind: 'none' }),
    heartbeat: vi.fn().mockResolvedValue({ kind: 'extended', job: {} }),
    reclaimOne: vi.fn().mockResolvedValue({ kind: 'none' }),
    requeue: vi.fn().mockResolvedValue({ kind: 'requeued', job: {} }),
    withFencedPublish: vi.fn().mockImplementation(async (_identity, publish) => {
      await publish({ appendSentinel: vi.fn() });
      return { kind: 'published', job: {} };
    }),
  };
  const deps: JobLoopDependencies = {
    service,
    processor: vi.fn().mockResolvedValue(undefined),
    sweepStaleClosing: vi.fn().mockResolvedValue({ discovered: 0, closed: 0 }),
    settings: {
      leaseMs: 60_000,
      heartbeatMs: 20_000,
      reclaimSweepMs: 30_000,
      staleClosingSweepMs: 3_600_000,
      staleClosingMaxAgeHours: 24,
      pollMs: 1_000,
      errorBackoffMs: 5_000,
      shutdownDrainMs: 30_000,
    },
    sleep: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn((callback, ms) => setTimeout(callback, ms)),
    cancelTimer: vi.fn((timer) => clearTimeout(timer)),
    disconnect: vi.fn().mockResolvedValue(undefined),
    createLeaseToken: () => 'token',
    logger: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
  return { service, deps, loop: createJobLoop(deps) };
}

describe('job loop', () => {
  it('does not claim without a processor but reclaim stays active', async () => {
    const { service, deps, loop } = harness({ processor: undefined });
    await loop.pollOnce();
    await loop.reclaimOnce();
    expect(service.claim).not.toHaveBeenCalled();
    expect(service.reclaimOne).toHaveBeenCalledOnce();
    expect(deps.schedule).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it('runs stale-closing maintenance without processor, avoids overlap, and schedules hourly', async () => {
    let release!: () => void;
    const pending = new Promise<{ discovered: number; closed: number }>((resolve) => {
      release = () => resolve({ discovered: 1, closed: 1 });
    });
    const sweepStaleClosing = vi.fn().mockReturnValue(pending);
    const { deps, loop } = harness({ processor: undefined, sweepStaleClosing });

    const first = loop.sweepStaleClosingOnce();
    const second = loop.sweepStaleClosingOnce();
    expect(sweepStaleClosing).toHaveBeenCalledOnce();
    expect(sweepStaleClosing).toHaveBeenCalledWith({ maxAgeHours: 24 });
    release();
    await Promise.all([first, second]);

    expect(deps.schedule).toHaveBeenCalledWith(expect.any(Function), 3_600_000);
    expect(deps.logger.info).toHaveBeenCalledWith({
      event: 'credit_stale_closing_sweep',
      discovered: 1,
      closed: 1,
    });
  });

  it('stops stale-closing scheduling and bounds an in-flight sweep during shutdown', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<never>(() => {});
      const sweepStaleClosing = vi.fn().mockReturnValue(never);
      const { deps, loop } = harness({
        processor: undefined,
        sweepStaleClosing,
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancelTimer: clearTimeout,
      });

      loop.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(sweepStaleClosing).toHaveBeenCalledOnce();

      const shutdown = loop.shutdown();
      await vi.advanceTimersByTimeAsync(30_000);
      await shutdown;
      await vi.advanceTimersByTimeAsync(3_600_000);

      expect(sweepStaleClosing).toHaveBeenCalledOnce();
      expect(deps.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('claims and processes serially with exact lease and AbortSignal', async () => {
    let release!: () => void;
    const stage = new Promise<void>((resolve) => (release = resolve));
    const processor = vi.fn().mockReturnValue(stage);
    const { service, loop } = harness({ processor });
    service.claim.mockResolvedValue(claimed);
    const first = loop.pollOnce();
    await vi.waitFor(() => expect(processor).toHaveBeenCalledOnce());
    const second = loop.pollOnce();
    expect(service.claim).toHaveBeenCalledTimes(1);
    expect(service.claim).toHaveBeenCalledWith({ leaseToken: 'token', leaseDurationMs: 60_000 });
    expect(processor.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    release();
    await Promise.all([first, second]);
    expect(service.withFencedPublish).toHaveBeenCalledOnce();
  });

  it('sleeps poll default on empty and error backoff on claim error', async () => {
    const { service, deps, loop } = harness();
    await loop.pollOnce();
    expect(deps.sleep).toHaveBeenLastCalledWith(1_000);
    service.claim.mockRejectedValueOnce(new Error('boom'));
    await loop.pollOnce();
    expect(deps.sleep).toHaveBeenLastCalledWith(5_000);
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_poll_error' }),
    );
  });

  it('uses heartbeat result, aborts lost ownership, and blocks publish', async () => {
    let release!: () => void;
    const processor = vi.fn(
      (_job, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          release = resolve;
          signal.addEventListener('abort', resolve, { once: true });
        }),
    );
    const scheduled: Array<() => void> = [];
    const { service, deps, loop } = harness({
      processor,
      schedule: vi.fn((callback) => {
        scheduled.push(callback);
        return {} as ReturnType<typeof setTimeout>;
      }),
    });
    service.claim.mockResolvedValue(claimed);
    service.heartbeat.mockResolvedValue({ kind: 'lost_ownership' });
    const run = loop.pollOnce();
    await vi.waitFor(() => expect(scheduled.length).toBeGreaterThan(0));
    await scheduled[0]!();
    release();
    await run;
    expect(service.heartbeat).toHaveBeenCalledWith({ ...identity, leaseDurationMs: 60_000 });
    expect(service.withFencedPublish).not.toHaveBeenCalled();
    expect(deps.cancelTimer).toHaveBeenCalled();
  });

  it('waits for an in-flight heartbeat before publish and starts no heartbeat while publishing', async () => {
    let finishProcessor!: () => void;
    let finishHeartbeat!: () => void;
    const processorPending = new Promise<void>((resolve) => (finishProcessor = resolve));
    const heartbeatPending = new Promise<void>((resolve) => (finishHeartbeat = resolve));
    const scheduled: Array<() => void> = [];
    let heartbeatCalls = 0;
    let publishing = false;
    const processor = vi.fn().mockReturnValue(processorPending);
    const { service, loop } = harness({
      processor,
      schedule: vi.fn((callback) => {
        scheduled.push(callback);
        return {} as ReturnType<typeof setTimeout>;
      }),
    });
    service.claim.mockResolvedValue(claimed);
    service.heartbeat.mockImplementation(async () => {
      heartbeatCalls += 1;
      expect(publishing).toBe(false);
      await heartbeatPending;
      return { kind: 'extended', job: { cancellationRequestedAt: null } };
    });
    service.withFencedPublish.mockImplementation(async () => {
      publishing = true;
      expect(heartbeatCalls).toBe(1);
      expect(scheduled).toHaveLength(1);
      publishing = false;
      return { kind: 'published', job: {} };
    });

    const processing = loop.pollOnce();
    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    scheduled[0]!();
    await vi.waitFor(() => expect(service.heartbeat).toHaveBeenCalledOnce());
    finishProcessor();
    await Promise.resolve();

    expect(service.withFencedPublish).not.toHaveBeenCalled();
    finishHeartbeat();
    await processing;

    expect(service.withFencedPublish).toHaveBeenCalledOnce();
    expect(service.heartbeat).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);
  });

  it('runs one reclaim per nonoverlapping tick and stops scheduling after shutdown', async () => {
    const { service, deps, loop } = harness();
    const first = loop.reclaimOnce();
    const second = loop.reclaimOnce();
    await Promise.all([first, second]);
    expect(service.reclaimOne).toHaveBeenCalledOnce();
    await loop.shutdown();
    await loop.reclaimOnce();
    expect(service.reclaimOne).toHaveBeenCalledOnce();
    expect(deps.disconnect).toHaveBeenCalledOnce();
  });

  it('waits for a deferred claim, then requeues its exact identity without starting processor', async () => {
    let resolveClaim!: (value: typeof claimed) => void;
    const claim = new Promise<typeof claimed>((resolve) => (resolveClaim = resolve));
    const processor = vi.fn().mockResolvedValue(undefined);
    const { service, deps, loop } = harness({ processor });
    service.claim.mockReturnValue(claim);

    const polling = loop.pollOnce();
    await vi.waitFor(() => expect(service.claim).toHaveBeenCalledOnce());
    const shutdown = loop.shutdown();

    expect(deps.disconnect).not.toHaveBeenCalled();
    resolveClaim(claimed);
    await Promise.all([polling, shutdown]);

    expect(processor).not.toHaveBeenCalled();
    expect(service.heartbeat).toHaveBeenCalledWith({ ...identity, leaseDurationMs: 60_000 });
    expect(service.requeue).toHaveBeenCalledWith({ ...identity, delayMs: 0 });
    expect(deps.disconnect).toHaveBeenCalledOnce();
  });

  it('waits for post-stop claimed-job cleanup before disconnect without setting active', async () => {
    let resolveClaim!: (value: typeof claimed) => void;
    let resolveHeartbeat!: (value: { kind: 'extended'; job: object }) => void;
    let resolveRequeue!: (value: { kind: 'requeued'; job: object }) => void;
    const claim = new Promise<typeof claimed>((resolve) => (resolveClaim = resolve));
    const heartbeat = new Promise<{ kind: 'extended'; job: object }>(
      (resolve) => (resolveHeartbeat = resolve),
    );
    const requeue = new Promise<{ kind: 'requeued'; job: object }>(
      (resolve) => (resolveRequeue = resolve),
    );
    const processor = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const { service, deps, loop } = harness({ processor, sleep });
    service.claim.mockReturnValue(claim);
    service.heartbeat.mockReturnValue(heartbeat);
    service.requeue.mockReturnValue(requeue);

    const polling = loop.pollOnce();
    await vi.waitFor(() => expect(service.claim).toHaveBeenCalledOnce());
    const shutdown = loop.shutdown();
    resolveClaim(claimed);
    await vi.waitFor(() => expect(service.heartbeat).toHaveBeenCalledOnce());

    expect(processor).not.toHaveBeenCalled();
    expect(deps.disconnect).not.toHaveBeenCalled();
    resolveHeartbeat({ kind: 'extended', job: { cancellationRequestedAt: null } });
    await vi.waitFor(() => expect(service.requeue).toHaveBeenCalledOnce());
    expect(deps.disconnect).not.toHaveBeenCalled();

    resolveRequeue({ kind: 'requeued', job: {} });
    await Promise.all([polling, shutdown]);
    expect(deps.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['heartbeat', 'requeue', 'reclaim'] as const)(
    'bounds shutdown when %s never settles and disconnects once',
    async (hungOperation) => {
      vi.useFakeTimers();
      try {
        const never = new Promise<never>(() => {});
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
        const processor = vi.fn(
          (_job, signal: AbortSignal) =>
            new Promise<void>((resolve) =>
              signal.addEventListener('abort', resolve, { once: true }),
            ),
        );
        const { service, deps, loop } = harness({ processor, sleep });
        service.claim.mockResolvedValue(claimed);
        if (hungOperation === 'heartbeat') service.heartbeat.mockReturnValue(never);
        if (hungOperation === 'requeue') service.requeue.mockReturnValue(never);
        if (hungOperation === 'reclaim') service.reclaimOne.mockReturnValue(never);

        const processing = loop.pollOnce();
        await vi.advanceTimersByTimeAsync(0);
        expect(processor).toHaveBeenCalledOnce();
        if (hungOperation === 'reclaim') void loop.reclaimOnce();

        const shutdownA = loop.shutdown();
        const shutdownB = loop.shutdown();
        expect(shutdownA).toBe(shutdownB);
        await vi.advanceTimersByTimeAsync(30_000);
        await shutdownA;
        await processing;

        expect(deps.disconnect).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('cancels the losing deadline timer when shutdown completes early', async () => {
    vi.useFakeTimers();
    try {
      const { loop } = harness({
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancelTimer: clearTimeout,
      });

      await loop.shutdown();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a disconnect attempt with the same shutdown deadline', async () => {
    vi.useFakeTimers();
    try {
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const disconnect = vi.fn(() => new Promise<void>(() => {}));
      const { loop } = harness({ sleep, disconnect });

      const shutdown = loop.shutdown();
      await vi.advanceTimersByTimeAsync(30_000);
      await shutdown;
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('publishes a processor completed after shutdown starts but within processing grace', async () => {
    vi.useFakeTimers();
    try {
      let resolveProcessor!: () => void;
      let resolvePublish!: () => void;
      const processorPending = new Promise<void>((resolve) => (resolveProcessor = resolve));
      const publishPending = new Promise<void>((resolve) => (resolvePublish = resolve));
      const order: string[] = [];
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const { service, deps, loop } = harness({
        processor: vi.fn().mockReturnValue(processorPending),
        sleep,
        disconnect: vi.fn(async () => {
          order.push('disconnect');
        }),
      });
      service.claim.mockResolvedValue(claimed);
      service.withFencedPublish.mockImplementation(async () => {
        order.push('publish:start');
        await publishPending;
        order.push('publish:end');
        return { kind: 'published', job: {} };
      });

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      const shutdown = loop.shutdown();
      resolveProcessor();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.withFencedPublish).toHaveBeenCalledOnce();
      expect(service.requeue).not.toHaveBeenCalled();
      expect(deps.disconnect).not.toHaveBeenCalled();

      resolvePublish();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.all([processing, shutdown]);

      expect(service.requeue).not.toHaveBeenCalled();
      expect(order).toEqual(['publish:start', 'publish:end', 'disconnect']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for deferred fenced publish within grace, never requeues, then disconnects', async () => {
    let resolvePublish!: () => void;
    const publish = new Promise<void>((resolve) => (resolvePublish = resolve));
    const order: string[] = [];
    const { service, deps, loop } = harness({
      disconnect: vi.fn(async () => {
        order.push('disconnect');
      }),
    });
    service.claim.mockResolvedValue(claimed);
    service.withFencedPublish.mockImplementation(async () => {
      order.push('publish:start');
      await publish;
      order.push('publish:end');
      return { kind: 'published', job: {} };
    });

    const processing = loop.pollOnce();
    await vi.waitFor(() => expect(service.withFencedPublish).toHaveBeenCalledOnce());
    const shutdown = loop.shutdown();

    expect(deps.disconnect).not.toHaveBeenCalled();
    expect(service.requeue).not.toHaveBeenCalled();
    resolvePublish();
    await Promise.all([processing, shutdown]);

    expect(service.requeue).not.toHaveBeenCalled();
    expect(order).toEqual(['publish:start', 'publish:end', 'disconnect']);
  });

  it('never recovers a stage whose fenced publish remains pending beyond shutdown deadline', async () => {
    vi.useFakeTimers();
    try {
      let resolvePublish!: () => void;
      const publish = new Promise<void>((resolve) => (resolvePublish = resolve));
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const { service, deps, loop } = harness({ sleep });
      service.claim.mockResolvedValue(claimed);
      service.withFencedPublish.mockImplementation(async () => {
        await publish;
        return { kind: 'published', job: {} };
      });

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      expect(service.withFencedPublish).toHaveBeenCalledOnce();

      const shutdown = loop.shutdown();
      await vi.advanceTimersByTimeAsync(30_000);
      await shutdown;

      expect(service.heartbeat).not.toHaveBeenCalled();
      expect(service.requeue).not.toHaveBeenCalled();
      expect(deps.disconnect).toHaveBeenCalledOnce();

      resolvePublish();
      await processing;
      expect(service.heartbeat).not.toHaveBeenCalled();
      expect(service.requeue).not.toHaveBeenCalled();
      expect(deps.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('at deadline aborts, freshly heartbeats, requeues without publish overlap, then cleans up', async () => {
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      let publishing = false;
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const processor = vi.fn(
        (_job, signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                order.push('abort');
                resolve();
              },
              { once: true },
            );
          }),
      );
      const { service, deps, loop } = harness({
        processor,
        sleep,
        disconnect: vi.fn(async () => {
          order.push('cleanup');
        }),
      });
      service.claim.mockResolvedValue(claimed);
      service.heartbeat.mockImplementation(async () => {
        order.push('heartbeat');
        return { kind: 'extended', job: { cancellationRequestedAt: null } };
      });
      service.requeue.mockImplementation(async () => {
        expect(publishing).toBe(false);
        order.push('requeue');
        return { kind: 'requeued', job: {} };
      });
      service.withFencedPublish.mockImplementation(async () => {
        publishing = true;
        order.push('publish');
        publishing = false;
        return { kind: 'published', job: {} };
      });

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      const shutdown = loop.shutdown();
      await vi.advanceTimersByTimeAsync(30_000);
      await Promise.all([processing, shutdown]);

      expect(order).toEqual(['abort', 'heartbeat', 'requeue', 'cleanup']);
      expect(service.heartbeat).toHaveBeenCalledOnce();
      expect(service.withFencedPublish).not.toHaveBeenCalled();
      expect(deps.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes pending scheduled heartbeat before fresh shutdown recovery heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const heartbeatResolvers: Array<
        (value: { kind: 'extended'; job: { cancellationRequestedAt: null } }) => void
      > = [];
      const order: string[] = [];
      const processor = vi.fn(
        (_job, signal: AbortSignal) =>
          new Promise<void>((resolve) => signal.addEventListener('abort', resolve, { once: true })),
      );
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const { service, deps, loop } = harness({
        processor,
        sleep,
        disconnect: vi.fn(async () => {
          order.push('disconnect');
        }),
      });
      service.claim.mockResolvedValue(claimed);
      service.heartbeat.mockImplementation(
        (owner) =>
          new Promise((resolve) => {
            expect(owner).toEqual({ ...identity, leaseDurationMs: 60_000 });
            order.push(`heartbeat:${heartbeatResolvers.length + 1}:start`);
            heartbeatResolvers.push(resolve);
          }),
      );
      service.requeue.mockImplementation(async (owner) => {
        expect(owner).toEqual({ ...identity, delayMs: 0 });
        order.push('requeue');
        return { kind: 'requeued', job: {} };
      });

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(service.heartbeat).toHaveBeenCalledOnce();

      const shutdown = loop.shutdown();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(service.heartbeat).toHaveBeenCalledOnce();
      expect(service.withFencedPublish).not.toHaveBeenCalled();
      expect(service.requeue).not.toHaveBeenCalled();
      expect(deps.disconnect).not.toHaveBeenCalled();

      heartbeatResolvers[0]!({ kind: 'extended', job: { cancellationRequestedAt: null } });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.heartbeat).toHaveBeenCalledTimes(2);
      expect(service.requeue).not.toHaveBeenCalled();

      heartbeatResolvers[1]!({ kind: 'extended', job: { cancellationRequestedAt: null } });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.all([processing, shutdown]);

      expect(service.withFencedPublish).not.toHaveBeenCalled();
      expect(service.requeue).toHaveBeenCalledWith({ ...identity, delayMs: 0 });
      expect(order).toEqual(['heartbeat:1:start', 'heartbeat:2:start', 'requeue', 'disconnect']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers exact owner when processor resolves at reserved shutdown processing deadline', async () => {
    vi.useFakeTimers();
    try {
      let resolveProcessor!: () => void;
      const processorPending = new Promise<void>((resolve) => (resolveProcessor = resolve));
      const order: string[] = [];
      let publishing = false;
      let requeueing = false;
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const { service, loop } = harness({
        processor: vi.fn().mockReturnValue(processorPending),
        sleep,
        disconnect: vi.fn(async () => {
          expect(service.heartbeat).toHaveBeenCalledOnce();
          expect(service.requeue).toHaveBeenCalledOnce();
          order.push('disconnect');
        }),
      });
      service.claim.mockResolvedValue(claimed);
      service.heartbeat.mockImplementation(async (owner) => {
        expect(owner).toEqual({ ...identity, leaseDurationMs: 60_000 });
        order.push('heartbeat');
        return { kind: 'extended', job: { cancellationRequestedAt: null } };
      });
      service.requeue.mockImplementation(async (owner) => {
        expect(owner).toEqual({ ...identity, delayMs: 0 });
        expect(publishing).toBe(false);
        requeueing = true;
        order.push('requeue');
        await Promise.resolve();
        requeueing = false;
        return { kind: 'requeued', job: {} };
      });
      service.withFencedPublish.mockImplementation(async () => {
        expect(requeueing).toBe(false);
        publishing = true;
        order.push('publish');
        publishing = false;
        return { kind: 'published', job: {} };
      });

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      const shutdown = loop.shutdown();
      vi.advanceTimersByTime(10_000);
      resolveProcessor();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.all([processing, shutdown]);

      expect(service.withFencedPublish).not.toHaveBeenCalled();
      expect(service.heartbeat).toHaveBeenCalledWith({
        ...identity,
        leaseDurationMs: 60_000,
      });
      expect(service.requeue).toHaveBeenCalledWith({ ...identity, delayMs: 0 });
      expect(order).toEqual(['heartbeat', 'requeue', 'disconnect']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reserves heartbeat budget from one shutdown deadline and requeues after async heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const processor = vi.fn(
        (_job, signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                order.push(`abort:${Date.now()}`);
                resolve();
              },
              { once: true },
            );
          }),
      );
      const { service, deps, loop } = harness({
        processor,
        sleep,
        settings: {
          leaseMs: 60_000,
          heartbeatMs: 20_000,
          reclaimSweepMs: 30_000,
          pollMs: 1_000,
          errorBackoffMs: 5_000,
          shutdownDrainMs: 30_000,
        },
        disconnect: vi.fn(async () => {
          order.push(`disconnect:${Date.now()}`);
        }),
      });
      service.claim.mockResolvedValue(claimed);
      service.heartbeat.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              queueMicrotask(() => {
                order.push(`heartbeat:${Date.now()}`);
                resolve({ kind: 'extended', job: { cancellationRequestedAt: null } });
              });
            }, 5_000);
          }),
      );
      service.requeue.mockImplementation(async () => {
        order.push(`requeue:${Date.now()}`);
        return { kind: 'requeued', job: {} };
      });

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      const startedAt = Date.now();
      const shutdown = loop.shutdown();

      await vi.advanceTimersByTimeAsync(9_999);
      expect(processor.mock.calls[0]?.[1].aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(processor.mock.calls[0]?.[1].aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.all([processing, shutdown]);

      expect(order).toEqual([
        `abort:${startedAt + 10_000}`,
        `heartbeat:${startedAt + 15_000}`,
        `requeue:${startedAt + 15_000}`,
        `disconnect:${startedAt + 15_000}`,
      ]);
      expect(Date.now() - startedAt).toBeLessThanOrEqual(30_000);
      expect(deps.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses zero processing grace when shutdown drain equals heartbeat reserve', async () => {
    vi.useFakeTimers();
    try {
      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const processor = vi.fn(
        (_job, signal: AbortSignal) =>
          new Promise<void>((resolve) => signal.addEventListener('abort', resolve, { once: true })),
      );
      const { service, loop } = harness({
        processor,
        sleep,
        settings: {
          leaseMs: 60_000,
          heartbeatMs: 20_000,
          reclaimSweepMs: 30_000,
          pollMs: 1_000,
          errorBackoffMs: 5_000,
          shutdownDrainMs: 20_000,
        },
      });
      service.claim.mockResolvedValue(claimed);

      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      const shutdown = loop.shutdown();
      await vi.advanceTimersByTimeAsync(0);

      expect(processor.mock.calls[0]?.[1].aborted).toBe(true);
      await Promise.all([processing, shutdown]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shutdown is idempotent, aborts after grace, fences deadline requeue, and disconnects once', async () => {
    vi.useFakeTimers();
    try {
      const sleep = vi.fn((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const processor = vi.fn(
        (_job, signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener('abort', resolve, { once: true });
          }),
      );
      const { service, deps, loop } = harness({ processor, sleep });
      service.claim.mockResolvedValue(claimed);
      const processing = loop.pollOnce();
      await vi.advanceTimersByTimeAsync(0);
      expect(processor).toHaveBeenCalledOnce();
      const shutdownA = loop.shutdown();
      const shutdownB = loop.shutdown();
      expect(shutdownA).toBe(shutdownB);
      await vi.advanceTimersByTimeAsync(30_000);
      await shutdownA;
      await processing;
      expect(service.heartbeat).toHaveBeenCalled();
      expect(service.requeue).toHaveBeenCalledWith({ ...identity, delayMs: 0 });
      expect(deps.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

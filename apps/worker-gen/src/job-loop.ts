import type { JobService } from '@narraza/application';

export interface JobLoopSettings {
  leaseMs: number;
  heartbeatMs: number;
  reclaimSweepMs: number;
  pollMs: number;
  errorBackoffMs: number;
  shutdownDrainMs: number;
  retentionSweepMs: number;
  retentionMaxAgeHours: number;
}

export type JobProcessor = (job: unknown, signal: AbortSignal) => Promise<void>;
type Timer = ReturnType<typeof setTimeout>;
type LoopService = Pick<
  JobService,
  'claim' | 'heartbeat' | 'reclaimOne' | 'requeue' | 'withFencedPublish'
>;

export interface JobLoopDependencies {
  service: LoopService;
  sweepCreditRetention: (input: { maxAgeHours: number }) => Promise<{
    deletedQuotes: number;
    deletedBundles: number;
  }>;
  processor?: JobProcessor;
  settings: JobLoopSettings;
  sleep: (ms: number) => Promise<void>;
  schedule: (callback: () => void, ms: number) => Timer;
  cancelTimer: (timer: Timer) => void;
  disconnect: () => Promise<void>;
  createLeaseToken: () => string;
  logger: { info: (value: object) => void; error: (value: object) => void };
}

interface ActiveStage {
  identity: Parameters<LoopService['heartbeat']>[0] extends infer T
    ? Omit<T, 'leaseDurationMs'>
    : never;
  controller: AbortController;
  stale: boolean;
  phase: 'processing' | 'publishing' | 'finalizing';
  processorSettled: boolean;
  processorDone: Promise<void>;
  done: Promise<void>;
  heartbeatTimer?: Timer;
  heartbeatInFlight?: Promise<boolean> | undefined;
}

export function createJobLoop(deps: JobLoopDependencies) {
  let stopping = false;
  let polling: Promise<void> | undefined;
  let claiming: Promise<Awaited<ReturnType<LoopService['claim']>>> | undefined;
  let reclaiming: Promise<void> | undefined;
  let reclaimTimer: Timer | undefined;
  let retentionSweeping: Promise<void> | undefined;
  let retentionTimer: Timer | undefined;
  let active: ActiveStage | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let shutdownDeadline: number | undefined;

  const waitUntil = async <T>(operation: Promise<T>, deadline: number): Promise<T | undefined> => {
    const remaining = Math.max(0, deadline - Date.now());
    let deadlineTimer: Timer | undefined;
    const observedOperation = operation.then(
      (value) => ({ settled: true as const, value }),
      (error: unknown) => Promise.reject(error),
    );
    const timeout = new Promise<{ settled: false }>((resolve) => {
      if (remaining === 0) {
        resolve({ settled: false });
        return;
      }
      deadlineTimer = deps.schedule(() => resolve({ settled: false }), remaining);
    });
    try {
      const result = await Promise.race([observedOperation, timeout]);
      return result.settled ? result.value : undefined;
    } finally {
      if (deadlineTimer) deps.cancelTimer(deadlineTimer);
      // DB calls cannot be cancelled. Keep rejection observed after PM2 hard deadline detaches them.
      void observedOperation.catch(() => undefined);
    }
  };

  const waitWithinShutdown = <T>(operation: Promise<T>): Promise<T | undefined> => {
    if (shutdownDeadline === undefined) return operation;
    return waitUntil(operation, shutdownDeadline);
  };

  const heartbeat = async (stage: ActiveStage): Promise<boolean> => {
    if (stage.stale) return false;
    const result = await deps.service.heartbeat({
      ...stage.identity,
      leaseDurationMs: deps.settings.leaseMs,
    });
    const cancellationRequestedAt =
      result.kind === 'extended' && 'cancellationRequestedAt' in result.job
        ? result.job.cancellationRequestedAt
        : null;
    if (result.kind !== 'extended' || cancellationRequestedAt !== null) {
      stage.stale = true;
      stage.controller.abort();
      return false;
    }
    return true;
  };

  const scheduleHeartbeat = (stage: ActiveStage): void => {
    stage.heartbeatTimer = deps.schedule(() => {
      stage.heartbeatInFlight = heartbeat(stage);
      void stage.heartbeatInFlight
        .then((live) => {
          if (
            live &&
            active === stage &&
            !stage.stale &&
            stage.phase === 'processing' &&
            !stage.processorSettled
          ) {
            scheduleHeartbeat(stage);
          }
        })
        .catch((error: unknown) => {
          stage.stale = true;
          stage.controller.abort();
          deps.logger.error({ event: 'job_heartbeat_error', error });
        })
        .finally(() => {
          stage.heartbeatInFlight = undefined;
        });
    }, deps.settings.heartbeatMs);
  };

  const pollOnce = (): Promise<void> => {
    if (polling) return polling;
    polling = (async () => {
      if (stopping || !deps.processor || active) return;
      try {
        claiming = deps.service.claim({
          leaseToken: deps.createLeaseToken(),
          leaseDurationMs: deps.settings.leaseMs,
        });
        const result = await claiming;
        claiming = undefined;
        if (result.kind === 'none') {
          await deps.sleep(deps.settings.pollMs);
          return;
        }
        if (stopping) {
          const heartbeatResult = await waitWithinShutdown(
            deps.service.heartbeat({
              ...result.identity,
              leaseDurationMs: deps.settings.leaseMs,
            }),
          );
          if (!heartbeatResult) return;
          const cancellationRequestedAt =
            heartbeatResult.kind === 'extended' && 'cancellationRequestedAt' in heartbeatResult.job
              ? heartbeatResult.job.cancellationRequestedAt
              : null;
          if (heartbeatResult.kind === 'extended' && cancellationRequestedAt === null) {
            await waitWithinShutdown(deps.service.requeue({ ...result.identity, delayMs: 0 }));
          }
          return;
        }
        const controller = new AbortController();
        const stage = {} as ActiveStage;
        stage.identity = result.identity;
        stage.controller = controller;
        stage.stale = false;
        stage.phase = 'processing';
        stage.processorSettled = false;
        stage.processorDone = deps.processor(result.job, controller.signal);
        stage.done = (async () => {
          await stage.processorDone;
          stage.processorSettled = true;
          if (stage.heartbeatTimer) deps.cancelTimer(stage.heartbeatTimer);
          if (stage.heartbeatInFlight) await stage.heartbeatInFlight;
          const processingDeadline =
            shutdownDeadline === undefined
              ? undefined
              : shutdownDeadline - deps.settings.heartbeatMs;
          if (
            !stage.stale &&
            (processingDeadline === undefined || Date.now() < processingDeadline)
          ) {
            stage.phase = 'publishing';
            const published = await deps.service.withFencedPublish(stage.identity, async () => {});
            stage.phase = 'finalizing';
            if (published.kind !== 'published') stage.stale = true;
          }
        })();
        active = stage;
        scheduleHeartbeat(stage);
        try {
          await stage.done;
        } finally {
          if (stage.heartbeatTimer) deps.cancelTimer(stage.heartbeatTimer);
          if (active === stage && !(stopping && stage.phase === 'processing')) active = undefined;
        }
      } catch (error) {
        deps.logger.error({ event: 'job_poll_error', error });
        await deps.sleep(deps.settings.errorBackoffMs);
      }
    })().finally(() => {
      polling = undefined;
    });
    return polling;
  };

  const reclaimOnce = (): Promise<void> => {
    if (reclaiming) return reclaiming;
    reclaiming = (async () => {
      if (stopping) return;
      try {
        const result = await deps.service.reclaimOne({});
        deps.logger.info({ event: 'job_reclaim', result: result.kind });
      } catch (error) {
        deps.logger.error({ event: 'job_reclaim_error', error });
      } finally {
        if (!stopping) {
          reclaimTimer = deps.schedule(() => void reclaimOnce(), deps.settings.reclaimSweepMs);
        }
      }
    })().finally(() => {
      reclaiming = undefined;
    });
    return reclaiming;
  };

  const sweepCreditRetention = (): Promise<void> => {
    if (retentionSweeping) return retentionSweeping;
    retentionSweeping = (async () => {
      if (stopping) return;
      try {
        const result = await deps.sweepCreditRetention({
          maxAgeHours: deps.settings.retentionMaxAgeHours,
        });
        deps.logger.info({ event: 'credit_retention_sweep', ...result });
      } catch (error) {
        deps.logger.error({ event: 'credit_retention_sweep_error', error });
      } finally {
        if (!stopping) {
          retentionTimer = deps.schedule(
            () => void sweepCreditRetention(),
            deps.settings.retentionSweepMs,
          );
        }
      }
    })().finally(() => {
      retentionSweeping = undefined;
    });
    return retentionSweeping;
  };

  const start = (): void => {
    void reclaimOnce();
    void sweepCreditRetention();
    if (deps.processor) void pollContinuously();
  };

  const pollContinuously = async (): Promise<void> => {
    while (!stopping) await pollOnce();
  };

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownDeadline = Date.now() + deps.settings.shutdownDrainMs;
    shutdownPromise = (async () => {
      stopping = true;
      if (reclaimTimer) deps.cancelTimer(reclaimTimer);
      if (retentionTimer) deps.cancelTimer(retentionTimer);
      if (claiming) await waitWithinShutdown(claiming).catch(() => undefined);
      const stage = active;
      if (stage) {
        const processingDeadline = shutdownDeadline - deps.settings.heartbeatMs;
        await waitUntil(stage.done, processingDeadline).catch(() => undefined);
        if (active === stage && stage.phase === 'processing' && !stage.controller.signal.aborted) {
          stage.controller.abort();
          let live = false;
          try {
            const heartbeatInFlight = stage.heartbeatInFlight;
            const settled = heartbeatInFlight ? await waitWithinShutdown(heartbeatInFlight) : true;
            if (settled !== undefined) {
              live = (await waitWithinShutdown(heartbeat(stage))) ?? false;
            }
          } catch (error) {
            deps.logger.error({ event: 'job_shutdown_heartbeat_error', error });
          }
          if (live && !stage.stale) {
            await waitWithinShutdown(deps.service.requeue({ ...stage.identity, delayMs: 0 })).catch(
              () => undefined,
            );
          }
        }
        if (stage.heartbeatTimer) deps.cancelTimer(stage.heartbeatTimer);
        if (active === stage) active = undefined;
      }

      if (polling) await waitWithinShutdown(polling).catch(() => undefined);
      if (reclaiming) await waitWithinShutdown(reclaiming).catch(() => undefined);
      if (retentionSweeping) await waitWithinShutdown(retentionSweeping).catch(() => undefined);
      await waitWithinShutdown(deps.disconnect()).catch(() => undefined);
    })();
    return shutdownPromise;
  };

  return { start, pollOnce, reclaimOnce, sweepCreditRetention, shutdown };
}

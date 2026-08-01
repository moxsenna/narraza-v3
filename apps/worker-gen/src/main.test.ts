import { describe, expect, it, vi } from 'vitest';
import { composeWorker, workerSettingsFromEnv } from './composition.js';

const env = {
  JOB_PROCESSOR_ENABLED: false,
  JOB_LEASE_SECONDS: 60,
  JOB_HEARTBEAT_SECONDS: 20,
  JOB_RECLAIM_SWEEP_SECONDS: 30,
  JOB_POLL_MS: 1000,
  JOB_ERROR_BACKOFF_MS: 5000,
  JOB_SHUTDOWN_DRAIN_MS: 30000,
};

function deps(processor?: (...args: unknown[]) => Promise<void>) {
  const loop = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
  return {
    processor,
    createLoop: vi.fn(() => loop),
    registerSignal: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn() },
    setExitCode: vi.fn(),
    loop,
  };
}

describe('worker composition', () => {
  it('maps seconds to milliseconds once', () => {
    expect(workerSettingsFromEnv(env)).toEqual({
      leaseMs: 60_000,
      heartbeatMs: 20_000,
      reclaimSweepMs: 30_000,
      pollMs: 1000,
      errorBackoffMs: 5000,
      shutdownDrainMs: 30_000,
    });
  });

  it('disabled lifecycle starts without processor and registers both signals', () => {
    const input = deps();
    composeWorker(env, input);
    expect(input.createLoop).toHaveBeenCalledOnce();
    expect(input.createLoop.mock.calls[0]?.[0]).not.toHaveProperty('processor');
    expect(input.loop.start).toHaveBeenCalledOnce();
    expect(input.registerSignal).toHaveBeenCalledTimes(2);
    expect(input.logger.info).toHaveBeenCalledWith({
      event: 'worker_startup',
      processor_configured: false,
    });
  });

  it('enabled injected processor activates claim path and logs true', () => {
    const processor = vi.fn();
    const input = deps(processor);
    composeWorker({ ...env, JOB_PROCESSOR_ENABLED: true }, input);
    expect(input.createLoop).toHaveBeenCalledWith(expect.objectContaining({ processor }));
    expect(input.logger.info).toHaveBeenCalledWith({
      event: 'worker_startup',
      processor_configured: true,
    });
  });

  it('logs shutdown rejection and sets exit code while repeated signals share shutdown', async () => {
    const input = deps();
    const failure = new Error('disconnect failed');
    input.loop.shutdown.mockRejectedValue(failure);
    composeWorker(env, input);
    const signalHandlers = input.registerSignal.mock.calls.map((call) => call[1]);

    signalHandlers[0]!();
    signalHandlers[1]!();
    await vi.waitFor(() => expect(input.logger.error).toHaveBeenCalledOnce());

    expect(input.loop.shutdown).toHaveBeenCalledOnce();
    expect(input.logger.error).toHaveBeenCalledWith({
      event: 'worker_shutdown_error',
      error: failure,
    });
    expect(input.setExitCode).toHaveBeenCalledWith(1);
  });

  it('enabled without processor fails closed before loops start', () => {
    const input = deps();
    expect(() => composeWorker({ ...env, JOB_PROCESSOR_ENABLED: true }, input)).toThrow(
      /processor/i,
    );
    expect(input.createLoop).not.toHaveBeenCalled();
    expect(input.loop.start).not.toHaveBeenCalled();
  });
});

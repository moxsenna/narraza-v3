import { describe, expect, it, vi } from 'vitest';
import { createM4MockProvider, createOpenRouterProvider, type ProviderPort } from '@narraza/ai';
import { composeWorker, workerSettingsFromEnv } from './composition.js';
import { assertRestrictedRoutingServiceable } from './main.js';

const env = {
  JOB_PROCESSOR_ENABLED: false,
  JOB_LEASE_SECONDS: 60,
  JOB_HEARTBEAT_SECONDS: 20,
  JOB_RECLAIM_SWEEP_SECONDS: 30,
  JOB_POLL_MS: 1000,
  JOB_ERROR_BACKOFF_MS: 5000,
  JOB_SHUTDOWN_DRAIN_MS: 30000,
  RETENTION_SWEEP_MINUTES: 60,
  RETENTION_MAX_AGE_HOURS: 24,
};

function deps(processor?: (...args: unknown[]) => Promise<void>) {
  const loop = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
  const outboxLoop = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
  return {
    processor,
    createLoop: vi.fn(() => loop),
    createOutboxLoop: vi.fn(() => outboxLoop),
    registerSignal: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn() },
    setExitCode: vi.fn(),
    loop,
    outboxLoop,
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
      retentionSweepMs: 3_600_000,
      retentionMaxAgeHours: 24,
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
      outbox_consumer: true,
    });
  });

  describe('outbox-worker-wiring (embedded, D11)', () => {
    it('outbox consumer starts even with JOB_PROCESSOR_ENABLED=false', () => {
      const input = deps();
      composeWorker(env, input);
      expect(input.createOutboxLoop).toHaveBeenCalledOnce();
      expect(input.outboxLoop.start).toHaveBeenCalledOnce();
      // Processor stays disabled: no processor was handed to the job loop.
      expect(input.createLoop.mock.calls[0]?.[0]).not.toHaveProperty('processor');
    });

    it('shutdown drains both the job loop and the outbox consumer', async () => {
      const input = deps();
      const composed = composeWorker(env, input);
      await composed.shutdown();
      expect(input.loop.shutdown).toHaveBeenCalledOnce();
      expect(input.outboxLoop.shutdown).toHaveBeenCalledOnce();
    });

    it('an outbox shutdown failure still drains the job loop and sets exit code', async () => {
      const input = deps();
      const failure = new Error('outbox disconnect failed');
      input.outboxLoop.shutdown.mockRejectedValue(failure);
      composeWorker(env, input);
      const signalHandlers = input.registerSignal.mock.calls.map((call) => call[1]);

      signalHandlers[0]!();
      await vi.waitFor(() => expect(input.logger.error).toHaveBeenCalledOnce());

      expect(input.loop.shutdown).toHaveBeenCalledOnce();
      expect(input.setExitCode).toHaveBeenCalledWith(1);
    });
  });

  it('enabled injected processor activates claim path and logs true', () => {
    const processor = vi.fn();
    const input = deps(processor);
    composeWorker({ ...env, JOB_PROCESSOR_ENABLED: true }, input);
    expect(input.createLoop).toHaveBeenCalledWith(expect.objectContaining({ processor }));
    expect(input.outboxLoop.start).toHaveBeenCalledOnce();
    expect(input.logger.info).toHaveBeenCalledWith({
      event: 'worker_startup',
      processor_configured: true,
      outbox_consumer: true,
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

describe('D14 restricted routing startup gate', () => {
  it('refuses an enabled processor with no restricted_allowed provider configured', () => {
    const providers = new Map<string, ProviderPort>([
      ['openrouter', createOpenRouterProvider({ apiKey: 'test-key', fetch: vi.fn() })],
    ]);
    expect(() => assertRestrictedRoutingServiceable({ processorEnabled: true, providers })).toThrow(
      /restricted_allowed.*beat_write_judge|beat_write_judge.*restricted_allowed/s,
    );
  });

  it('accepts the deterministic mock as the restricted_allowed provider', () => {
    const providers = new Map<string, ProviderPort>([['mock', createM4MockProvider()]]);
    expect(() =>
      assertRestrictedRoutingServiceable({ processorEnabled: true, providers }),
    ).not.toThrow();
  });

  it('does not evaluate routing when the processor is disabled', () => {
    expect(() =>
      assertRestrictedRoutingServiceable({ processorEnabled: false, providers: new Map() }),
    ).not.toThrow();
  });
});

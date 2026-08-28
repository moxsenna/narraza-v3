import type { OutboxConsumerLoop } from '@narraza/application';
import { describe, expect, it, vi } from 'vitest';
import { composeOutboxProcess } from './composition.js';

function deps() {
  const loop = {
    start: vi.fn(),
    runOnce: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  } satisfies OutboxConsumerLoop;
  return {
    createOutboxLoop: vi.fn(() => loop),
    registerSignal: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn() },
    setExitCode: vi.fn(),
    loop,
  };
}

describe('outbox-worker-wiring (standalone, D11)', () => {
  it('starts the shared consumer module and registers both signals', () => {
    const input = deps();
    composeOutboxProcess(input);
    expect(input.createOutboxLoop).toHaveBeenCalledOnce();
    expect(input.loop.start).toHaveBeenCalledOnce();
    expect(input.registerSignal).toHaveBeenCalledTimes(2);
    expect(input.logger.info).toHaveBeenCalledWith({
      event: 'outbox_startup',
      mode: 'standalone',
    });
  });

  it('repeated signals share one shutdown and a failure sets the exit code', async () => {
    const input = deps();
    const failure = new Error('disconnect failed');
    input.loop.shutdown.mockRejectedValue(failure);
    composeOutboxProcess(input);
    const handlers = input.registerSignal.mock.calls.map((call) => call[1]);

    handlers[0]!();
    handlers[1]!();
    await vi.waitFor(() => expect(input.logger.error).toHaveBeenCalledOnce());

    expect(input.loop.shutdown).toHaveBeenCalledOnce();
    expect(input.logger.error).toHaveBeenCalledWith({
      event: 'outbox_shutdown_error',
      error: failure,
    });
    expect(input.setExitCode).toHaveBeenCalledWith(1);
  });

  it('composes the application module rather than a local state machine', async () => {
    // Parity guard: this app must not own claim/finalize logic. It only
    // supplies a factory that returns the shared OutboxConsumerLoop.
    const application = await import('@narraza/application');
    expect(typeof application.createOutboxModule).toBe('function');
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./composition.ts', import.meta.url), 'utf8'),
    );
    expect(source).not.toMatch(/claimNext|markDead|markUncertain|FOR UPDATE/);
  });
});

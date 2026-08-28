import type { OutboxConsumerLoop } from '@narraza/application';

export interface StandaloneCompositionDependencies {
  createOutboxLoop: () => OutboxConsumerLoop;
  registerSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  logger: { info: (value: object) => void; error: (value: object) => void };
  setExitCode: (code: number) => void;
}

export interface ComposedOutboxProcess {
  shutdown(): Promise<void>;
}

/**
 * D11: this process is not deployed in Rilis 1. It exists so the split is
 * config-only: it composes the SAME application module as the embedded
 * consumer inside worker-gen. The delivery state machine is never duplicated.
 */
export function composeOutboxProcess(
  deps: StandaloneCompositionDependencies,
): ComposedOutboxProcess {
  const loop = deps.createOutboxLoop();
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): void => {
    shutdownPromise ??= loop.shutdown().catch((error: unknown) => {
      deps.logger.error({ event: 'outbox_shutdown_error', error });
      deps.setExitCode(1);
    });
  };
  deps.registerSignal('SIGTERM', shutdown);
  deps.registerSignal('SIGINT', shutdown);
  deps.logger.info({ event: 'outbox_startup', mode: 'standalone' });
  loop.start();
  return { shutdown: () => shutdownPromise ?? loop.shutdown() };
}

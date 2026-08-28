import type { OutboxDeliveryUnitOfWork } from '../ports/outbox-delivery-port.js';
import {
  createOutboxConsumerLoop,
  type OutboxConsumerLoop,
  type OutboxConsumerLoopDependencies,
} from './outbox-consumer-loop.js';
import { createOutboxDeliveryService } from './outbox-delivery-service.js';
import type { OutboxHandlerRegistry } from './outbox-handler-registry.js';

/**
 * Single composition entry point for the outbox consumer (D11).
 *
 * `apps/worker-gen` (embedded, Rilis 1) and `apps/worker-outbox` (standalone,
 * used when the first external channel justifies its own PM2 process) both call
 * this. Neither app owns any part of the delivery state machine, so splitting
 * the process later is a deployment change rather than a rewrite.
 */

export interface OutboxModuleSettings {
  readonly pollMs: number;
  readonly idleBackoffMs: number;
  readonly leaseMs: number;
  readonly shutdownDrainMs: number;
}

export interface OutboxModuleDependencies {
  readonly unitOfWork: OutboxDeliveryUnitOfWork;
  readonly registry: OutboxHandlerRegistry;
  readonly settings: OutboxModuleSettings;
  readonly schedule: OutboxConsumerLoopDependencies['schedule'];
  readonly cancelTimer: OutboxConsumerLoopDependencies['cancelTimer'];
  readonly disconnect: OutboxConsumerLoopDependencies['disconnect'];
  readonly logger: OutboxConsumerLoopDependencies['logger'];
}

export function createOutboxModule(deps: OutboxModuleDependencies): OutboxConsumerLoop {
  const service = createOutboxDeliveryService(deps.unitOfWork, deps.registry, {
    leaseMs: deps.settings.leaseMs,
  });
  return createOutboxConsumerLoop({
    service,
    settings: {
      pollMs: deps.settings.pollMs,
      idleBackoffMs: deps.settings.idleBackoffMs,
      shutdownDrainMs: deps.settings.shutdownDrainMs,
    },
    schedule: deps.schedule,
    cancelTimer: deps.cancelTimer,
    disconnect: deps.disconnect,
    logger: deps.logger,
  });
}

/** Env shape the outbox module needs. Deliberately excludes provider keys. */
export interface OutboxSettingsEnv {
  readonly OUTBOX_POLL_MS: number;
  readonly OUTBOX_IDLE_BACKOFF_MS: number;
  readonly OUTBOX_LEASE_SECONDS: number;
  readonly OUTBOX_SHUTDOWN_DRAIN_MS: number;
}

export function outboxSettingsFromEnv(env: OutboxSettingsEnv): OutboxModuleSettings {
  return {
    pollMs: env.OUTBOX_POLL_MS,
    idleBackoffMs: env.OUTBOX_IDLE_BACKOFF_MS,
    leaseMs: env.OUTBOX_LEASE_SECONDS * 1000,
    shutdownDrainMs: env.OUTBOX_SHUTDOWN_DRAIN_MS,
  };
}

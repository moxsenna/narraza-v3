import { frozenWorkflowKinds, workflowDataClasses } from '@narraza/application';
import {
  isRestrictedAllowed,
  isRestrictedDataClass,
  type AttemptDataClass,
  type ProviderPort,
} from '@narraza/ai';

/**
 * D14 startup gate. `assertModelPolicy` already fails a job closed when a
 * restricted stage would reach a non-allowlisted provider, but a worker that
 * only discovers this per job would boot "healthy" and then fail every
 * restricted workflow one at a time. `restricted_allowed` is currently the
 * deterministic mock ONLY, and production forbids the mock — so if the frozen
 * catalogue still carries restricted stages, an enabled production processor
 * cannot serve them and must refuse to start rather than accept work it can
 * never complete. Loosen this only together with the D14 allowlist itself.
 */
export function assertRestrictedRoutingServiceable(input: {
  readonly processorEnabled: boolean;
  readonly providers: ReadonlyMap<string, ProviderPort>;
}): void {
  if (!input.processorEnabled) return;
  const unservable = frozenWorkflowKinds().filter((kind) =>
    (workflowDataClasses(kind) ?? []).some(
      (dataClass) =>
        isRestrictedDataClass(dataClass as AttemptDataClass) &&
        ![...input.providers.keys()].some(isRestrictedAllowed),
    ),
  );
  if (unservable.length > 0) {
    throw new Error(
      `Invalid worker configuration: no restricted_allowed provider is configured, so ` +
        `workflow kinds [${unservable.join(', ')}] carry restricted stages this worker can ` +
        `never execute (D14; see docs/model-policy.md)`,
    );
  }
}

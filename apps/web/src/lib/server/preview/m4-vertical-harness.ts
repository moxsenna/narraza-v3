import 'server-only';

import { getMyProject } from '../../../server/domain/queries';
import { evaluateGenerationHarnessPolicy, runtimeEnvironment } from './generation-harness';

export type M4VerticalAccess =
  { readonly kind: 'allowed'; readonly userId: string } | { readonly kind: 'not_found' };

/**
 * M4 dev/mock exit-gate boundary (project-scoped). The M4 exit gate requires a
 * dev/mock UI vertical that runs the REAL application services, REAL worker
 * processor, and deterministic mock provider on real PostgreSQL; production AI
 * activation stays fail-closed (D14: mock is forbidden in production). This
 * boundary therefore reuses the M3 harness policy — production/staging/unknown
 * environments are refused outright, authentication and project ownership are
 * derived server-side, and every denial is a non-enumerating not-found.
 */
export async function resolveM4VerticalAccess(projectId: string): Promise<M4VerticalAccess> {
  const project = await getMyProject(projectId);
  if (!project) return { kind: 'not_found' };
  const decision = evaluateGenerationHarnessPolicy({
    environment: runtimeEnvironment(),
    authenticated: true,
  });
  if (!decision.allowed) return { kind: 'not_found' };
  return { kind: 'allowed', userId: project.ownerUserId };
}

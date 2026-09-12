import 'server-only';

import { assertSceneChapterAccess } from '../../../server/domain/generation';

type HarnessEnvironment = 'production' | 'staging' | 'development' | 'test' | 'unknown';

/**
 * M3 generation harness boundary (PM corrective wave). The W3.5 quote/job
 * mechanics are production components, but product generation activation is
 * owned by M4 (real AIWorkflowPlan, pricing, processor). This harness exists
 * only outside production so the E2E mock driver can exercise the REAL M3
 * quote/confirm/job services through the REAL W3.5 components. It fails
 * closed: production and staging resolve to not-found, and access always
 * requires an authenticated owner-scoped chapter context.
 */
export type GenerationHarnessAccess =
  { readonly kind: 'allowed'; readonly userId: string } | { readonly kind: 'not_found' };

export function evaluateGenerationHarnessPolicy(input: {
  readonly environment: HarnessEnvironment;
  readonly authenticated: boolean;
}): Readonly<{ allowed: boolean }> {
  if (input.environment === 'production' || input.environment === 'staging') {
    return { allowed: false };
  }
  if (input.environment === 'unknown') return { allowed: false };
  if (!input.authenticated) return { allowed: false };
  return { allowed: true };
}

export function runtimeEnvironment(): HarnessEnvironment {
  if (process.env.NODE_ENV === 'production') return 'production';
  if (process.env.NODE_ENV === 'test') return 'test';

  const value = process.env.NARRAZA_ENV ?? process.env.NODE_ENV ?? 'unknown';
  if (value === 'staging' || value === 'development' || value === 'test') return value;
  return 'unknown';
}

/**
 * Single server-side authority for the generation harness: authentication,
 * ownership, and chapter existence derive from the session and repository —
 * only route parameters come from the request.
 */
export async function resolveGenerationHarnessAccess(
  projectId: string,
  chapterId: string,
): Promise<GenerationHarnessAccess> {
  const access = await assertSceneChapterAccess(projectId, chapterId);
  if (access.kind !== 'allowed') return { kind: 'not_found' };

  const decision = evaluateGenerationHarnessPolicy({
    environment: runtimeEnvironment(),
    authenticated: true,
  });
  if (!decision.allowed) return { kind: 'not_found' };
  return access;
}

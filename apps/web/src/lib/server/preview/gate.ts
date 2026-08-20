import 'server-only';

import { getMyProject } from '../../../server/domain/queries';
import { getCurrentUser } from '../../../server/auth/session';
import { getPreviewScenario, type PreviewScenario } from './scenario-registry';

type PreviewEnvironment = 'production' | 'staging' | 'development' | 'test' | 'unknown';

type PreviewPolicyInput = Readonly<{
  environment: PreviewEnvironment;
  authenticated: boolean;
  scenarioAllowed: boolean;
  scopeAuthorized: boolean;
  automated: boolean;
}>;

export function evaluatePreviewPolicy(input: PreviewPolicyInput): Readonly<{ allowed: boolean }> {
  if (input.environment === 'production' || input.environment === 'staging') {
    return { allowed: false };
  }
  if (input.environment === 'unknown') return { allowed: false };
  if (!input.authenticated || !input.scenarioAllowed || !input.scopeAuthorized) {
    return { allowed: false };
  }
  if (input.environment === 'test' && !input.automated) return { allowed: false };
  return { allowed: true };
}

function runtimeEnvironment(): PreviewEnvironment {
  const value = process.env.NARRAZA_ENV ?? process.env.NODE_ENV ?? 'unknown';
  if (
    value === 'production' ||
    value === 'staging' ||
    value === 'development' ||
    value === 'test'
  ) {
    return value;
  }
  return 'unknown';
}

function isAutomatedTestPath(): boolean {
  return runtimeEnvironment() === 'test' && process.env.CI === 'true';
}

async function authorizeScenarioScope(
  scenario: PreviewScenario,
  projectId: string | undefined,
): Promise<boolean> {
  if (scenario.scope === 'account') return true;
  if (!projectId) return false;
  return (await getMyProject(projectId)) !== null;
}

export type ResolvedPreviewAccess = Readonly<{
  scenario: PreviewScenario;
}>;

/**
 * Public preview boundary. Only scenario/project identifiers may come from the request.
 * Authentication, environment, allowlist membership, and scope authorization are derived server-side.
 */
export async function resolvePreviewAccess(input: Readonly<{
  scenarioKey: string;
  projectId?: string;
}>): Promise<ResolvedPreviewAccess | null> {
  const scenario = getPreviewScenario(input.scenarioKey);
  const user = await getCurrentUser();
  const scopeAuthorized = scenario
    ? await authorizeScenarioScope(scenario, input.projectId)
    : false;

  const decision = evaluatePreviewPolicy({
    environment: runtimeEnvironment(),
    authenticated: user !== null,
    scenarioAllowed: scenario !== null,
    scopeAuthorized,
    automated: isAutomatedTestPath(),
  });

  if (!decision.allowed || !scenario) return null;
  return { scenario };
}

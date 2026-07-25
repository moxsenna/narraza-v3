import { err, ok, type Result } from '../result.js';
import { appError, type AppError } from '../errors.js';

export interface ActiveUser {
  readonly id: string;
  readonly status: 'active';
  readonly email: string;
}

/**
 * Guard every use case / Server Action (S4.5 / S6). Missing session → UNAUTHORIZED;
 * non-active status → FORBIDDEN. Active users pass through as a narrowed ActiveUser.
 */
export async function authorizeActiveUser(
  load: () => Promise<{ id: string; status: string; email: string } | null>,
): Promise<Result<ActiveUser, AppError>> {
  const user = await load();
  if (!user) {
    return err(appError('UNAUTHORIZED', 'msg.auth.unauthorized', 401));
  }
  if (user.status !== 'active') {
    return err(appError('FORBIDDEN', 'msg.auth.forbidden', 403, { status: user.status }));
  }
  return ok({ id: user.id, status: 'active', email: user.email });
}

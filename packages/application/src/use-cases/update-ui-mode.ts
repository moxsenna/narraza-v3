import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { UiMode } from '../ports/user-settings-port.js';
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';

export interface UpdateUiModeInput {
  readonly ownerUserId: string;
  readonly mode: string;
}

export interface UpdateUiModeOutput {
  readonly uiMode: UiMode;
}

/**
 * Persists the caller's own experience mode (D3). Exactly two modes;
 * anything else is rejected without touching the database.
 */
export function createUpdateUiMode(
  uow: UnitOfWork,
): (input: UpdateUiModeInput) => Promise<Result<UpdateUiModeOutput, AppError>> {
  return async (input) => {
    const mode = input.mode;
    if (mode !== 'pemula' && mode !== 'mahir') {
      return err(appError('VALIDATION', 'msg.settings.invalid_mode', 400));
    }
    const updated = await uow.execute(async (ports) => {
      if (!ports.userSettings) return null;
      return ports.userSettings.updateUiMode(input.ownerUserId, mode);
    });
    if (!updated) return err(appError('CONFLICT', 'msg.settings.update_failed', 409));
    return ok({ uiMode: updated.uiMode });
  };
}

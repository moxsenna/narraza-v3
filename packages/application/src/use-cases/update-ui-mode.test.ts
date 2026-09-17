import { describe, expect, it } from 'vitest';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { UiMode } from '../ports/user-settings-port.js';
import { createUpdateUiMode } from './update-ui-mode.js';

function stubUoW(updateUiMode?: (userId: string, mode: UiMode) => Promise<{ uiMode: UiMode }>) {
  const calls: Array<{ userId: string; mode: UiMode }> = [];
  const ports = updateUiMode
    ? {
        userSettings: {
          updateUiMode: async (userId: string, mode: UiMode) => {
            calls.push({ userId, mode });
            return updateUiMode(userId, mode);
          },
        },
      }
    : {};
  const uow: UnitOfWork = {
    execute: async (work) => work(ports as never),
  };
  return { uow, calls };
}

describe('update-ui-mode', () => {
  it('persists pemula and mahir, rejects anything else without touching the port', async () => {
    const { uow, calls } = stubUoW(async (_userId, mode) => ({ uiMode: mode }));

    for (const mode of ['pemula', 'mahir'] as const) {
      const result = await createUpdateUiMode(uow)({ ownerUserId: 'user-1', mode });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.uiMode).toBe(mode);
    }
    expect(calls).toHaveLength(2);

    const bad = await createUpdateUiMode(uow)({ ownerUserId: 'user-1', mode: 'expert' });
    expect(bad.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('fails closed when the port is not configured', async () => {
    const { uow } = stubUoW(undefined);
    const result = await createUpdateUiMode(uow)({ ownerUserId: 'user-1', mode: 'mahir' });
    expect(result.ok).toBe(false);
  });
});

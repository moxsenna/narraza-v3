import { describe, expect, it } from 'vitest';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { NEW_USER_GRANT_CREDITS, createNewUserGrantService } from './grant-new-user-credit.js';

function stubUoW(
  appendGrant: (input: {
    userId: string;
    ledgerEntryId: string;
    amountMicroIdr: bigint;
    dedupeKey: string;
  }) => Promise<{ kind: 'granted' | 'already_granted' | 'binding_invalid' }>,
) {
  const calls: Array<object> = [];
  const ports = {
    ledger: {
      appendGrant: async (input: {
        userId: string;
        ledgerEntryId: string;
        amountMicroIdr: bigint;
        dedupeKey: string;
      }) => {
        calls.push(input);
        return appendGrant(input);
      },
    },
  };
  const uow: UnitOfWork = {
    execute: async (work) => work(ports as never),
  };
  return { uow, calls };
}

describe('new-user grant', () => {
  it('appends exactly one grant row with the fixed dedupe key', async () => {
    const { uow, calls } = stubUoW(async () => ({ kind: 'granted' }));
    const result = await createNewUserGrantService({ unitOfWork: uow }).ensureGrant({
      userId: 'user-1',
      ledgerEntryId: 'entry-1',
      microIdrPerCredit: 10_000_000n,
    });
    expect(result).toBe('granted');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      userId: 'user-1',
      amountMicroIdr: NEW_USER_GRANT_CREDITS * 10_000_000n,
      dedupeKey: 'grant:new-user:user-1',
    });
  });

  it('converges on replay and binding anomalies alike', async () => {
    const replay = stubUoW(async () => ({ kind: 'already_granted' }));
    await expect(
      createNewUserGrantService({ unitOfWork: replay.uow }).ensureGrant({
        userId: 'user-1',
        ledgerEntryId: 'entry-2',
        microIdrPerCredit: 10_000_000n,
      }),
    ).resolves.toBe('already_granted');

    const divergent = stubUoW(async () => ({ kind: 'binding_invalid' }));
    await expect(
      createNewUserGrantService({ unitOfWork: divergent.uow }).ensureGrant({
        userId: 'user-1',
        ledgerEntryId: 'entry-3',
        microIdrPerCredit: 10_000_000n,
      }),
    ).resolves.toBe('already_granted');
  });

  it('rejects non-positive conversion rates instead of granting zero', async () => {
    const { uow } = stubUoW(async () => ({ kind: 'granted' }));
    await expect(
      createNewUserGrantService({ unitOfWork: uow }).ensureGrant({
        userId: 'user-1',
        ledgerEntryId: 'entry-4',
        microIdrPerCredit: 0n,
      }),
    ).rejects.toThrow(/positive/);
  });
});

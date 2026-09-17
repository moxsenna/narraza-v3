import type { UiMode, UserSettingsPort } from '@narraza/application';
import type { TxClient } from './tx-client.js';

/** Settings writes stay inside the db package (D8): web never touches Prisma. */
export function createUserSettingsPort(tx: TxClient): UserSettingsPort {
  return {
    async updateUiMode(userId: string, mode: UiMode) {
      await tx.user.update({
        where: { id: userId },
        data: { uiMode: mode },
      });
      return { uiMode: mode };
    },
  };
}

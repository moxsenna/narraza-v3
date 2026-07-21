import type { AuthTransactions } from '@narraza/application';
import type { PrismaClient } from '../client.js';

/**
 * The two race-critical auth operations (D21), each one DB transaction.
 *
 * Correctness hinges on the conditional UPDATE on the token row being the
 * serialization point: `... WHERE token_hash = $1 AND consumed_at IS NULL AND
 * revoked_at IS NULL AND expires_at > now()`. Under READ COMMITTED (the default,
 * D9) two concurrent consumers of the same token both target the same unique
 * row; the second blocks on the first's row lock, then re-evaluates the WHERE
 * after commit — finds consumed_at set — and updates 0 rows. So a token is
 * consumed at most once, no explicit locking needed.
 */
export function createAuthTransactions(prisma: PrismaClient): AuthTransactions {
  return {
    async consumeEmailVerification(tokenHash) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ user_id: string }[]>`
          UPDATE email_action_tokens
             SET consumed_at = now()
           WHERE token_hash = ${tokenHash}
             AND purpose = 'verify_email'::email_token_purpose
             AND consumed_at IS NULL
             AND revoked_at IS NULL
             AND expires_at > now()
          RETURNING user_id`;

        const userId = rows[0]?.user_id;
        if (!userId) return null;

        await tx.$executeRaw`
          UPDATE users
             SET email_verified_at = now(),
                 status = 'active'::user_status,
                 updated_at = now()
           WHERE id = ${userId}
             AND status = 'pending_verification'::user_status`;

        // Revoke any other still-live verify tokens for this user.
        await tx.$executeRaw`
          UPDATE email_action_tokens
             SET revoked_at = now()
           WHERE user_id = ${userId}
             AND purpose = 'verify_email'::email_token_purpose
             AND consumed_at IS NULL
             AND revoked_at IS NULL`;

        return { userId };
      });
    },

    async consumePasswordReset({ tokenHash, newPasswordHash }) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ user_id: string }[]>`
          UPDATE email_action_tokens
             SET consumed_at = now()
           WHERE token_hash = ${tokenHash}
             AND purpose = 'reset_password'::email_token_purpose
             AND consumed_at IS NULL
             AND revoked_at IS NULL
             AND expires_at > now()
          RETURNING user_id`;

        const userId = rows[0]?.user_id;
        if (!userId) return null;

        await tx.$executeRaw`
          UPDATE users
             SET password_hash = ${newPasswordHash},
                 updated_at = now()
           WHERE id = ${userId}`;

        await tx.$executeRaw`
          UPDATE email_action_tokens
             SET revoked_at = now()
           WHERE user_id = ${userId}
             AND purpose = 'reset_password'::email_token_purpose
             AND consumed_at IS NULL
             AND revoked_at IS NULL`;

        // Changing the password kills every existing session (D21).
        await tx.$executeRaw`
          UPDATE sessions
             SET revoked_at = now()
           WHERE user_id = ${userId}
             AND revoked_at IS NULL`;

        return { userId };
      });
    },
  };
}

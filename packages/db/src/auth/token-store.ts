import type { EmailTokenStore } from '@narraza/application';
import type { PrismaClient } from '../client.js';

/**
 * Email verify/reset token issuance + lookup. The cap (max N live tokens per
 * user+purpose, D21) is enforced inside a transaction that revokes the oldest
 * surplus before inserting — the same DoS lesson as the old challenge-cap.
 */
export function createEmailTokenStore(prisma: PrismaClient): EmailTokenStore {
  return {
    async issue({ userId, purpose, tokenHash, ttlMinutes, maxActive }) {
      await prisma.$transaction(async (tx) => {
        // Lock this user's live tokens for the purpose so concurrent issues
        // can't both slip past the cap.
        const live = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM email_action_tokens
           WHERE user_id = ${userId}
             AND purpose = ${purpose}::email_token_purpose
             AND consumed_at IS NULL
             AND revoked_at IS NULL
             AND expires_at > now()
           ORDER BY created_at ASC
           FOR UPDATE`;

        const surplus = live.length - (maxActive - 1);
        for (let i = 0; i < surplus; i++) {
          await tx.$executeRaw`
            UPDATE email_action_tokens SET revoked_at = now() WHERE id = ${live[i]!.id}`;
        }

        await tx.$executeRaw`
          INSERT INTO email_action_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
          VALUES (
            gen_random_uuid()::text,
            ${userId},
            ${purpose}::email_token_purpose,
            ${tokenHash},
            now() + make_interval(mins => ${ttlMinutes}),
            now()
          )`;
      });
    },

    async revokeAllForUserPurpose(userId, purpose) {
      await prisma.$executeRaw`
        UPDATE email_action_tokens
           SET revoked_at = now()
         WHERE user_id = ${userId}
           AND purpose = ${purpose}::email_token_purpose
           AND consumed_at IS NULL
           AND revoked_at IS NULL`;
    },

    async findActiveTokenUser({ tokenHash, purpose }) {
      const rows = await prisma.$queryRaw<{ user_id: string; email: string }[]>`
        SELECT t.user_id, u.email
          FROM email_action_tokens t
          JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ${tokenHash}
           AND t.purpose = ${purpose}::email_token_purpose
           AND t.consumed_at IS NULL
           AND t.revoked_at IS NULL
           AND t.expires_at > now()`;
      const row = rows[0];
      return row ? { userId: row.user_id, email: row.email } : null;
    },
  };
}

import { randomBytes } from 'node:crypto';
import type { SessionIssuer } from '@narraza/application';
import type { PrismaClient } from '../client.js';

/**
 * Session management (S6.2). M0 uses a custom DB-backed session rather than the
 * @auth/prisma-adapter session lifecycle, because our policy — absolute 30d cap
 * AND sliding idle 14d AND server-side revoke AND throttled lastActiveAt writes
 * — doesn't fit Auth.js's single-`expires` model, and Auth.js v5's Credentials
 * provider doesn't support database sessions cleanly. D8's enforceable invariant
 * (web reaches the DB only through @narraza/db; web-boundary test) is preserved:
 * all session I/O goes through this module. When Google OAuth lands (D21
 * follow-up), the Auth.js adapter + Account table can be added alongside.
 *
 * The session token is a 256-bit random opaque value stored as-is (Auth.js
 * convention); the cookie is httpOnly + secure and set by the web layer.
 */
export interface SessionConfig {
  idleDays: number;
  absoluteDays: number;
  activityWriteHours: number;
}

export interface ValidatedSession {
  userId: string;
  email: string;
  status: 'pending_verification' | 'active' | 'suspended' | 'deleted';
  uiMode: 'pemula' | 'mahir';
  tier: 'hemat' | 'seimbang' | 'terbaik';
}

export interface SessionStore extends SessionIssuer {
  validateSession(sessionToken: string): Promise<ValidatedSession | null>;
  revokeSession(sessionToken: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createSessionStore(prisma: PrismaClient, config: SessionConfig): SessionStore {
  return {
    async createSession(userId) {
      const sessionToken = newSessionToken();
      const rows = await prisma.$queryRaw<{ expires_at: Date }[]>`
        INSERT INTO sessions
          (id, session_token, user_id, expires_at, absolute_expires_at, last_active_at, created_at)
        VALUES (
          gen_random_uuid()::text,
          ${sessionToken},
          ${userId},
          now() + make_interval(days => ${config.idleDays}::int),
          now() + make_interval(days => ${config.absoluteDays}::int),
          now(),
          now()
        )
        RETURNING expires_at`;
      return { sessionToken, expiresAt: rows[0]!.expires_at };
    },

    async validateSession(sessionToken) {
      const rows = await prisma.$queryRaw<
        {
          user_id: string;
          email: string;
          status: ValidatedSession['status'];
          ui_mode: ValidatedSession['uiMode'];
          tier: ValidatedSession['tier'];
          stale: boolean;
        }[]
      >`
        SELECT u.id AS user_id, u.email, u.status, u.ui_mode, u.tier,
               (s.last_active_at < now() - make_interval(hours => ${config.activityWriteHours}::int)) AS stale
          FROM sessions s
          JOIN users u ON u.id = s.user_id
         WHERE s.session_token = ${sessionToken}
           AND s.revoked_at IS NULL
           AND s.expires_at > now()
           AND s.absolute_expires_at > now()`;

      const row = rows[0];
      if (!row || row.status !== 'active') return null;

      // Sliding idle refresh, throttled to ≤1 write / activityWriteHours (S6.2).
      // Idle expiry never exceeds the absolute cap.
      if (row.stale) {
        await prisma.$executeRaw`
          UPDATE sessions
             SET last_active_at = now(),
                 expires_at = LEAST(
                   now() + make_interval(days => ${config.idleDays}::int),
                   absolute_expires_at
                 )
           WHERE session_token = ${sessionToken}
             AND revoked_at IS NULL`;
      }

      return {
        userId: row.user_id,
        email: row.email,
        status: row.status,
        uiMode: row.ui_mode,
        tier: row.tier,
      };
    },

    async revokeSession(sessionToken) {
      await prisma.$executeRaw`
        UPDATE sessions SET revoked_at = now()
         WHERE session_token = ${sessionToken} AND revoked_at IS NULL`;
    },

    async revokeAllForUser(userId) {
      await prisma.$executeRaw`
        UPDATE sessions SET revoked_at = now()
         WHERE user_id = ${userId} AND revoked_at IS NULL`;
    },
  };
}

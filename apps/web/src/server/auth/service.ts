import 'server-only';
import { loadWebEnv } from '@narraza/shared/env/web';
import { createPrismaClient, createDbAuthAdapters, type SessionStore } from '@narraza/db';
import { createAuthService, type AuthConfig, type AuthService } from '@narraza/application';
import { createArgon2Hasher } from './adapters/password-hasher';
import { createTokenService, createIdentifierHasher } from './adapters/crypto';
import { createMailer } from './adapters/mailer';

/**
 * Auth composition root. Web reaches the DB only via @narraza/db (D8 /
 * web-boundary); it never imports @prisma/client. Built once and cached on
 * globalThis so Next.js dev hot-reloads don't leak Prisma connections.
 */
interface AuthBundle {
  service: AuthService;
  sessions: SessionStore;
  isProd: boolean;
}

function build(): AuthBundle {
  const env = loadWebEnv();

  const prisma = createPrismaClient(env.DATABASE_URL_WEB);
  const db = createDbAuthAdapters(prisma, {
    idleDays: env.SESSION_IDLE_DAYS,
    absoluteDays: env.SESSION_ABSOLUTE_DAYS,
    activityWriteHours: env.SESSION_ACTIVITY_WRITE_HOURS,
  });

  const config: AuthConfig = {
    passwordMinLength: env.PASSWORD_MIN_LENGTH,
    passwordMaxLength: 200,
    emailVerifyTokenTtlMinutes: env.EMAIL_VERIFY_TOKEN_TTL_MINUTES,
    passwordResetTokenTtlMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    emailTokenResendCooldownSeconds: env.EMAIL_TOKEN_RESEND_COOLDOWN_SECONDS,
    emailTokenMaxPerHourIdentifier: env.EMAIL_TOKEN_MAX_PER_HOUR_IDENTIFIER,
    emailTokenMaxPerHourIp: env.EMAIL_TOKEN_MAX_PER_HOUR_IP,
    emailTokenMaxActive: env.EMAIL_TOKEN_MAX_ACTIVE,
    loginMaxFailsPerHourIdentifier: env.LOGIN_MAX_FAILS_PER_HOUR_IDENTIFIER,
    loginLockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
    loginMaxFailsPerHourIp: env.LOGIN_MAX_FAILS_PER_HOUR_IP,
    registerMaxPerHourIp: env.REGISTER_MAX_PER_HOUR_IP,
    appUrl: env.APP_URL,
  };

  const service = createAuthService(
    {
      users: db.users,
      tokens: db.tokens,
      tx: db.tx,
      rateLimit: db.rateLimit,
      sessions: db.sessions,
      passwordHasher: createArgon2Hasher({
        memoryKiB: env.ARGON2_MEMORY_KIB,
        timeCost: env.ARGON2_TIME_COST,
        parallelism: env.ARGON2_PARALLELISM,
      }),
      tokenService: createTokenService(env.EMAIL_TOKEN_PEPPER),
      identifierHasher: createIdentifierHasher(env.RATE_LIMIT_PEPPER),
      mailer: createMailer({
        from: env.EMAIL_FROM,
        smtpUrl: env.SMTP_URL,
        resendApiKey: env.RESEND_API_KEY,
      }),
    },
    config,
  );

  return { service, sessions: db.sessions, isProd: env.NODE_ENV === 'production' };
}

const globalForAuth = globalThis as unknown as { __narrazaAuth?: AuthBundle };

export function getAuth(): AuthBundle {
  return (globalForAuth.__narrazaAuth ??= build());
}

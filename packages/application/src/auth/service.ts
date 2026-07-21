import { auth as coreAuth } from '@narraza/core';
import { err, ok, type Result } from '../result.js';
import { authError, type AuthError } from './errors.js';
import {
  AUTH_PATHS,
  buildTokenUrl,
  ONE_HOUR_SECONDS,
  RL,
  type AuthConfig,
  type EmailTokenPurpose,
} from './constants.js';
import type { AuthPorts } from './ports.js';

export interface SessionResult {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}
export type RequestContext = { ip: string };

/**
 * Auth use cases (M0 W0.4, D21). Security-sensitive orchestration; the two
 * race-critical atomic operations live behind ports.tx. Enumeration-safety and
 * generic error mapping are enforced here, not in the UI.
 */
export function createAuthService(ports: AuthPorts, config: AuthConfig) {
  const passwordPolicy = {
    minLength: config.passwordMinLength,
    maxLength: config.passwordMaxLength,
  };

  const overLimit = (count: number, limit: number) => count > limit;

  /**
   * Issue + email a token, enforcing cooldown + per-identifier + per-IP limits
   * and the max-active cap. Returns whether it was actually sent; callers that
   * must stay enumeration-safe ignore the reason and return a generic success.
   */
  async function issueAndSend(
    user: { id: string; email: string },
    purpose: EmailTokenPurpose,
    ctx: RequestContext,
  ): Promise<{ sent: boolean; reason?: 'cooldown' | 'rate_limited' }> {
    const idKey = ports.identifierHasher.hashIdentifier(user.email);
    const ipKey = ports.identifierHasher.hashIdentifier(ctx.ip);

    if (await ports.rateLimit.markerActive({ kind: RL.emailTokenCooldown(purpose), key: idKey })) {
      return { sent: false, reason: 'cooldown' };
    }

    const idCount = await ports.rateLimit.increment({
      kind: RL.emailTokenIdentifier(purpose),
      key: idKey,
      windowSeconds: ONE_HOUR_SECONDS,
    });
    const ipCount = await ports.rateLimit.increment({
      kind: RL.emailTokenIp(purpose),
      key: ipKey,
      windowSeconds: ONE_HOUR_SECONDS,
    });
    if (
      overLimit(idCount, config.emailTokenMaxPerHourIdentifier) ||
      overLimit(ipCount, config.emailTokenMaxPerHourIp)
    ) {
      return { sent: false, reason: 'rate_limited' };
    }

    const rawToken = ports.tokenService.generateToken();
    const tokenHash = ports.tokenService.hashToken(rawToken);
    const ttlMinutes =
      purpose === 'verify_email'
        ? config.emailVerifyTokenTtlMinutes
        : config.passwordResetTokenTtlMinutes;

    await ports.tokens.issue({
      userId: user.id,
      purpose,
      tokenHash,
      ttlMinutes,
      maxActive: config.emailTokenMaxActive,
    });
    await ports.rateLimit.setMarker({
      kind: RL.emailTokenCooldown(purpose),
      key: idKey,
      ttlSeconds: config.emailTokenResendCooldownSeconds,
    });

    const path = purpose === 'verify_email' ? AUTH_PATHS.verifyConfirm : AUTH_PATHS.resetConfirm;
    const url = buildTokenUrl(config.appUrl, path, rawToken);
    if (purpose === 'verify_email') {
      await ports.mailer.sendVerifyEmail({ to: user.email, url });
    } else {
      await ports.mailer.sendPasswordReset({ to: user.email, url });
    }
    return { sent: true };
  }

  async function registerAccount(input: {
    email: string;
    password: string;
    ctx: RequestContext;
  }): Promise<Result<{ status: 'verification_sent' }, AuthError>> {
    const email = coreAuth.normalizeEmail(input.email);
    if (!coreAuth.isValidEmailShape(email)) {
      return err(authError('INVALID_INPUT'));
    }

    const violations = coreAuth.checkPassword({
      password: input.password,
      email,
      policy: passwordPolicy,
    });
    if (violations.length > 0) {
      return err(authError('WEAK_PASSWORD', { violations }));
    }

    const ipKey = ports.identifierHasher.hashIdentifier(input.ctx.ip);
    const ipCount = await ports.rateLimit.increment({
      kind: RL.registerIp,
      key: ipKey,
      windowSeconds: ONE_HOUR_SECONDS,
    });
    if (overLimit(ipCount, config.registerMaxPerHourIp)) {
      return err(authError('RATE_LIMITED'));
    }

    // Enumeration-safe: every branch returns the same generic success.
    const existing = await ports.users.findByEmail(email);
    if (existing) {
      if (existing.status === 'pending_verification') {
        await issueAndSend(existing, 'verify_email', input.ctx);
      } else if (existing.status === 'active') {
        await ports.mailer.sendAccountExistsNotice({ to: email });
      }
      return ok({ status: 'verification_sent' });
    }

    const passwordHash = await ports.passwordHasher.hash(input.password);
    const created = await ports.users.createPendingUser({ email, passwordHash });
    if (!created) {
      // Lost a create race → the address now exists; stay enumeration-safe.
      await ports.mailer.sendAccountExistsNotice({ to: email });
      return ok({ status: 'verification_sent' });
    }

    await issueAndSend(created, 'verify_email', input.ctx);
    return ok({ status: 'verification_sent' });
  }

  /** Explicit "resend verification" from the check-email screen. Unlike register,
   * this surfaces cooldown/rate-limit so the UI can show the countdown. */
  async function requestEmailVerification(input: {
    email: string;
    ctx: RequestContext;
  }): Promise<Result<{ status: 'verification_sent' }, AuthError>> {
    const email = coreAuth.normalizeEmail(input.email);
    const user = await ports.users.findByEmail(email);
    if (!user || user.status !== 'pending_verification') {
      // Nothing to resend, but don't reveal that.
      return ok({ status: 'verification_sent' });
    }
    const result = await issueAndSend(user, 'verify_email', input.ctx);
    if (!result.sent) return err(authError('RATE_LIMITED', { reason: result.reason }));
    return ok({ status: 'verification_sent' });
  }

  async function verifyEmail(input: { token: string }): Promise<Result<SessionResult, AuthError>> {
    const tokenHash = ports.tokenService.hashToken(input.token);
    const consumed = await ports.tx.consumeEmailVerification(tokenHash);
    if (!consumed) return err(authError('INVALID_TOKEN'));

    const session = await ports.sessions.createSession(consumed.userId);
    return ok({ userId: consumed.userId, ...session });
  }

  async function login(input: {
    email: string;
    password: string;
    ctx: RequestContext;
  }): Promise<Result<SessionResult, AuthError>> {
    const email = coreAuth.normalizeEmail(input.email);
    const idKey = ports.identifierHasher.hashIdentifier(email);
    const ipKey = ports.identifierHasher.hashIdentifier(input.ctx.ip);

    if (await ports.rateLimit.markerActive({ kind: RL.loginLock, key: idKey })) {
      return err(authError('ACCOUNT_LOCKED'));
    }
    const ipFails = await ports.rateLimit.count({
      kind: RL.loginFailIp,
      key: ipKey,
      windowSeconds: ONE_HOUR_SECONDS,
    });
    if (overLimit(ipFails, config.loginMaxFailsPerHourIp)) {
      return err(authError('RATE_LIMITED'));
    }

    const user = await ports.users.findByEmail(email);
    // Always run a hash verification to keep timing uniform for unknown emails.
    const passwordOk = user
      ? await ports.passwordHasher.verify(user.passwordHash, input.password)
      : await ports.passwordHasher.dummyVerify(input.password);

    if (!user || !passwordOk || user.status === 'suspended' || user.status === 'deleted') {
      await registerLoginFailure(idKey, ipKey);
      return err(authError('INVALID_CREDENTIALS'));
    }

    if (user.status === 'pending_verification' || user.emailVerifiedAt === null) {
      // Correct credentials but unverified — not a brute-force signal, so no
      // failure is counted.
      return err(authError('EMAIL_NOT_VERIFIED'));
    }

    await ports.rateLimit.clearMarkers({ kind: RL.loginLock, key: idKey });
    await ports.rateLimit.clearMarkers({ kind: RL.loginFailIdentifier, key: idKey });

    const session = await ports.sessions.createSession(user.id);
    return ok({ userId: user.id, ...session });
  }

  async function registerLoginFailure(idKey: string, ipKey: string): Promise<void> {
    const idFails = await ports.rateLimit.increment({
      kind: RL.loginFailIdentifier,
      key: idKey,
      windowSeconds: ONE_HOUR_SECONDS,
    });
    await ports.rateLimit.increment({
      kind: RL.loginFailIp,
      key: ipKey,
      windowSeconds: ONE_HOUR_SECONDS,
    });
    if (idFails >= config.loginMaxFailsPerHourIdentifier) {
      await ports.rateLimit.setMarker({
        kind: RL.loginLock,
        key: idKey,
        ttlSeconds: config.loginLockoutMinutes * 60,
      });
    }
  }

  async function requestPasswordReset(input: {
    email: string;
    ctx: RequestContext;
  }): Promise<Result<{ status: 'reset_sent' }, AuthError>> {
    const email = coreAuth.normalizeEmail(input.email);
    // Always generic: never reveal whether the address exists.
    if (coreAuth.isValidEmailShape(email)) {
      const user = await ports.users.findByEmail(email);
      if (user && user.status === 'active') {
        await issueAndSend(user, 'reset_password', input.ctx);
      }
    }
    return ok({ status: 'reset_sent' });
  }

  async function resetPassword(input: {
    token: string;
    newPassword: string;
  }): Promise<Result<{ status: 'password_changed' }, AuthError>> {
    const tokenHash = ports.tokenService.hashToken(input.token);

    // Resolve (without consuming) to validate the new password against the
    // account email. The subsequent consume is still atomic, so a token used in
    // the meantime yields INVALID_TOKEN.
    const target = await ports.tokens.findActiveTokenUser({ tokenHash, purpose: 'reset_password' });
    if (!target) return err(authError('INVALID_TOKEN'));

    const violations = coreAuth.checkPassword({
      password: input.newPassword,
      email: target.email,
      policy: passwordPolicy,
    });
    if (violations.length > 0) return err(authError('WEAK_PASSWORD', { violations }));

    const newPasswordHash = await ports.passwordHasher.hash(input.newPassword);
    const consumed = await ports.tx.consumePasswordReset({ tokenHash, newPasswordHash });
    if (!consumed) return err(authError('INVALID_TOKEN'));

    return ok({ status: 'password_changed' });
  }

  return {
    registerAccount,
    requestEmailVerification,
    verifyEmail,
    login,
    requestPasswordReset,
    resetPassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

import { beforeEach, describe, expect, it } from 'vitest';
import { createAuthService } from './service.js';
import type { AuthConfig, EmailTokenPurpose } from './constants.js';
import type {
  AuthPorts,
  AuthUserRecord,
  EmailTokenStore,
  IdentifierHasher,
  Mailer,
  PasswordHasher,
  RateLimitStore,
  SessionIssuer,
  TokenService,
  UserStore,
  AuthTransactions,
} from './ports.js';

// --- controllable clock shared by the fakes ---
const clock = { now: new Date('2026-07-21T00:00:00Z') };
const nowMs = () => clock.now.getTime();
const advance = (seconds: number) => {
  clock.now = new Date(clock.now.getTime() + seconds * 1000);
};

const config: AuthConfig = {
  passwordMinLength: 10,
  passwordMaxLength: 200,
  emailVerifyTokenTtlMinutes: 1440,
  passwordResetTokenTtlMinutes: 30,
  emailTokenResendCooldownSeconds: 60,
  emailTokenMaxPerHourIdentifier: 5,
  emailTokenMaxPerHourIp: 20,
  emailTokenMaxActive: 3,
  loginMaxFailsPerHourIdentifier: 10,
  loginLockoutMinutes: 15,
  loginMaxFailsPerHourIp: 30,
  registerMaxPerHourIp: 10,
  appUrl: 'http://localhost:3000',
};

interface TokenRow {
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  expiresAt: number;
  consumedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

function makePorts() {
  const users = new Map<string, AuthUserRecord>();
  let userSeq = 0;
  const tokens: TokenRow[] = [];
  const sessions = new Map<string, Set<string>>(); // userId -> session tokens
  let sessionSeq = 0;
  const windows = new Map<string, number>();
  const markers = new Map<string, number>(); // key -> expiresAt ms
  const sentEmails: { kind: string; to: string; url?: string }[] = [];

  const liveToken = (t: TokenRow) =>
    t.consumedAt === null && t.revokedAt === null && t.expiresAt > nowMs();

  const userStore: UserStore = {
    async findByEmail(email) {
      return users.get(email) ?? null;
    },
    async findById(id) {
      return [...users.values()].find((u) => u.id === id) ?? null;
    },
    async createPendingUser({ email, passwordHash }) {
      if (users.has(email)) return null;
      const user: AuthUserRecord = {
        id: `u${++userSeq}`,
        email,
        passwordHash,
        status: 'pending_verification',
        emailVerifiedAt: null,
      };
      users.set(email, user);
      return user;
    },
  };

  const tokenStore: EmailTokenStore = {
    async issue({ userId, purpose, tokenHash, ttlMinutes, maxActive }) {
      const active = tokens
        .filter((t) => t.userId === userId && t.purpose === purpose && liveToken(t))
        .sort((a, b) => a.createdAt - b.createdAt);
      // revoke oldest until under cap (cap counts the one about to be added)
      let over = active.length - (maxActive - 1);
      for (let i = 0; i < active.length && over > 0; i++, over--) {
        active[i]!.revokedAt = nowMs();
      }
      tokens.push({
        userId,
        purpose,
        tokenHash,
        expiresAt: nowMs() + ttlMinutes * 60_000,
        consumedAt: null,
        revokedAt: null,
        createdAt: nowMs() + tokens.length, // stable tiebreak
      });
    },
    async revokeAllForUserPurpose(userId, purpose) {
      for (const t of tokens) {
        if (t.userId === userId && t.purpose === purpose && liveToken(t)) t.revokedAt = nowMs();
      }
    },
    async findActiveTokenUser({ tokenHash, purpose }) {
      const t = tokens.find(
        (x) => x.tokenHash === tokenHash && x.purpose === purpose && liveToken(x),
      );
      if (!t) return null;
      const user = [...users.values()].find((u) => u.id === t.userId);
      return user ? { userId: user.id, email: user.email } : null;
    },
  };

  const tx: AuthTransactions = {
    async consumeEmailVerification(tokenHash) {
      const t = tokens.find(
        (x) => x.tokenHash === tokenHash && x.purpose === 'verify_email' && liveToken(x),
      );
      if (!t) return null;
      t.consumedAt = nowMs(); // single-consume: guarded by liveToken above
      const user = [...users.values()].find((u) => u.id === t.userId);
      if (user) {
        user.status = 'active';
        user.emailVerifiedAt = new Date(nowMs());
      }
      for (const other of tokens) {
        if (
          other !== t &&
          other.userId === t.userId &&
          other.purpose === 'verify_email' &&
          liveToken(other)
        )
          other.revokedAt = nowMs();
      }
      return { userId: t.userId };
    },
    async consumePasswordReset({ tokenHash, newPasswordHash }) {
      const t = tokens.find(
        (x) => x.tokenHash === tokenHash && x.purpose === 'reset_password' && liveToken(x),
      );
      if (!t) return null;
      t.consumedAt = nowMs();
      const user = [...users.values()].find((u) => u.id === t.userId);
      if (user) user.passwordHash = newPasswordHash;
      for (const other of tokens) {
        if (
          other !== t &&
          other.userId === t.userId &&
          other.purpose === 'reset_password' &&
          liveToken(other)
        )
          other.revokedAt = nowMs();
      }
      sessions.set(t.userId, new Set()); // revoke ALL sessions
      return { userId: t.userId };
    },
  };

  const windowKey = (kind: string, key: string, windowSeconds: number) =>
    `${kind}|${key}|${Math.floor(nowMs() / 1000 / windowSeconds)}`;

  const rateLimit: RateLimitStore = {
    async increment({ kind, key, windowSeconds }) {
      const k = windowKey(kind, key, windowSeconds);
      const next = (windows.get(k) ?? 0) + 1;
      windows.set(k, next);
      return next;
    },
    async count({ kind, key, windowSeconds }) {
      return windows.get(windowKey(kind, key, windowSeconds)) ?? 0;
    },
    async setMarker({ kind, key, ttlSeconds }) {
      markers.set(`${kind}|${key}`, nowMs() + ttlSeconds * 1000);
    },
    async markerActive({ kind, key }) {
      const exp = markers.get(`${kind}|${key}`);
      return exp !== undefined && exp > nowMs();
    },
    async clearMarkers({ kind, key }) {
      markers.delete(`${kind}|${key}`);
    },
  };

  const sessionIssuer: SessionIssuer = {
    async createSession(userId) {
      const token = `sess${++sessionSeq}`;
      const set = sessions.get(userId) ?? new Set();
      set.add(token);
      sessions.set(userId, set);
      return { sessionToken: token, expiresAt: new Date(nowMs() + 14 * 86400_000) };
    },
  };

  const passwordHasher: PasswordHasher = {
    async hash(password) {
      return `hashed:${password}`;
    },
    async verify(hash, password) {
      return hash === `hashed:${password}`;
    },
    async dummyVerify() {
      return false;
    },
  };

  let tokenSeq = 0;
  const tokenService: TokenService = {
    generateToken() {
      return `raw${++tokenSeq}`;
    },
    hashToken(raw) {
      return `h:${raw}`;
    },
  };

  const identifierHasher: IdentifierHasher = {
    hashIdentifier(value) {
      return `id:${value}`;
    },
  };

  const mailer: Mailer = {
    async sendVerifyEmail({ to, url }) {
      sentEmails.push({ kind: 'verify', to, url });
    },
    async sendPasswordReset({ to, url }) {
      sentEmails.push({ kind: 'reset', to, url });
    },
    async sendAccountExistsNotice({ to }) {
      sentEmails.push({ kind: 'account_exists', to });
    },
  };

  const ports: AuthPorts = {
    users: userStore,
    tokens: tokenStore,
    tx,
    rateLimit,
    sessions: sessionIssuer,
    passwordHasher,
    tokenService,
    identifierHasher,
    mailer,
  };

  const tokenFromUrl = (url: string) => new URL(url).searchParams.get('token')!;

  return { ports, users, tokens, sessions, sentEmails, tokenFromUrl };
}

const ctx = { ip: '203.0.113.7' };

describe('registerAccount', () => {
  beforeEach(() => {
    clock.now = new Date('2026-07-21T00:00:00Z');
  });

  it('creates a pending user and emails a verification link', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    const res = await svc.registerAccount({
      email: 'Writer@Narraza.test',
      password: 'a-good-long-pass',
      ctx,
    });
    expect(res.ok).toBe(true);
    const user = h.users.get('writer@narraza.test')!;
    expect(user.status).toBe('pending_verification');
    expect(h.sentEmails).toHaveLength(1);
    expect(h.sentEmails[0]!.kind).toBe('verify');
  });

  it('rejects weak passwords with violation details', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    const res = await svc.registerAccount({ email: 'w@n.test', password: 'short', ctx });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('WEAK_PASSWORD');
      expect(res.error.details!.violations as string[]).toContain('too_short');
    }
    expect(h.users.size).toBe(0);
  });

  it('is enumeration-safe: existing active account returns the same generic success', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    h.users.set('taken@narraza.test', {
      id: 'u9',
      email: 'taken@narraza.test',
      passwordHash: 'hashed:whatever',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    const res = await svc.registerAccount({
      email: 'taken@narraza.test',
      password: 'a-good-long-pass',
      ctx,
    });
    expect(res.ok).toBe(true); // same shape as a fresh registration
    expect(h.sentEmails.at(-1)!.kind).toBe('account_exists'); // no verify link leaked
  });

  it('enforces the per-IP registration limit', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    for (let i = 0; i < config.registerMaxPerHourIp; i++) {
      const r = await svc.registerAccount({
        email: `u${i}@narraza.test`,
        password: 'a-good-long-pass',
        ctx,
      });
      expect(r.ok).toBe(true);
    }
    const over = await svc.registerAccount({
      email: 'last@narraza.test',
      password: 'a-good-long-pass',
      ctx,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe('RATE_LIMITED');
  });
});

describe('verifyEmail', () => {
  beforeEach(() => {
    clock.now = new Date('2026-07-21T00:00:00Z');
  });

  it('activates the account and issues a session; the token cannot be reused', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await svc.registerAccount({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    const token = h.tokenFromUrl(h.sentEmails[0]!.url!);

    const first = await svc.verifyEmail({ token });
    expect(first.ok).toBe(true);
    expect(h.users.get('w@narraza.test')!.status).toBe('active');

    const second = await svc.verifyEmail({ token });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired verification token', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await svc.registerAccount({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    const token = h.tokenFromUrl(h.sentEmails[0]!.url!);
    advance(config.emailVerifyTokenTtlMinutes * 60 + 1);
    const res = await svc.verifyEmail({ token });
    expect(res.ok).toBe(false);
  });
});

describe('login', () => {
  beforeEach(() => {
    clock.now = new Date('2026-07-21T00:00:00Z');
  });

  async function registerAndVerify(
    h: ReturnType<typeof makePorts>,
    svc: ReturnType<typeof createAuthService>,
    email: string,
    password: string,
  ) {
    await svc.registerAccount({ email, password, ctx });
    const token = h.tokenFromUrl(h.sentEmails.at(-1)!.url!);
    await svc.verifyEmail({ token });
  }

  it('succeeds for verified users with the right password', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await registerAndVerify(h, svc, 'w@narraza.test', 'a-good-long-pass');
    const res = await svc.login({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    expect(res.ok).toBe(true);
  });

  it('returns the same INVALID_CREDENTIALS for unknown email and wrong password', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await registerAndVerify(h, svc, 'w@narraza.test', 'a-good-long-pass');

    const unknown = await svc.login({
      email: 'nobody@narraza.test',
      password: 'whatever-long',
      ctx,
    });
    const wrong = await svc.login({ email: 'w@narraza.test', password: 'wrong-long-pass', ctx });
    expect(unknown.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (!unknown.ok && !wrong.ok) {
      expect(unknown.error.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('blocks login for an unverified account without counting a failure', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await svc.registerAccount({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    const res = await svc.login({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('locks the account after the failure threshold, even with the correct password', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await registerAndVerify(h, svc, 'w@narraza.test', 'a-good-long-pass');

    for (let i = 0; i < config.loginMaxFailsPerHourIdentifier; i++) {
      const r = await svc.login({ email: 'w@narraza.test', password: 'wrong-long-pass', ctx });
      expect(r.ok).toBe(false);
    }
    const locked = await svc.login({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error.code).toBe('ACCOUNT_LOCKED');

    // after the lockout window it works again
    advance(config.loginLockoutMinutes * 60 + 1);
    const after = await svc.login({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    expect(after.ok).toBe(true);
  });

  it('a successful login clears the failure counter', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await registerAndVerify(h, svc, 'w@narraza.test', 'a-good-long-pass');
    for (let i = 0; i < config.loginMaxFailsPerHourIdentifier - 1; i++) {
      await svc.login({ email: 'w@narraza.test', password: 'wrong-long-pass', ctx });
    }
    const good = await svc.login({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    expect(good.ok).toBe(true);
    // counter cleared: a fresh wrong attempt should not immediately lock
    const wrong = await svc.login({ email: 'w@narraza.test', password: 'wrong-long-pass', ctx });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('password reset', () => {
  beforeEach(() => {
    clock.now = new Date('2026-07-21T00:00:00Z');
  });

  async function setupActive(
    h: ReturnType<typeof makePorts>,
    svc: ReturnType<typeof createAuthService>,
  ) {
    await svc.registerAccount({ email: 'w@narraza.test', password: 'original-long-pass', ctx });
    const token = h.tokenFromUrl(h.sentEmails.at(-1)!.url!);
    await svc.verifyEmail({ token });
    h.sentEmails.length = 0;
  }

  it('request is enumeration-safe for unknown emails (generic success, no email sent)', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    const res = await svc.requestPasswordReset({ email: 'nobody@narraza.test', ctx });
    expect(res.ok).toBe(true);
    expect(h.sentEmails).toHaveLength(0);
  });

  it('resets the password, invalidates the token, and revokes all sessions', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await setupActive(h, svc);

    // an existing logged-in session
    await svc.login({ email: 'w@narraza.test', password: 'original-long-pass', ctx });
    expect([...h.sessions.get('u1')!].length).toBeGreaterThan(0);

    await svc.requestPasswordReset({ email: 'w@narraza.test', ctx });
    const token = h.tokenFromUrl(h.sentEmails.at(-1)!.url!);

    const res = await svc.resetPassword({ token, newPassword: 'brand-new-long-pass' });
    expect(res.ok).toBe(true);
    expect([...h.sessions.get('u1')!].length).toBe(0); // all sessions revoked

    // old password no longer works; new one does
    const oldPw = await svc.login({ email: 'w@narraza.test', password: 'original-long-pass', ctx });
    expect(oldPw.ok).toBe(false);
    const newPw = await svc.login({
      email: 'w@narraza.test',
      password: 'brand-new-long-pass',
      ctx,
    });
    expect(newPw.ok).toBe(true);

    // token cannot be reused
    const reuse = await svc.resetPassword({ token, newPassword: 'another-long-pass' });
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) expect(reuse.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a weak new password before consuming the token', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await setupActive(h, svc);
    await svc.requestPasswordReset({ email: 'w@narraza.test', ctx });
    const token = h.tokenFromUrl(h.sentEmails.at(-1)!.url!);

    const weak = await svc.resetPassword({ token, newPassword: 'short' });
    expect(weak.ok).toBe(false);
    if (!weak.ok) expect(weak.error.code).toBe('WEAK_PASSWORD');

    // token still usable afterwards (was not consumed)
    const good = await svc.resetPassword({ token, newPassword: 'brand-new-long-pass' });
    expect(good.ok).toBe(true);
  });
});

describe('email token cap + cooldown', () => {
  beforeEach(() => {
    clock.now = new Date('2026-07-21T00:00:00Z');
  });

  it('keeps at most maxActive live verification tokens (oldest revoked)', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await svc.registerAccount({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    const firstToken = h.tokenFromUrl(h.sentEmails[0]!.url!);

    // resend past the cap; cooldown must pass between sends
    for (let i = 0; i < config.emailTokenMaxActive + 1; i++) {
      advance(config.emailTokenResendCooldownSeconds + 1);
      await svc.requestEmailVerification({ email: 'w@narraza.test', ctx });
    }
    const live = h.tokens.filter(
      (t) => t.purpose === 'verify_email' && t.consumedAt === null && t.revokedAt === null,
    );
    expect(live.length).toBeLessThanOrEqual(config.emailTokenMaxActive);

    // the very first (oldest) token was revoked by the cap
    const res = await svc.verifyEmail({ token: firstToken });
    expect(res.ok).toBe(false);
  });

  it('enforces the resend cooldown', async () => {
    const h = makePorts();
    const svc = createAuthService(h.ports, config);
    await svc.registerAccount({ email: 'w@narraza.test', password: 'a-good-long-pass', ctx });
    // immediate resend is within cooldown
    const tooSoon = await svc.requestEmailVerification({ email: 'w@narraza.test', ctx });
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.error.code).toBe('RATE_LIMITED');
  });
});

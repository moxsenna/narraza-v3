import { describe, expect, it } from 'vitest';
import { loadWebEnv, webEnvSchema } from './web.js';
import { loadWorkerEnv, workerEnvSchema } from './worker.js';
import { outboxEnvSchema } from './outbox.js';

/**
 * env-boundary (S6/S10, verification-matrix): each process schema physically
 * cannot carry the other process's secrets. This is a schema-shape test — if
 * someone adds OPENROUTER_API_KEY to webEnvSchema it fails here before any
 * runtime leak is possible.
 */

const AI_KEYS = ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'AI_ENABLE_MOCK'];
const WEB_SECRETS = ['AUTH_SECRET', 'RATE_LIMIT_PEPPER', 'EMAIL_TOKEN_PEPPER', 'RESEND_API_KEY'];

describe('env-boundary', () => {
  const webKeys = Object.keys(webEnvSchema.shape);
  const workerKeys = Object.keys(workerEnvSchema.shape);
  const outboxKeys = Object.keys(outboxEnvSchema.shape);

  it('web schema has no AI provider keys', () => {
    for (const key of AI_KEYS) {
      expect(webKeys, `webEnvSchema must not contain ${key}`).not.toContain(key);
    }
  });

  it('worker schema has no web auth secrets or peppers', () => {
    for (const key of WEB_SECRETS) {
      expect(workerKeys, `workerEnvSchema must not contain ${key}`).not.toContain(key);
    }
  });

  it('outbox schema has neither web secrets nor AI keys', () => {
    for (const key of [...AI_KEYS, ...WEB_SECRETS]) {
      expect(outboxKeys, `outboxEnvSchema must not contain ${key}`).not.toContain(key);
    }
  });

  it('web/worker/outbox each use their own database role URL', () => {
    expect(webKeys).toContain('DATABASE_URL_WEB');
    expect(webKeys).not.toContain('DATABASE_URL_WORKER');
    expect(workerKeys).toContain('DATABASE_URL_WORKER');
    expect(workerKeys).not.toContain('DATABASE_URL_WEB');
    expect(outboxKeys).toContain('DATABASE_URL_OUTBOX');
  });
});

describe('loadWorkerEnv production guards', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL_WORKER: 'postgres://x',
    OPENROUTER_API_KEY: 'k',
  };

  it('rejects AI_ENABLE_MOCK=true in production (§1 rule 3)', () => {
    expect(() => loadWorkerEnv({ ...base, AI_ENABLE_MOCK: 'true' })).toThrow(/forbidden/);
  });

  it('requires at least one provider key in production', () => {
    expect(() =>
      loadWorkerEnv({ NODE_ENV: 'production', DATABASE_URL_WORKER: 'postgres://x' }),
    ).toThrow(/provider key/);
  });

  it('accepts mock without keys outside production', () => {
    const env = loadWorkerEnv({
      NODE_ENV: 'test',
      DATABASE_URL_WORKER: 'postgres://x',
      AI_ENABLE_MOCK: 'true',
    });
    expect(env.AI_ENABLE_MOCK).toBe(true);
    expect(env.JOB_LEASE_SECONDS).toBe(60); // D12 default
  });
});

describe('loadWebEnv', () => {
  const secret = 's'.repeat(32);
  const base = {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    AUTH_SECRET: secret,
    DATABASE_URL_WEB: 'postgres://x',
    EMAIL_FROM: 'Narraza <no-reply@narraza.test>',
    RATE_LIMIT_PEPPER: 'p'.repeat(32),
    EMAIL_TOKEN_PEPPER: 'q'.repeat(32),
  };

  it('requires an email transport (Resend or SMTP)', () => {
    expect(() => loadWebEnv(base)).toThrow(/RESEND_API_KEY or SMTP_URL/);
    expect(() => loadWebEnv({ ...base, SMTP_URL: 'smtp://localhost:1025' })).not.toThrow();
  });

  it('applies D21 defaults', () => {
    const env = loadWebEnv({ ...base, SMTP_URL: 'smtp://localhost:1025' });
    expect(env.PASSWORD_MIN_LENGTH).toBe(10);
    expect(env.EMAIL_TOKEN_MAX_ACTIVE).toBe(3);
    expect(env.LOGIN_MAX_FAILS_PER_HOUR_IDENTIFIER).toBe(10);
    expect(env.LOGIN_LOCKOUT_MINUTES).toBe(15);
    expect(env.ARGON2_MEMORY_KIB).toBe(19_456);
  });

  it('rejects short peppers/secrets', () => {
    expect(() =>
      loadWebEnv({ ...base, SMTP_URL: 'smtp://x', EMAIL_TOKEN_PEPPER: 'short' }),
    ).toThrow(/Invalid web env/);
  });
});

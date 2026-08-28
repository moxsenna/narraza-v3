import { describe, expect, it } from 'vitest';
import { loadWebEnv, webEnvSchema } from './web.js';
import { loadWorkerEnv, workerEnvSchema } from './worker.js';
import { loadOutboxEnv, outboxEnvSchema } from './outbox.js';

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

  it('worker carries a distinct outbox role URL for the embedded consumer (D11/S6.3)', () => {
    // The consumer module lives inside worker-gen in Rilis 1, so the process
    // holds both URLs — but they are separate variables and the composition
    // hands the outbox module its own client.
    expect(workerKeys).toContain('DATABASE_URL_OUTBOX');
    expect(webKeys).not.toContain('DATABASE_URL_OUTBOX');
  });

  it('standalone outbox schema carries no provider keys and no job-loop knobs', () => {
    for (const key of outboxKeys) {
      expect(key.startsWith('JOB_'), `outboxEnvSchema must not contain ${key}`).toBe(false);
    }
    expect(outboxKeys).not.toContain('JOB_PROCESSOR_ENABLED');
    expect(outboxKeys.toSorted()).toEqual(
      [
        'DATABASE_URL_OUTBOX',
        'NODE_ENV',
        'OUTBOX_IDLE_BACKOFF_MS',
        'OUTBOX_LEASE_SECONDS',
        'OUTBOX_POLL_MS',
        'OUTBOX_SHUTDOWN_DRAIN_MS',
      ].toSorted(),
    );
  });
});

describe('outbox consumer env (D11/D12)', () => {
  const workerBase = {
    NODE_ENV: 'test',
    DATABASE_URL_WORKER: 'postgres://x',
    DATABASE_URL_OUTBOX: 'postgres://outbox',
  };

  it('worker requires the outbox role URL even when the processor is disabled', () => {
    expect(() => loadWorkerEnv({ NODE_ENV: 'test', DATABASE_URL_WORKER: 'postgres://x' })).toThrow(
      /DATABASE_URL_OUTBOX/,
    );
  });

  it('uses the frozen D12 outbox defaults in both schemas', () => {
    expect(loadWorkerEnv(workerBase)).toMatchObject({
      OUTBOX_POLL_MS: 1000,
      OUTBOX_IDLE_BACKOFF_MS: 5000,
      OUTBOX_LEASE_SECONDS: 60,
      OUTBOX_SHUTDOWN_DRAIN_MS: 30000,
    });
    expect(
      loadOutboxEnv({ NODE_ENV: 'test', DATABASE_URL_OUTBOX: 'postgres://outbox' }),
    ).toMatchObject({
      OUTBOX_POLL_MS: 1000,
      OUTBOX_IDLE_BACKOFF_MS: 5000,
      OUTBOX_LEASE_SECONDS: 60,
      OUTBOX_SHUTDOWN_DRAIN_MS: 30000,
    });
  });

  it('rejects an idle backoff below the poll interval', () => {
    expect(() =>
      loadWorkerEnv({ ...workerBase, OUTBOX_POLL_MS: '2000', OUTBOX_IDLE_BACKOFF_MS: '1999' }),
    ).toThrow(/idle backoff/i);
    expect(() =>
      loadOutboxEnv({
        NODE_ENV: 'test',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        OUTBOX_POLL_MS: '2000',
        OUTBOX_IDLE_BACKOFF_MS: '1999',
      }),
    ).toThrow(/idle backoff/i);
  });

  it('rejects a lease that cannot outlast one poll interval', () => {
    expect(() =>
      loadWorkerEnv({ ...workerBase, OUTBOX_POLL_MS: '1000', OUTBOX_LEASE_SECONDS: '1' }),
    ).toThrow(/lease/i);
    expect(() =>
      loadOutboxEnv({
        NODE_ENV: 'test',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        OUTBOX_POLL_MS: '1000',
        OUTBOX_LEASE_SECONDS: '1',
      }),
    ).toThrow(/lease/i);
  });
});

describe('loadWorkerEnv production guards', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL_WORKER: 'postgres://x',
    DATABASE_URL_OUTBOX: 'postgres://outbox',
    OPENROUTER_API_KEY: 'k',
  };

  it('rejects AI_ENABLE_MOCK=true in production (§1 rule 3)', () => {
    expect(() => loadWorkerEnv({ ...base, AI_ENABLE_MOCK: 'true' })).toThrow(/forbidden/);
  });

  it('requires at least one provider key when production processor is enabled', () => {
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'production',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        JOB_PROCESSOR_ENABLED: 'true',
      }),
    ).toThrow(/provider key/);
  });

  it('accepts mock without keys outside production', () => {
    const env = loadWorkerEnv({
      NODE_ENV: 'test',
      DATABASE_URL_WORKER: 'postgres://x',
      DATABASE_URL_OUTBOX: 'postgres://outbox',
      AI_ENABLE_MOCK: 'true',
    });
    expect(env.AI_ENABLE_MOCK).toBe(true);
    expect(env.JOB_LEASE_SECONDS).toBe(60); // D12 default
  });
});

describe('worker lifecycle env', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL_WORKER: 'postgres://x',
    DATABASE_URL_OUTBOX: 'postgres://outbox',
  };

  it('defaults processor disabled and allows disabled production without providers', () => {
    expect(loadWorkerEnv(base).JOB_PROCESSOR_ENABLED).toBe(false);
    expect(loadWorkerEnv({ ...base, JOB_PROCESSOR_ENABLED: 'false' }).JOB_PROCESSOR_ENABLED).toBe(
      false,
    );
  });

  it('requires a provider only when production processor is enabled', () => {
    expect(() => loadWorkerEnv({ ...base, JOB_PROCESSOR_ENABLED: 'true' })).toThrow(/provider key/);
    expect(
      loadWorkerEnv({ ...base, JOB_PROCESSOR_ENABLED: 'true', OPENROUTER_API_KEY: 'k' }),
    ).toBeDefined();
    expect(
      loadWorkerEnv({ ...base, JOB_PROCESSOR_ENABLED: 'true', GEMINI_API_KEY: 'k' }),
    ).toBeDefined();
  });

  it('keeps mock policy independent from processor gate', () => {
    expect(() => loadWorkerEnv({ ...base, AI_ENABLE_MOCK: 'true' })).toThrow(/forbidden/);
    expect(
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        AI_ENABLE_MOCK: 'true',
      }).AI_ENABLE_MOCK,
    ).toBe(true);
  });

  it.each([
    [undefined, false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', true],
  ])('strictly parses JOB_PROCESSOR_ENABLED=%s', (value, expected) => {
    expect(
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        ...(value === undefined ? {} : { JOB_PROCESSOR_ENABLED: value }),
      }).JOB_PROCESSOR_ENABLED,
    ).toBe(expected);
  });

  it.each(['yes', '', '2', 'TRUE', 'False'])('rejects JOB_PROCESSOR_ENABLED=%j', (value) => {
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        JOB_PROCESSOR_ENABLED: value,
      }),
    ).toThrow(/Invalid worker env/);
  });

  it('uses exact lifecycle defaults', () => {
    const env = loadWorkerEnv({
      NODE_ENV: 'test',
      DATABASE_URL_WORKER: 'postgres://x',
      DATABASE_URL_OUTBOX: 'postgres://outbox',
    });
    expect(env).toMatchObject({
      JOB_LEASE_SECONDS: 60,
      JOB_HEARTBEAT_SECONDS: 20,
      JOB_RECLAIM_SWEEP_SECONDS: 30,
      JOB_POLL_MS: 1000,
      JOB_ERROR_BACKOFF_MS: 5000,
      JOB_SHUTDOWN_DRAIN_MS: 30000,
    });
  });

  const numericFields = [
    'JOB_LEASE_SECONDS',
    'JOB_HEARTBEAT_SECONDS',
    'JOB_RECLAIM_SWEEP_SECONDS',
    'JOB_POLL_MS',
    'JOB_ERROR_BACKOFF_MS',
    'JOB_SHUTDOWN_DRAIN_MS',
  ] as const;
  it.each(numericFields)('%s accepts positive integers and rejects invalid values', (field) => {
    const validCompanions = {
      JOB_LEASE_SECONDS: '60',
      JOB_HEARTBEAT_SECONDS: '1',
      JOB_POLL_MS: '1',
      JOB_ERROR_BACKOFF_MS: '5000',
      JOB_SHUTDOWN_DRAIN_MS: '30000',
      [field]: field === 'JOB_SHUTDOWN_DRAIN_MS' ? '7000' : '7',
    };
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        ...validCompanions,
      }),
    ).not.toThrow();
    for (const value of ['0', '-1', '1.5', 'no', '']) {
      expect(() =>
        loadWorkerEnv({
          NODE_ENV: 'test',
          DATABASE_URL_WORKER: 'postgres://x',
          DATABASE_URL_OUTBOX: 'postgres://outbox',
          [field]: value,
        }),
      ).toThrow(/Invalid worker env/);
    }
  });

  it('enforces lifecycle timing invariants and permits non-strict equality', () => {
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        JOB_LEASE_SECONDS: '20',
        JOB_HEARTBEAT_SECONDS: '20',
      }),
    ).toThrow(/heartbeat/i);
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        JOB_POLL_MS: '1001',
        JOB_ERROR_BACKOFF_MS: '1000',
      }),
    ).toThrow(/backoff/i);
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        JOB_HEARTBEAT_SECONDS: '20',
        JOB_SHUTDOWN_DRAIN_MS: '19999',
      }),
    ).toThrow(/drain/i);
    expect(() =>
      loadWorkerEnv({
        NODE_ENV: 'test',
        DATABASE_URL_WORKER: 'postgres://x',
        DATABASE_URL_OUTBOX: 'postgres://outbox',
        JOB_POLL_MS: '1000',
        JOB_ERROR_BACKOFF_MS: '1000',
        JOB_SHUTDOWN_DRAIN_MS: '20000',
      }),
    ).not.toThrow();
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

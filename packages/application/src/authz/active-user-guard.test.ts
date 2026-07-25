import { describe, expect, it } from 'vitest';
import { authorizeActiveUser } from './authorize-active-user.js';

describe('active-user-guard', () => {
  it('rejects missing session', async () => {
    const r = await authorizeActiveUser(async () => null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('UNAUTHORIZED');
      expect(r.error.httpStatus).toBe(401);
    }
  });

  it('rejects non-active user', async () => {
    const r = await authorizeActiveUser(async () => ({
      id: 'u1',
      status: 'pending_verification',
      email: 'a@b.c',
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
  });

  it('accepts active user', async () => {
    const r = await authorizeActiveUser(async () => ({
      id: 'u1',
      status: 'active',
      email: 'a@b.c',
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ id: 'u1', status: 'active', email: 'a@b.c' });
  });
});

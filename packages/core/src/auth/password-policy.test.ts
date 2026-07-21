import { describe, expect, it } from 'vitest';
import { checkPassword, isPasswordAcceptable } from './password-policy.js';
import { normalizeEmail, isValidEmailShape, emailLocalPart } from './email.js';

const policy = { minLength: 10 };
const email = 'Writer@Narraza.test';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Writer@Narraza.TEST ')).toBe('writer@narraza.test');
  });
});

describe('isValidEmailShape', () => {
  it.each([
    ['a@b.co', true],
    ['writer@narraza.test', true],
    ['no-at-sign', false],
    ['two@@at.com', false],
    ['space in@email.com', false],
    ['nodot@domain', false],
    ['@nolocal.com', false],
  ])('%s → %s', (input, expected) => {
    expect(isValidEmailShape(input)).toBe(expected);
  });

  it('rejects over-long addresses', () => {
    expect(isValidEmailShape(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
});

describe('emailLocalPart', () => {
  it('extracts and normalizes the local part', () => {
    expect(emailLocalPart('Writer@Narraza.test')).toBe('writer');
  });
});

describe('checkPassword', () => {
  it('accepts a long, non-trivial password', () => {
    expect(checkPassword({ password: 'correct-horse-battery', email, policy })).toEqual([]);
    expect(isPasswordAcceptable({ password: 'correct-horse-battery', email, policy })).toBe(true);
  });

  it('rejects too-short passwords by code-point count', () => {
    expect(checkPassword({ password: 'short', email, policy })).toContain('too_short');
    // 9 emoji = 9 code points < 10, even though UTF-16 length is 18.
    expect(checkPassword({ password: '😀'.repeat(9), email, policy })).toContain('too_short');
    expect(checkPassword({ password: '😀'.repeat(10), email, policy })).not.toContain('too_short');
  });

  it('rejects passwords equal to the email or its local part (case-insensitive)', () => {
    expect(checkPassword({ password: 'writer@narraza.test', email, policy })).toContain(
      'same_as_email',
    );
    expect(checkPassword({ password: 'WRITER', email, policy })).toContain('same_as_email');
  });

  it('rejects common/breached passwords regardless of length', () => {
    expect(checkPassword({ password: 'password123', email, policy })).toContain('common_password');
    expect(checkPassword({ password: 'Password123', email, policy })).toContain('common_password');
  });

  it('enforces the max length', () => {
    expect(
      checkPassword({
        password: 'a'.repeat(201),
        email,
        policy: { minLength: 10, maxLength: 200 },
      }),
    ).toContain('too_long');
  });

  it('collects all violations at once', () => {
    const v = checkPassword({ password: 'writer', email, policy });
    expect(v).toContain('too_short');
    expect(v).toContain('same_as_email');
  });
});

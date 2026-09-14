import { describe, expect, test } from 'vitest';
import { DOMAIN_MESSAGES_ID, domainMessage } from './domain-id';

describe('domain message codes', () => {
  test('known codes resolve to human copy, never raw codes', () => {
    expect(domainMessage('msg.outline.foundation_not_locked')).toContain('Kunci fondasi');
    expect(domainMessage('msg.error.not_found')).not.toMatch(/^msg\./);
    for (const [code, copy] of Object.entries(DOMAIN_MESSAGES_ID)) {
      expect(code, 'catalog key').toMatch(/^msg\.[a-z0-9_.]+$/);
      expect(copy.length, code).toBeGreaterThan(5);
      expect(copy, code).not.toMatch(/^msg\./);
      expect(copy, code).not.toMatch(/[A-Z_]{4,}/);
    }
  });

  test('unknown codes fail closed to the generic message', () => {
    expect(domainMessage('msg.tidak.ada')).toBe('Terjadi kesalahan. Coba lagi.');
    expect(domainMessage('')).toBe('Terjadi kesalahan. Coba lagi.');
    expect(domainMessage('msg.auth.required')).toBe('Terjadi kesalahan. Coba lagi.');
  });
});

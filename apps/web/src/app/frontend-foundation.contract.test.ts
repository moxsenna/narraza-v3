import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');

export function source(relativePath: string): string {
  try {
    return readFileSync(resolve(srcRoot, relativePath), 'utf8');
  } catch {
    return '';
  }
}

describe('frontend foundation contracts', () => {
  test('deferred authoring routes do not exist in PR1', () => {
    expect(source('app/app/proyek/[projectId]/tulis/page.tsx')).toBe('');
    expect(source('app/app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx')).toBe('');
  });

  test('capability notice uses user-facing status copy', () => {
    const notice = source('components/composites/CapabilityNotice.tsx');
    expect(notice).toContain('Pratinjau fitur');
    expect(notice).toContain('Segera tersedia');
    expect(notice).not.toMatch(/>\{capability\.mode\}</);
  });

  test('existing auth behavior preserves action identifiers labels and current pending guard', () => {
    const files = [
      'LoginForm.tsx',
      'RegisterForm.tsx',
      'ForgotPasswordForm.tsx',
      'NewPasswordForm.tsx',
      'ConfirmVerificationForm.tsx',
      'ResendVerificationForm.tsx',
    ]
      .map((file) => source(`components/auth/${file}`))
      .join('\n');

    for (const label of [
      'Alamat email',
      'Kata sandi',
      'Ulangi kata sandi',
      'Buat akun',
      'Verifikasi & masuk',
      'Masuk',
      'Lupa kata sandi?',
      'Kata sandi baru',
      'Ulangi kata sandi baru',
      'Simpan kata sandi baru',
    ])
      expect(files).toContain(label);
    for (const action of [
      'loginAction',
      'registerAction',
      'requestPasswordResetAction',
      'completeResetAction',
      'completeVerificationAction',
      'resendVerificationAction',
    ])
      expect(files).toContain(action);
    expect(files).toContain('useActionState');
    const fields = source('components/auth/fields.tsx');
    expect(fields).toContain('useFormStatus');
    expect(fields).toContain('disabled={pending}');
  });

  test('resend verification prevents duplicate submit while pending', () => {
    const resend = source('components/auth/ResendVerificationForm.tsx');
    expect(resend).toContain("import { useFormStatus } from 'react-dom'");
    expect(resend).toContain('const { pending } = useFormStatus()');
    expect(resend).toContain('disabled={pending}');
    expect(resend).toContain("pending ? 'Mengirim…' : 'Kirim ulang'");
  });
});

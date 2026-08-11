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

  test('shell preserves guard logout typed IA and route-authoritative active state', () => {
    const layout = source('app/app/layout.tsx');
    expect(layout.match(/getCurrentUser\(\)/g)).toHaveLength(1);
    expect(layout).toContain("redirect('/masuk')");
    expect(layout).toContain('logoutAction');
    const nav = [
      source('components/composites/ProjectSidebar.tsx'),
      source('components/composites/ProjectNavigationDrawer.tsx'),
      source('components/composites/MobileBottomNav.tsx'),
      source('components/composites/MobileMoreSheet.tsx'),
    ].join('\n');
    expect(nav).toContain('CapabilityKey');
    expect(nav).toContain('CAPABILITIES');
    expect(nav).toContain('CAPABILITY_REASON_MESSAGES');
    expect(nav).toContain('CAPABILITY_REASON_MESSAGES[capability.reasonCode]');
    const active = source('components/composites/RouteAwareNavLink.tsx');
    expect(active).toContain("'use client'");
    expect(active).toContain('usePathname');
    expect(active).toContain("aria-current={active ? 'page' : undefined}");
    expect(active).not.toContain('useState');
  });

  test('project layout resolves identity owner scoped', () => {
    const layout = source('app/app/proyek/[projectId]/layout.tsx');
    expect(layout).toContain('getMyProject(projectId)');
    expect(layout).toContain('if (!project) notFound()');
  });

  test('tablet project navigation is a distinct accessible drawer', () => {
    const drawer = source('components/composites/ProjectNavigationDrawer.tsx');
    expect(drawer).toContain("'use client'");
    expect(drawer).toContain('md:block xl:hidden');
    expect(drawer).toContain('aria-haspopup="dialog"');
    expect(drawer).toContain('aria-expanded={open}');
    expect(drawer).toContain('<dialog');
    expect(drawer).toContain('backdrop:bg-brand-ink/40');
    expect(drawer).toContain('useNativeDialog');
    expect(drawer).toContain('<ProjectNavigation');
    expect(drawer).not.toContain('BottomSheet');
  });
});

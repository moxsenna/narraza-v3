import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');

export function source(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

function sourceExists(relativePath: string): boolean {
  return existsSync(resolve(srcRoot, relativePath));
}

describe('frontend foundation contracts', () => {
  test('required source inspection fails when target is missing', () => {
    expect(() => source('components/__missing-required-source__.tsx')).toThrow();
  });

  test('PR3 project writing and PR4 chapter workspace both exist as presentation-only disabled states', () => {
    // PR3 project-level writing entry still exists for backward compatibility
    expect(sourceExists('app/app/proyek/[projectId]/tulis/page.tsx')).toBe(true);
    // PR4 chapter workspace is now implemented as five presentation-only routes with honest unavailable states
    expect(sourceExists('app/app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx')).toBe(true);
    expect(sourceExists('app/app/proyek/[projectId]/bab/[chapterId]/cek/page.tsx')).toBe(true);
    expect(sourceExists('app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/page.tsx')).toBe(
      true,
    );
    expect(sourceExists('app/app/proyek/[projectId]/bab/[chapterId]/naskah/page.tsx')).toBe(true);
    expect(sourceExists('app/app/proyek/[projectId]/bab/[chapterId]/publish/page.tsx')).toBe(true);
    // Shared resolver provides security properties without exposing raw IDs
    expect(sourceExists('lib/server/capability-resolvers/chapter-context.ts')).toBe(true);
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

  test('server boundaries and authored files avoid restricted contracts', () => {
    for (const file of [
      'components/composites/GlobalAppShell.tsx',
      'components/composites/ProjectAppShell.tsx',
      'lib/frontend/capabilities.ts',
      'lib/frontend/view-state.ts',
      'lib/frontend/view-model.ts',
    ])
      expect(source(file)).not.toContain("'use client'");

    const files = [
      'components/primitives/Button.tsx',
      'components/primitives/Input.tsx',
      'components/composites/AppHeader.tsx',
      'components/composites/ProjectSidebar.tsx',
      'lib/frontend/view-model.ts',
    ]
      .map(source)
      .join('\n');
    expect(files).not.toMatch(/#[0-9a-f]{3,8}|\b(?:pink|gray|neutral|red)-\d+/i);
    expect(source('lib/frontend/view-model.ts')).not.toMatch(
      /token|password|rawPayload|serviceRestricted|securityDetails|internalRationale|actionsEnabled/,
    );
    expect(source('lib/frontend/capabilities.ts')).not.toMatch(
      /actionsEnabled|realData\s*\?\?|NEXT_PUBLIC/,
    );
  });

  test('logout remains direct form action', () => {
    const header = source('components/composites/AppHeader.tsx');
    expect(header).toContain('<form action={logoutAction}>');
    expect(header).toContain('Keluar');
    expect(header).not.toContain('ConfirmationDialog');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');
const source = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), 'utf8');

const chapterRoutes = ['tulis', 'cek', 'selesaikan', 'naskah', 'publish'] as const;

describe('Checkpoint C presentation contracts', () => {
  test('all chapter workspaces keep explicit owner-scoped chapter resolution', () => {
    for (const route of chapterRoutes) {
      const page = source(`app/app/proyek/[projectId]/bab/[chapterId]/${route}/page.tsx`);
      expect(page).toMatch(/resolveChapter(Context|Proposals)\(projectId, chapterId\)/);
      expect(page).toContain('notFound()');
      expect(page).not.toMatch(/\[[0]\]|\.at\(0\)|fixture|localStorage/);
    }
  });

  test('workspaces expose real UI anatomy with honest unavailable states', () => {
    const write = source('app/app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx');
    const check = source('app/app/proyek/[projectId]/bab/[chapterId]/cek/page.tsx');
    const complete = source('app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/page.tsx');
    const completeCards = source(
      'app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/proposal-cards.tsx',
    );
    const manuscript = source('app/app/proyek/[projectId]/bab/[chapterId]/naskah/page.tsx');
    const publish = source('app/app/proyek/[projectId]/bab/[chapterId]/publish/page.tsx');

    expect(write).toContain('Buat adegan');
    expect(write).toContain('Naskah Bab');
    expect(write).toContain('Penulisan dari halaman ini belum tersedia');
    expect(check).toContain('Temuan Cek Cerita');
    expect(check).toContain('Perbaiki dengan aman');
    expect(complete).toContain('Tutup Bab');
    expect(complete).toContain('proposal-list');
    expect(completeCards).toContain('Terapkan &amp; jadikan resmi');
    expect(completeCards).toContain('jadikan resmi');
    expect(manuscript).toContain('Versi tulisan resmi');
    for (const copy of [
      'Judul & teaser',
      'Caption & ajakan komentar',
      'Pratinjau ponsel',
      'Salin atau ekspor',
    ]) {
      expect(publish).toContain(copy);
    }

    for (const page of [write, check, complete, manuscript, publish]) {
      expect(page).not.toMatch(/onClick=|action=|formAction=|setTimeout|fetch\(/);
    }
    // selesaikan/page.tsx renders no controls itself (decision forms live in
    // proposal-cards.tsx behind availableActions); the rest keep native
    // disabled controls while their flows are unavailable.
    for (const page of [write, check, publish]) expect(page).toContain('disabled');
  });

  test('concept, credit, settings, and import surfaces stay honest', () => {
    const concept = source('app/app/proyek/[projectId]/konsep/page.tsx');
    const credit = source('app/app/kredit/page.tsx');
    const settings = source('app/app/pengaturan/page.tsx');
    const importPage = source('app/app/proyek/impor/page.tsx');

    expect(concept).toContain("CAPABILITIES['project.concept.choose']");
    expect(concept).toContain('Tiga arah cerita');
    expect(concept).toContain('disabled');
    // Credit renders the real M3 summary (single D6 conversion); values are
    // bare numbers from the ledger, never "N kredit" fabrications.
    expect(credit).toContain('getMyCreditSummaryView');
    expect(credit).toContain('credit-summary');
    for (const copy of ['Kredit tersedia', 'Kredit ditahan', 'Sedang dicocokkan']) {
      expect(credit).toContain(copy);
    }
    expect(credit).not.toMatch(/\b\d+\s+kredit\b/i);
    expect(settings).toContain("CAPABILITIES['app.settings.view']");
    expect(settings).toContain('Pemula');
    expect(settings).toContain('Mahir');
    expect(importPage).toContain("CAPABILITIES['app.project.import']");
    expect(importPage).not.toMatch(/type=["']file|upload|action=|onClick=/i);
  });

  test('project writing entry remains deterministic and never fabricates a chapter target', () => {
    const resolver = source('lib/server/capability-resolvers/project-context.ts');
    const page = source('app/app/proyek/[projectId]/tulis/page.tsx');

    expect(resolver).toContain("kind: 'choose'");
    expect(resolver).toContain("kind: 'blocked'");
    expect(resolver).toContain("kind: 'not_found'");
    expect(resolver).not.toMatch(/\[[0]\]|\.at\(0\)|fixture|localStorage/);
    expect(page).not.toMatch(/choices\[[0]\]|chapterId=/);
  });

  test('project manuscript and publish routes are owner scoped and presentation-only', () => {
    const manuscript = source('app/app/proyek/[projectId]/naskah/page.tsx');
    const publish = source('app/app/proyek/[projectId]/publish/page.tsx');

    for (const page of [manuscript, publish]) {
      expect(page).toContain('getMyProject(projectId)');
      expect(page).toContain('if (!project) notFound()');
      expect(page).not.toMatch(
        /fixture|localStorage|setTimeout|fetch\(|action=|formAction=|onClick=/,
      );
    }
    expect(manuscript).toContain("CAPABILITIES['project.manuscript.view']");
    expect(manuscript).toContain('Belum ada naskah proyek yang dapat ditampilkan');
    expect(publish).toContain("CAPABILITIES['project.publish.view']");
    expect(publish).toContain('Belum ada artifact publish');
    expect(publish).toContain('disabled');
  });

  test('mobile bottom navigation uses coherent icons and prototype active treatment', () => {
    const bottomNav = source('components/composites/MobileBottomNav.tsx');
    const moreControl = source('components/composites/MobileMoreControl.tsx');
    const icons = source('components/composites/MobileNavIcon.tsx');

    for (const icon of ['home', 'plan', 'write', 'check'])
      expect(bottomNav).toContain(`icon: '${icon}'`);
    expect(bottomNav).toContain('<MobileNavIcon name={item.icon} />');
    expect(bottomNav).toContain('group-aria-[current=page]:bg-brand-100');
    expect(bottomNav).toContain('aria-disabled="true"');
    expect(bottomNav).toContain('<span className="sr-only">{reason}</span>');
    expect(moreControl).toContain('<MobileNavIcon name="more" />');
    expect(moreControl).toContain('group-aria-[expanded=true]:bg-brand-100');
    expect(icons).toContain('aria-hidden="true"');
    expect(icons).toContain('stroke="currentColor"');
    expect(icons).not.toMatch(/[●▤✎✓≡]/);
  });

  test('canonical project navigation links presentation routes but keeps chapter check disabled', () => {
    const sidebar = source('components/composites/ProjectSidebar.tsx');
    const bottomNav = source('components/composites/MobileBottomNav.tsx');
    const moreSheet = source('components/composites/MobileMoreSheet.tsx');

    expect(sidebar).toContain('const base = `/app/proyek/${encodeURIComponent(projectId)}`');
    for (const suffix of ['/tulis', '/naskah', '/publish'])
      expect(sidebar).toContain(`\`${'${base}'}${suffix}\``);
    expect(bottomNav).toContain('...(base ? { href: `${base}/tulis` } : {})');
    expect(bottomNav).toContain(
      "{ label: 'Cek', icon: 'check', capabilityKey: 'chapter.check.run' }",
    );
    // Naskah/publish stay presentation-only (no href); credit is real (href).
    expect(moreSheet).toContain("{ label: 'Naskah', capabilityKey: 'project.manuscript.view' }");
    expect(moreSheet).toContain(
      "{ label: 'Paket Publish', capabilityKey: 'project.publish.view' }",
    );
    expect(moreSheet).toContain("href: '/app/kredit'");
  });
});

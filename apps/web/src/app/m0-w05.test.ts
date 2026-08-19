import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');

function source(relativePath: string): string {
  try {
    return readFileSync(resolve(srcRoot, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function between(sourceText: string, start: string, end: string): string {
  const from = sourceText.indexOf(start);
  const to = sourceText.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return sourceText.slice(from, to);
}

function expectCardArray(block: string, labels: readonly string[]) {
  expect(block.match(/\{\s*title:/g)).toHaveLength(labels.length);
  for (const label of labels) expect(block).toContain(`title: '${label}'`);
}

describe('M0 W0.5 public shell', () => {
  test('landing exposes exact prototype hero, CTA routes, workflow, and legal links', () => {
    const page = source('app/page.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${page}\n${catalog}`;

    expect(combined).toContain('Untuk penulis serial Indonesia');
    expect(combined).toContain('Tulis serial panjang tanpa kehilangan arah.');
    expect(combined).toContain(
      'Ceritakan idemu ke Narra. Narraza membantu menyusun fondasi, merencanakan bab, menjaga rahasia, dan memoles tulisanmu untuk pembaca mobile.',
    );
    expect(page).toContain('href="/daftar"');
    expect(page).toContain('href="#cara-kerja"');
    expect(page).toContain('id="cara-kerja"');
    expect(page).toContain('href="/privasi"');
    expect(page).toContain('href="/ketentuan"');

    for (const step of ['Ngobrol', 'Fondasi', 'Rencana', 'Tulis', 'Cek', 'Publish']) {
      expect(combined).toContain(step);
    }

    expect(combined).not.toContain('Masuk tanpa kata sandi');
  });

  test('landing preserves exact reference composition in canonical sections', () => {
    const page = source('app/page.tsx');
    const catalog = source('messages/app-id.ts');
    const header = source('components/composites/PublicHeader.tsx');
    const mobileMenu = source('components/composites/PublicMobileMenu.tsx');
    const ids = ['masalah', 'cara-kerja', 'fitur', 'untuk-siapa', 'kredit', 'cta-final'];

    for (const id of ids) expect(page).toContain(`id="${id}"`);
    for (let index = 1; index < ids.length; index += 1) {
      expect(page.indexOf(`id="${ids[index - 1]}"`)).toBeLessThan(
        page.indexOf(`id="${ids[index]}"`),
      );
    }
    expect(page.indexOf('id="cta-final"')).toBeLessThan(page.indexOf('<footer'));

    for (const [label, href] of [
      ['Cara kerja', '#cara-kerja'],
      ['Fitur', '#fitur'],
      ['Untuk siapa', '#untuk-siapa'],
      ['Kredit', '#kredit'],
    ] as const) {
      expect(header).toContain(`['${label}', '${href}']`);
    }
    expect(header).toContain('<PublicMobileMenu links={links} />');
    expect(mobileMenu).toContain('links.map(([label, href])');
    expect(mobileMenu).toContain('href={href}');
    expect(mobileMenu).toMatch(/\{label\}\s*<\/a>/);

    const problems = between(catalog, 'problemCards: [', 'featureCards: [');
    const features = between(catalog, 'featureCards: [', 'personaCards: [');
    const personas = between(catalog, 'personaCards: [', 'creditTierCards: [');
    const credits = between(catalog, 'creditTierCards: [', 'trust:');
    expectCardArray(problems, [
      '“Ideku berantakan.”',
      '“AI selalu lupa cerita sebelumnya.”',
      '“Rahasia Bab 25 bocor di Bab 3.”',
    ]);
    expectCardArray(features, [
      'Fondasi Cerita',
      'Fakta yang Dikunci',
      'Jadwal Rahasia',
      'Ruang Tulis',
      'Cek Otomatis',
      'Paket Publish',
    ]);
    expectCardArray(personas, [
      'Belum pernah menulis',
      'Punya ide kasar',
      'Punya outline',
      'Penulis berpengalaman',
    ]);
    expectCardArray(credits, ['Hemat', 'Seimbang', 'Terbaik']);
    expect(credits).toContain("badge: 'Disarankan'");
    expect(credits).toContain('emphasized: true');
    expect(catalog).toContain(
      "creditDisclosure: 'Detail kredit akan tersedia saat fitur ini diluncurkan.'",
    );

    const workflowCatalog = between(catalog, 'workflow: {', 'finalCta: {');
    expect(workflowCatalog.match(/number: '[1-6]'/g)).toHaveLength(6);
    for (const title of ['Ngobrol', 'Fondasi', 'Rencana', 'Tulis', 'Cek', 'Publish']) {
      expect(workflowCatalog).toContain(`title: '${title}'`);
    }

    const problemSection = between(page, 'id="masalah"', 'id="cara-kerja"');
    const workflowSection = between(page, 'id="cara-kerja"', 'id="fitur"');
    const featureSection = between(page, 'id="fitur"', 'id="untuk-siapa"');
    const personaSection = between(page, 'id="untuk-siapa"', 'id="kredit"');
    const creditSection = between(page, 'id="kredit"', 'id="cta-final"');
    expect(problemSection).toContain('copy.problemCards.map');
    expect(workflowSection).toContain('copy.workflow.steps.map');
    expect(featureSection).toContain('copy.featureCards.map');
    expect(personaSection).toContain('copy.personaCards.map');
    expect(creditSection).toContain('copy.creditTierCards.map');
    for (const [section, identifier] of [
      [problemSection, 'copy.problemCards.map'],
      [workflowSection, 'copy.workflow.steps.map'],
      [featureSection, 'copy.featureCards.map'],
      [personaSection, 'copy.personaCards.map'],
      [creditSection, 'copy.creditTierCards.map'],
    ] as const) {
      expect(section.match(new RegExp(identifier.replaceAll('.', '\\.'), 'g'))).toHaveLength(1);
    }

    // Scope forbidden marketing promises to landing catalog. Dashboard copy is outside Task 5.
    const landingCatalog = between(catalog, 'landing: {', 'shell: {');
    const landingSource = `${page}\n${landingCatalog}`;
    expect(page).not.toContain('/app/proyek/impor');
    expect(landingSource).not.toMatch(
      /Sudah punya draft|Bawa draftmu|Narraza membacanya|impor(?:t)?\s+(?:draft|naskah)|(?:kredit|biaya)[^.\n]*(?:dikembalikan|kembali|refund)|(?:dikembalikan|refund)[^.\n]*(?:kredit|biaya)/i,
    );
    expect(landingSource).not.toContain('PR1 tidak menampilkan angka kredit');
  });

  test('public mobile menu exposes dialog semantics and accessible close behavior', () => {
    const menu = source('components/composites/PublicMobileMenu.tsx');

    expect(menu).toContain("'use client'");
    expect(menu).toContain('aria-haspopup="dialog"');
    expect(menu).toContain('aria-expanded={open}');
    expect(menu).toContain('<dialog');
    expect(menu).toContain('aria-label="Navigasi utama mobile"');
    expect(menu).toContain('aria-label="Tutup menu"');
    expect(menu).toMatch(/event\.key\s*===\s*'Escape'/);
    expect(menu).toContain('previouslyFocused.current?.focus()');
  });

  test('authenticated layout guards once and renders exact canonical navigation', () => {
    const layout = source('app/app/layout.tsx');
    const nav = [
      source('components/composites/ProjectSidebar.tsx'),
      source('components/composites/ProjectNavigationDrawer.tsx'),
      source('components/composites/MobileBottomNav.tsx'),
      source('components/composites/MobileMoreSheet.tsx'),
    ].join('\n');

    expect(layout.match(/getCurrentUser\(\)/g)).toHaveLength(1);
    expect(layout).toContain("redirect('/masuk')");
    expect(`${layout}\n${source('components/composites/AppHeader.tsx')}`).toContain(
      'action={logoutAction}',
    );
    expect(nav).toContain('aria-disabled="true"');
    expect(nav).not.toMatch(/<a[^>]+aria-disabled="true"/);
    expect(nav).toContain('CAPABILITY_REASON_MESSAGES[capability.reasonCode]');
    expect(nav).toMatch(/aria-disabled="true"[\s\S]{0,500}\{reason\}/);
    expect(`${layout}\n${source('messages/app-id.ts')}`).toContain('Kredit — segera hadir');

    const groups = ['PERSIAPAN', 'PERENCANAAN', 'PENULISAN', 'PEMERIKSAAN', 'PUBLIKASI', 'LAINNYA'];
    const items = [
      'Beranda',
      'Chat Narra',
      'Fondasi',
      'Karakter',
      'Rencana Cerita',
      'Jadwal Rahasia',
      'Fakta',
      'Naskah',
      'Tulis',
      'Cek Cerita',
      'Paket Publish',
      'Kredit & Penggunaan',
      'Pengaturan',
    ];

    for (const label of [...groups, ...items]) expect(nav).toContain(label);
    expect(nav).not.toContain('Tutup Bab');
  });

  test('dashboard is functional in M2 (list + create entry, no createProject in page)', () => {
    const page = source('app/app/page.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${page}\n${catalog}`;

    // M2: dashboard lists projects and links to create; shell still has disabled nav.
    expect(page).toContain('listMyProjects');
    expect(page).toContain('href="/app/proyek/baru"');
    expect(page).toContain('Buat proyek');
    // Page must stay a thin RSC adapter — no direct use-case import.
    expect(page).not.toContain('createProject');
    // Catalog still holds empty-state copy for later polish.
    expect(combined).toContain('Cerita pertamamu belum dimulai');
  });

  test('legal, not-found, and error pages are branded and safe', () => {
    const privacy = source('app/privasi/page.tsx');
    const terms = source('app/ketentuan/page.tsx');
    const notFound = source('app/not-found.tsx');
    const error = source('app/error.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${privacy}\n${terms}\n${notFound}\n${error}\n${catalog}`;

    expect(privacy).toContain('APP_MESSAGES_ID.legal.status');
    expect(terms).toContain('APP_MESSAGES_ID.legal.status');
    expect(catalog).toContain('Draf sementara');
    expect(notFound).toContain('<BrandMark');
    expect(combined).toContain('Narraza');
    expect(error).toContain("'use client'");
    expect(error).toContain('reset()');
    expect(error).not.toMatch(/error\.(message|stack|digest)/);
    expect(combined).toContain('Kembali');
  });
});

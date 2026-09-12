import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');
const source = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), 'utf8');

describe('Checkpoint B project route contracts', () => {
  test('Chat Narra keeps owner-scoped reads and real message persistence', () => {
    const page = source('app/app/proyek/[projectId]/chat/page.tsx');
    const form = source('app/app/proyek/[projectId]/chat/chat-form.tsx');

    expect(page).toContain('getMyProject(projectId)');
    expect(page).toContain('if (!project) notFound()');
    expect(page).toContain('getProjectIntakeMessages(projectId)');
    expect(page).toContain('getProjectIntakeSignalCount(projectId)');
    expect(page).not.toContain("messages.filter((message) => message.role === 'user').length");
    expect(form).toContain('appendIntakeMessageAction');
    expect(form).toContain('name="content"');
  });

  test('Chat Narra exposes honest unavailable AI state without fake async controls', () => {
    const files = [
      source('app/app/proyek/[projectId]/chat/page.tsx'),
      source('app/app/proyek/[projectId]/chat/chat-form.tsx'),
    ].join('\n');

    expect(files).toContain('Balasan Narra belum tersedia');
    expect(files).not.toContain('project.chat.ai-reply');
    expect(files).not.toMatch(/Narra mengetik|Kirim ulang|Coba lagi|typing/i);
  });

  test('Chat Narra provides responsive signal panel sheet and draft-only quick replies', () => {
    const page = source('app/app/proyek/[projectId]/chat/page.tsx');
    const form = source('app/app/proyek/[projectId]/chat/chat-form.tsx');
    const signals = source('app/app/proyek/[projectId]/chat/story-signals.tsx');

    expect(page).toContain('w-[300px]');
    expect(page).toContain('h-[calc(100dvh-204px)]');
    expect(page).toContain('lg:h-[calc(100dvh-136px)]');
    expect(page).toMatch(/hidden[^"\n]*lg:block/);
    expect(form).toContain('Sinyal {signalCount}/6');
    expect(form).toContain('<QuickReplies');
    expect(form).toContain('onSelect={setDraft}');
    expect(form).not.toContain('formRef.current?.requestSubmit()');
    expect(signals).toContain('<BottomSheet');
    expect(signals).toContain('Sinyal cerita');
  });

  test('real project routes remain owner scoped and avoid internal identifiers in rendered fallback copy', () => {
    for (const route of [
      'page.tsx',
      'fondasi/page.tsx',
      'outline/page.tsx',
      'karakter/page.tsx',
      'fakta/page.tsx',
      'rahasia/page.tsx',
    ]) {
      const page = source(`app/app/proyek/[projectId]/${route}`);
      expect(page).toContain('getMyProject(projectId)');
      expect(page).toContain('if (!project) notFound()');
      expect(page).not.toMatch(/\|\|\s*[a-zA-Z]?\.id|\|\|\s*[a-zA-Z]?\.factKey/);
    }
  });

  test('outline options keep IDs out of user-visible fallback labels', () => {
    const form = source('app/app/proyek/[projectId]/outline/outline-form.tsx');

    expect(form).not.toContain('{r.title || r.id}');
    expect(form).not.toContain('{a.title || a.id}');
    expect(form).toContain('r.title || `Roadmap Cerita ${index + 1}`');
    expect(form).toContain('a.title || `Bagian Cerita ${index + 1}`');
    expect(form).toContain('<option key={r.id} value={r.id}>');
    expect(form).toContain('<option key={a.id} value={a.id}>');
  });

  test('project home and planning routes use parity headings and real-data visual sections', () => {
    const home = source('app/app/proyek/[projectId]/page.tsx');
    const foundation = source('app/app/proyek/[projectId]/fondasi/page.tsx');
    const outline = source('app/app/proyek/[projectId]/outline/page.tsx');
    const characters = source('app/app/proyek/[projectId]/karakter/page.tsx');
    const facts = source('app/app/proyek/[projectId]/fakta/page.tsx');
    const secrets = source('app/app/proyek/[projectId]/rahasia/page.tsx');

    expect(home).toContain('Lanjutkan ceritamu');
    expect(home).toContain('Ringkasan proyek');
    expect(foundation).toContain('Kesiapan fondasi');
    expect(foundation).toContain('Dasar cerita');
    expect(outline).toContain('Rencana Bab');
    expect(outline).toContain('Struktur cerita');
    expect(characters).toContain('Tokoh dalam ceritamu');
    expect(facts).toContain('Fakta yang sudah tercatat');
    expect(secrets).toContain('Catatan pribadimu');
  });

  test('Foundation form preserves complete existing projection through its current write door', () => {
    const page = source('app/app/proyek/[projectId]/fondasi/page.tsx');
    const form = source('app/app/proyek/[projectId]/fondasi/foundation-forms.tsx');
    const action = source('server/domain/actions.ts');

    expect(page).toContain('mainCharacterId={mainId}');
    expect(form).toContain('name="relationshipOtherId"');
    expect(form).toContain('name="secretTargetChapterId"');
    expect(form).toContain('name="secretBreadcrumb2ChapterId"');
    expect(action).toContain('relationships,');
    expect(action).toContain('secrets,');
  });
});

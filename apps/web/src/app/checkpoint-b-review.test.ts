import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');
const source = (path: string) => readFileSync(resolve(srcRoot, path), 'utf8');

describe('Checkpoint B review fixes', () => {
  test('foundation lock uses real form semantics and acknowledgement-controlled submit', () => {
    const form = source('app/app/proyek/[projectId]/fondasi/foundation-forms.tsx');
    expect(form).toContain('const [lockAcknowledged, setLockAcknowledged] = useState(false)');
    expect(form).toMatch(/<form[^>]*action=\{lockAction\}/s);
    expect(form).toContain('name="projectId" value={props.projectId}');
    expect(form).toContain('name="acknowledged"');
    expect(form).toContain('checked={lockAcknowledged}');
    expect(form).toContain('onChange={(event) => setLockAcknowledged(event.target.checked)}');
    expect(form).toContain('disabled={lockPending || !lockAcknowledged}');
    expect(form).not.toContain('formAction={lockAction}');
  });

  test('facts route renders safe view model instead of raw factKey', () => {
    const page = source('app/app/proyek/[projectId]/fakta/page.tsx');
    const viewModel = source('lib/frontend/fact-view-model.ts');
    expect(page).toContain('toFactListItemViewModel');
    expect(page).not.toMatch(/\{\s*fact\.factKey\s*\}/);
    expect(viewModel).toContain('label: `Fakta cerita ${position + 1}`');
  });

  test('outline maps every entity type to natural Indonesian without direct rendering', () => {
    const page = source('app/app/proyek/[projectId]/outline/page.tsx');
    const viewModel = source('lib/frontend/outline-view-model.ts');
    for (const label of ['Roadmap Cerita', 'Bagian Cerita', 'Bab', 'Adegan']) {
      expect(viewModel).toContain(label);
    }
    expect(viewModel).toContain('assertNever');
    expect(page).not.toMatch(/\{\s*n\.entityType\s*\}/);
    expect(page).not.toContain('prose diterima');
  });

  test('Checkpoint B planning forms use approved user-facing vocabulary', () => {
    const outlineForm = source('app/app/proyek/[projectId]/outline/outline-form.tsx');
    const outlinePage = source('app/app/proyek/[projectId]/outline/page.tsx');
    const projectHome = source('app/app/proyek/[projectId]/page.tsx');
    const foundationForm = source('app/app/proyek/[projectId]/fondasi/foundation-forms.tsx');

    for (const approvedCopy of [
      'Judul Roadmap Cerita',
      'Tambah Roadmap Cerita',
      'Judul Bagian Cerita',
      'Tambah Bagian Cerita',
      'Urutan',
      'Jadwal Rahasia',
    ]) {
      expect([outlineForm, outlinePage, projectHome, foundationForm].join('\n')).toContain(
        approvedCopy,
      );
    }

    for (const rawCopy of [
      'Judul roadmap',
      'Tambah roadmap',
      'Buat roadmap dulu',
      'Judul arc',
      'Tambah arc',
      'Buat arc dulu',
      '>Arc<',
      '>Ordinal<',
    ]) {
      expect(outlineForm).not.toContain(rawCopy);
    }
    expect(outlineForm).toContain('name="ordinal"');
    expect(outlinePage).not.toContain('Tambahkan roadmap');
    expect(projectHome).not.toContain('Susun roadmap, arc');
    expect(projectHome).not.toContain('alur besar, arc');
    expect(foundationForm).not.toContain('JADWAL REVEAL');
  });

  test('Chat desktop signal column starts at lg and sheet ends before 1024', () => {
    const page = source('app/app/proyek/[projectId]/chat/page.tsx');
    const signals = source('app/app/proyek/[projectId]/chat/story-signals.tsx');
    expect(page).toMatch(/hidden[^"\n]*lg:block/);
    expect(page).not.toMatch(/hidden[^"\n]*xl:block/);
    expect(signals).toContain('lg:hidden');
    expect(signals).not.toContain('xl:hidden');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');

test('native hook controls close without close-event recursion', () => {
  const hook = read('use-native-dialog.ts');
  expect(hook).toContain('openRef.current');
  expect(hook).toContain('previouslyFocused.current?.focus()');
  expect(hook).toContain('event.preventDefault()');
  expect(hook).toContain('.showModal()');
  expect(hook).toContain('.close()');
});

test('dialog composites have names and close controls', () => {
  for (const file of ['ConfirmationDialog.tsx', 'BottomSheet.tsx']) {
    const text = read(file);
    expect(text).toContain('<dialog');
    expect(text).toContain('aria-labelledby');
    expect(text).toContain('aria-describedby');
    expect(text).toContain('aria-label="Tutup"');
  }
});

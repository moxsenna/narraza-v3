import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');

describe('PR1 primitive contracts', () => {
  test('primitives stay server-safe and semantic', () => {
    for (const file of [
      'Button.tsx',
      'IconButton.tsx',
      'LinkButton.tsx',
      'Input.tsx',
      'Field.tsx',
      'Badge.tsx',
      'Chip.tsx',
      'Card.tsx',
      'Surface.tsx',
      'Stack.tsx',
      'Cluster.tsx',
      'Container.tsx',
      'VisuallyHidden.tsx',
      'Divider.tsx',
      'Textarea.tsx',
      'Skeleton.tsx',
      'Banner.tsx',
      'Toast.tsx',
      'ProgressChecklist.tsx',
      'Stepper.tsx',
      'EmptyState.tsx',
    ]) {
      const text = read(file);
      expect(text).not.toContain("'use client'");
      expect(text).not.toMatch(/@narraza\/(application|core|db)|server\//);
      expect(text).not.toMatch(/#[0-9a-f]{3,8}|\b(?:pink|gray|neutral|red)-\d+/i);
    }
  });

  test('Badge is status and Chip is action', () => {
    expect(read('Badge.tsx')).not.toContain('<button');
    expect(read('Chip.tsx')).toContain('<button');
    expect(read('IconButton.tsx')).toContain("'aria-label': string");
  });
});

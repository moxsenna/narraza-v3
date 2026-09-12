import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');

const SERVER_SAFE = ['Tabs.tsx', 'ProposalCard.tsx', 'FindingCard.tsx', 'ChatBubble.tsx'];

describe('W6.1 composite contracts', () => {
  test('composites stay semantic and never reach into domain internals', () => {
    for (const file of [...SERVER_SAFE, 'QuickReplies.tsx']) {
      const text = read(file);
      expect(text).not.toMatch(/@narraza\/(application|core|db)|server\//);
      expect(text).not.toMatch(/#[0-9a-f]{3,8}|\b(?:pink|gray|neutral|red)-\d+/i);
    }
  });

  test('only QuickReplies is client (it forwards user taps to the chat form)', () => {
    for (const file of SERVER_SAFE) {
      expect(read(file)).not.toContain("'use client'");
    }
    expect(read('QuickReplies.tsx')).toContain("'use client'");
  });

  test('Tabs is keyboard-safe route navigation (native links + aria-current)', () => {
    const text = read('Tabs.tsx');
    expect(text).toContain('<nav');
    expect(text).toContain('aria-current');
    expect(text).not.toContain('role="tab"');
  });

  test('ProposalCard labels AI origin and offers the accept/edit/reject slot', () => {
    const text = read('ProposalCard.tsx');
    expect(text).toContain('Usulan Narra');
    expect(text).toContain('actions');
  });

  test('FindingCard hides technical detail behind an explicit disclosure', () => {
    const text = read('FindingCard.tsx');
    expect(text).toContain('Lihat alasan');
    expect(text).toContain('<details');
  });

  test('QuickReplies caps options at five with 44px targets', () => {
    const text = read('QuickReplies.tsx');
    expect(text).toContain('slice(0, 5)');
  });
});

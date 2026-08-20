import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { TOKEN_CATEGORIES } from './token-inventory';

const globals = readFileSync(resolve(import.meta.dirname, '../../app/globals.css'), 'utf8');

describe('frontend token inventory', () => {
  test('locks implemented categories without runtime values', () => {
    expect(TOKEN_CATEGORIES.map((item) => item.category)).toEqual([
      'color-foundation',
      'color-semantic',
      'typography',
      'spacing',
      'container',
      'radius',
      'elevation',
      'motion',
      'breakpoint',
      'z-index',
      'focus',
      'disabled',
    ]);
    expect(JSON.stringify(TOKEN_CATEGORIES)).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|\d+px/i);
  });

  test('keeps literal foundations in theme and variable aliases in inline theme', () => {
    const literalTheme = globals.slice(
      globals.indexOf('@theme {'),
      globals.indexOf('@theme inline'),
    );
    const inlineTheme = globals.slice(globals.indexOf('@theme inline'), globals.indexOf(':root'));

    expect(globals).toContain('@theme inline {');
    for (const token of [
      '--color-brand-50:#fff5f8',
      '--spacing-1:4px',
      '--radius-sm:8px',
      '--shadow-sm:0 1px 2px rgba(36,23,30,.06)',
      '--breakpoint-sm:40rem',
    ])
      expect(literalTheme).toContain(token);
    for (const alias of [
      '--font-sans: var(--font-plus-jakarta-sans)',
      '--font-serif: var(--font-lora)',
      '--color-brand-soft:var(--color-brand-50)',
      '--color-text-primary:var(--color-ink-950)',
      '--color-action-primary:var(--color-brand-600)',
      '--color-status-success:var(--color-success-700)',
    ])
      expect(inlineTheme).toContain(alias);
    expect(literalTheme).not.toMatch(
      /--(?:font-(?:sans|serif)|color-(?:brand-(?:soft|strong|ink)|text-(?:primary|secondary|muted)|border-(?:default|active)|action-primary(?:-hover|-active)?|status-(?:success|warning|danger|info)(?:-soft)?))\s*:\s*var\(/,
    );
  });
});

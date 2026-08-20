import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { TOKEN_CATEGORIES } from './token-inventory';

const globals = readFileSync(resolve(import.meta.dirname, '../../app/globals.css'), 'utf8');

/**
 * Normalize CSS whitespace for robust comparisons.
 * Removes all unnecessary whitespace while preserving semantic token/value bindings.
 * This allows tests to pass regardless of CSS formatting style (compact or formatted).
 */
function normalizeCssWhitespace(css: string): string {
  // Store rgba/rgb/hsl values temporarily to normalize their internal spacing consistently
  const valuePlaceholders = new Map<string, string>();
  let placeholderIndex = 0;

  // Normalize rgba() values - remove spaces after commas inside the function
  const normalized = css
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n') // Handle Mac-style line breaks
    .replace(/\n/g, '') // Remove all newlines (compact format)
    .replace(/rgba\s*\(\s*([^)]+)\s*\)/gi, (_, args) => {
      // Normalize rgba arguments: remove all spaces, then compact comma-separated values
      const normalizedArgs = args.replace(/\s+/g, '').split(',').join(',');
      const key = `__RGBA_${placeholderIndex++}__`;
      valuePlaceholders.set(key, `rgba(${normalizedArgs})`);
      return key;
    })
    .replace(/rgb\s*\(\s*([^)]+)\s*\)/gi, (_, args) => {
      const normalizedArgs = args.replace(/\s+/g, '').split(',').join(',');
      const key = `__RGB_${placeholderIndex++}__`;
      valuePlaceholders.set(key, `rgb(${normalizedArgs})`);
      return key;
    })
    .replace(/hsla\s*\(\s*([^)]+)\s*\)/gi, (_, args) => {
      const normalizedArgs = args.replace(/\s+/g, '').split(',').join(',');
      const key = `__HSLA_${placeholderIndex++}__`;
      valuePlaceholders.set(key, `hsla(${normalizedArgs})`);
      return key;
    })
    .replace(/hsl\s*\(\s*([^)]+)\s*\)/gi, (_, args) => {
      const normalizedArgs = args.replace(/\s+/g, '').split(',').join(',');
      const key = `__HSL_${placeholderIndex++}__`;
      valuePlaceholders.set(key, `hsl(${normalizedArgs})`);
      return key;
    });

  // Now normalize spaces around CSS-specific characters
  const result = normalized
    .replace(/\s+:/, ':') // Remove spaces before colons
    .replace(/:\s+/g, ':') // Remove spaces after colons
    .replace(/\s+;/g, ';') // Remove spaces before semicolons
    .replace(/;\s+/g, ';') // Remove spaces after semicolons
    .trim();

  // Restore rgba/rgb/hsl values with normalized spacing
  let final = result;
  for (const [key, value] of valuePlaceholders.entries()) {
    final = final.replace(key, value);
  }

  return final;
}

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
    const literalThemeStart = globals.indexOf('@theme {');
    const literalThemeEnd = globals.indexOf('@theme inline');
    const inlineThemeStart = globals.indexOf('@theme inline');
    const rootStart = globals.indexOf(':root');

    // Normalize whitespace from extracted CSS sections
    const normalizedLiteralTheme = normalizeCssWhitespace(
      globals.slice(literalThemeStart, literalThemeEnd),
    );
    const normalizedInlineTheme = normalizeCssWhitespace(
      globals.slice(inlineThemeStart, rootStart),
    );

    expect(globals).toContain('@theme inline {');

    // Expected tokens in compact format (without spaces)
    const expectedTokens = [
      '--color-brand-50:#fff5f8',
      '--spacing-1:4px',
      '--radius-sm:8px',
      '--shadow-sm:0 1px 2px rgba(36,23,30,0.06)',
      '--breakpoint-sm:40rem',
    ];

    for (const token of expectedTokens) {
      expect(normalizedLiteralTheme).toContain(token);
    }

    // Expected aliases (some have spaces in values)
    const expectedAliases = [
      '--font-sans:var(--font-plus-jakarta-sans)',
      '--font-serif:var(--font-lora)',
      '--color-brand-soft:var(--color-brand-50)',
      '--color-text-primary:var(--color-ink-950)',
      '--color-action-primary:var(--color-brand-600)',
      '--color-status-success:var(--color-success-700)',
    ];

    for (const alias of expectedAliases) {
      expect(normalizedInlineTheme).toContain(alias);
    }

    // Verify no unwanted variables are aliased (strict validation)
    expect(normalizedLiteralTheme).not.toMatch(
      /--(?:font-(?:sans|serif)|color-(?:brand-(?:soft|strong|ink)|text-(?:primary|secondary|muted)|border-(?:default|active)|action-primary(?:-hover|-active)?|status-(?:success|warning|danger|info)(?:-soft)?))\s*:\s*var\(/,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { isCiEnvironment } from './ci.js';

describe('isCiEnvironment', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['FALSE', false],
    ['1', false],
    ['true', true],
  ])('parses CI=%s as %s', (value, expected) => {
    expect(isCiEnvironment(value)).toBe(expected);
  });
});

import { createHash } from 'node:crypto';
import { denseArray, exactObject, type Fail } from '../validation/exact.js';

export class CanonicalJsonError extends Error {
  readonly code = 'INVALID_CANONICAL_VALUE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

const fail: Fail = (message) => {
  throw new CanonicalJsonError(message);
};

const isWellFormed = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export function canonicalJson(value: unknown): string {
  const active = new Set<object>();

  const serialize = (item: unknown): string => {
    if (item === null) return 'null';
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'string') {
      return isWellFormed(item) ? JSON.stringify(item) : fail('string contains a lone surrogate');
    }
    if (typeof item === 'number') {
      return Number.isSafeInteger(item)
        ? JSON.stringify(item)
        : fail('number must be a safe integer');
    }
    if (typeof item !== 'object') return fail('unsupported canonical value');
    if (active.has(item)) return fail('canonical value must not be cyclic');

    active.add(item);
    try {
      if (Array.isArray(item)) {
        const values = denseArray(item, fail, 'canonical array');
        return `[${values.map(serialize).join(',')}]`;
      }

      const keys = Reflect.ownKeys(item).map((key) =>
        typeof key === 'string' ? key : fail('canonical object must not contain symbol keys'),
      );
      const record = exactObject(item, keys, fail, 'canonical object');
      const entries = keys
        .sort(compareCodeUnits)
        .map((key) => `${serialize(key)}:${serialize(record[key])}`);
      return `{${entries.join(',')}}`;
    } catch (error) {
      if (error instanceof CanonicalJsonError) throw error;
      return fail('canonical reflection failed');
    } finally {
      active.delete(item);
    }
  };

  return serialize(value);
}

export function sha256Hex(value: unknown): string {
  if (typeof value !== 'string') return fail('hash input must be a string');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export const canonicalSha256 = (value: unknown): string => sha256Hex(canonicalJson(value));

import { describe, expect, it } from 'vitest';
import { canonicalJson, CanonicalJsonError, canonicalSha256, sha256Hex } from './canonical-json.js';

const expectCanonicalError = (action: () => unknown) => {
  expect(action).toThrow(CanonicalJsonError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({
      name: 'CanonicalJsonError',
      code: 'INVALID_CANONICAL_VALUE',
    });
  }
};

const ownDataProperty = (
  target: object,
  key: PropertyKey,
  value: unknown,
  enumerable = true,
): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable,
    configurable: true,
    writable: true,
  });
};

describe('canonical JSON', () => {
  it.each([
    [null, 'null'],
    [true, 'true'],
    [false, 'false'],
    [0, '0'],
    [-0, '0'],
    [Number.MAX_SAFE_INTEGER, '9007199254740991'],
    ['Narra\n𐐷', '"Narra\\n𐐷"'],
    [[], '[]'],
  ])('serializes accepted scalar or empty value %#', (value, expected) => {
    expect(canonicalJson(value)).toBe(expected);
  });

  it('sorts object keys by UTF-16 code unit while preserving array order', () => {
    const input = {
      '𐐷': 'astral',
      z: 1,
      a: [3, 2, 1],
      '\ue000': 'bmp',
      nested: { beta: false, alpha: null },
    };

    expect(canonicalJson(input)).toBe(
      '{"a":[3,2,1],"nested":{"alpha":null,"beta":false},"z":1,"𐐷":"astral","":"bmp"}',
    );
  });

  it('is stable under object-key permutation', () => {
    const first = { z: 3, a: { y: 2, x: 1 }, list: [{ b: 2, a: 1 }] };
    const second = { list: [{ a: 1, b: 2 }], a: { x: 1, y: 2 }, z: 3 };

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalSha256(first)).toBe(canonicalSha256(second));
  });

  it('preserves repeated non-cyclic references', () => {
    const shared = { value: 7 };

    expect(canonicalJson([shared, shared])).toBe('[{"value":7},{"value":7}]');
  });

  it('preserves an own enumerable __proto__ data property', () => {
    const withProtoKey: Record<string, unknown> = {};
    ownDataProperty(withProtoKey, '__proto__', { safe: true });

    expect(canonicalJson(withProtoKey)).toBe('{"__proto__":{"safe":true}}');
    expect(canonicalJson(withProtoKey)).not.toBe(canonicalJson({}));
    expect(canonicalSha256(withProtoKey)).not.toBe(canonicalSha256({}));
  });

  it.each([
    undefined,
    1n,
    Symbol('value'),
    () => undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects unsupported primitive or number %#', (value) => {
    expectCanonicalError(() => canonicalJson(value));
  });

  it.each(['\ud800', '\udfff', 'before\ud800after', '\ud800\ud800', '\udc00\udfff'])(
    'rejects lone UTF-16 surrogates %#',
    (value) => {
      expectCanonicalError(() => canonicalJson(value));
    },
  );

  it.each([new Date(0), new (class Example {})(), Object.create(null)])(
    'rejects non-plain object %#',
    (value) => {
      expectCanonicalError(() => canonicalJson(value));
    },
  );

  it('rejects cyclic objects and arrays but reports domain errors', () => {
    const object: Record<string, unknown> = {};
    object.self = object;
    const array: unknown[] = [];
    array.push(array);

    expectCanonicalError(() => canonicalJson(object));
    expectCanonicalError(() => canonicalJson(array));
  });

  it('rejects symbol, non-enumerable, and accessor object properties without invoking getters', () => {
    const symbolObject: Record<PropertyKey, unknown> = { valid: true };
    symbolObject[Symbol('extra')] = true;
    const hiddenObject = { valid: true };
    ownDataProperty(hiddenObject, 'hidden', 1, false);
    let getterReads = 0;
    const accessorObject = Object.defineProperty({}, 'value', {
      get: () => {
        getterReads += 1;
        return 1;
      },
      enumerable: true,
    });

    for (const value of [symbolObject, hiddenObject, accessorObject]) {
      expectCanonicalError(() => canonicalJson(value));
    }
    expect(getterReads).toBe(0);
  });

  it('rejects sparse arrays and arrays with extra, symbol, non-enumerable, or accessor properties', () => {
    const extra = [1] as unknown[] & { extra?: number };
    extra.extra = 2;
    const symbol = [1] as unknown[] & Record<PropertyKey, unknown>;
    symbol[Symbol('extra')] = 2;
    const nonEnumerable = [1];
    Object.defineProperty(nonEnumerable, '0', { value: 1, enumerable: false });
    let getterReads = 0;
    const accessor = [1];
    Object.defineProperty(accessor, '0', {
      get: () => {
        getterReads += 1;
        return 1;
      },
      enumerable: true,
    });

    for (const value of [Array(1), extra, symbol, nonEnumerable, accessor]) {
      expectCanonicalError(() => canonicalJson(value));
    }
    expect(getterReads).toBe(0);
  });

  const blocked = (): never => {
    throw new Error('blocked');
  };

  it.each([
    new Proxy({}, { getPrototypeOf: blocked }),
    new Proxy({}, { ownKeys: blocked }),
    new Proxy({ value: 1 }, { getOwnPropertyDescriptor: blocked }),
    new Proxy([1], { ownKeys: blocked }),
  ])('converts proxy reflection failure into CanonicalJsonError %#', (value) => {
    expectCanonicalError(() => canonicalJson(value));
  });
});

describe('SHA-256', () => {
  it('matches known lowercase hexadecimal fixtures', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(canonicalSha256({})).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
  });

  it.each([null, false, 0, [], {}, new String('abc')])(
    'accepts raw string hash input only %#',
    (value) => {
      expectCanonicalError(() => sha256Hex(value));
    },
  );
});

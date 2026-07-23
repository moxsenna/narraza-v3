export type Fail = (message: string) => never;
export type ExactRecord = Readonly<Record<string, unknown>>;

function guarded<T>(operation: () => T, fail: Fail, message: string): T {
  try {
    return operation();
  } catch {
    return fail(message);
  }
}

export function exactObject(
  input: unknown,
  expectedKeys: readonly string[],
  fail: Fail,
  label: string,
): ExactRecord {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail(`${label} must be an exact plain object`);
  }
  if (
    guarded(() => Object.getPrototypeOf(input), fail, `${label} reflection failed`) !==
    Object.prototype
  ) {
    return fail(`${label} must have Object.prototype`);
  }
  const keys = guarded(() => Reflect.ownKeys(input), fail, `${label} reflection failed`);
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        !expectedKeys.includes(key) ||
        expectedKeys.filter((candidate) => candidate === key).length !== 1,
    )
  ) {
    return fail(`${label} must contain exactly ${expectedKeys.join(', ')}`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = guarded(
      () => Object.getOwnPropertyDescriptor(input, key),
      fail,
      `${label}.${key} reflection failed`,
    );
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${label}.${key} must be an enumerable data property`);
    }
    output[key] = descriptor.value;
  }
  return output;
}

export function denseArray(input: unknown, fail: Fail, label: string): readonly unknown[] {
  if (!Array.isArray(input)) return fail(`${label} must be a dense array`);
  if (
    guarded(() => Object.getPrototypeOf(input), fail, `${label} reflection failed`) !==
    Array.prototype
  ) {
    return fail(`${label} must have Array.prototype`);
  }
  const keys = guarded(() => Reflect.ownKeys(input), fail, `${label} reflection failed`);
  const keySet = new Set<PropertyKey>(keys);
  const lengthDescriptor = guarded(
    () => Object.getOwnPropertyDescriptor(input, 'length'),
    fail,
    `${label}.length reflection failed`,
  );
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable ||
    !('value' in lengthDescriptor)
  ) {
    return fail(`${label} must have only dense indices and built-in length`);
  }
  const length = lengthDescriptor.value;
  if (
    typeof length !== 'number' ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 0xffff_ffff ||
    keys.length !== length + 1
  ) {
    return fail(`${label} must have only dense indices and built-in length`);
  }
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!keySet.has(key)) return fail(`${label} must not be sparse`);
    const descriptor = guarded(
      () => Object.getOwnPropertyDescriptor(input, key),
      fail,
      `${label}[${index}] reflection failed`,
    );
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${label}[${index}] must be an enumerable data property`);
    }
    values.push(descriptor.value);
  }
  if (
    keys.some(
      (key) =>
        key !== 'length' &&
        (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length),
    )
  ) {
    return fail(`${label} contains an extra property`);
  }
  return values;
}

export const nonEmptyString = (value: unknown, fail: Fail, label: string): string =>
  typeof value === 'string' && value.length > 0
    ? value
    : fail(`${label} must be a non-empty string`);

export const nullableString = (value: unknown, fail: Fail, label: string): string | null =>
  value === null || typeof value === 'string' ? value : fail(`${label} must be string or null`);

export const booleanValue = (value: unknown, fail: Fail, label: string): boolean =>
  typeof value === 'boolean' ? value : fail(`${label} must be boolean`);

export const nonNegativeSafeInteger = (value: unknown, fail: Fail, label: string): number =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : fail(`${label} must be a non-negative safe integer`);

export function optionalDataValue(record: ExactRecord, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

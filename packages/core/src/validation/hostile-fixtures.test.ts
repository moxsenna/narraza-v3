export function hostileObjects(valid: Record<string, unknown>): readonly unknown[] {
  const symbol = { ...valid } as Record<PropertyKey, unknown>;
  symbol[Symbol('extra')] = true;
  const nonEnumerable = Object.defineProperty({ ...valid }, 'hidden', { value: true });
  let reads = 0;
  const accessor = Object.defineProperty({ ...valid }, Object.keys(valid)[0]!, {
    get: () => {
      reads += 1;
      return null;
    },
    enumerable: true,
  });
  return [
    null,
    7,
    'x',
    true,
    { ...valid, extra: true },
    symbol,
    nonEnumerable,
    accessor,
    { accessorReads: () => reads },
  ];
}

export function hostileArrays(valid: readonly unknown[]): readonly unknown[] {
  const extra = [...valid] as unknown[] & { extra?: true };
  extra.extra = true;
  const symbol = [...valid] as unknown[] & Record<PropertyKey, unknown>;
  symbol[Symbol('x')] = true;
  const nonEnumerable = Object.defineProperty([...valid], '0', {
    value: valid[0],
    enumerable: false,
  });
  const accessor = Object.defineProperty([...valid], '0', {
    get: () => valid[0],
    enumerable: true,
  });
  return [null, 'array', Array(1), extra, symbol, nonEnumerable, accessor];
}

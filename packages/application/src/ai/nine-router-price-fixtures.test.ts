import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import {
  NINE_ROUTER_INPUT_RATE_MICRO_IDR,
  NINE_ROUTER_OUTPUT_RATE_MICRO_IDR,
  NINE_ROUTER_PRICE_SNAPSHOT_FIXTURE,
  NINE_ROUTER_PRICE_SNAPSHOT_ID,
  NINE_ROUTER_PROVIDER_ID,
  NINE_ROUTER_WRITER_MODEL_ID,
  seedNineRouterPriceSnapshots,
} from './nine-router-price-fixtures.js';

function stubUoW(seedIfAbsent: (input: unknown) => Promise<{ kind: 'seeded' | 'replayed' }>) {
  const ports = { modelPrice: { seedIfAbsent } };
  const uow: UnitOfWork = {
    execute: async (work) => work(ports as never),
  };
  return uow;
}

describe('nine-router price snapshot', () => {
  it('pins owner-supplied rates with explicit provenance', () => {
    expect(NINE_ROUTER_PROVIDER_ID).toBe('nine-router');
    expect(NINE_ROUTER_WRITER_MODEL_ID).toBe('gweb/gemini-3.8-flash');
    // USD 0.75 / 0.75→3.75 per 1M tokens at Rp17.700, exact integers.
    expect(NINE_ROUTER_INPUT_RATE_MICRO_IDR).toBe(13_275n);
    expect(NINE_ROUTER_OUTPUT_RATE_MICRO_IDR).toBe(66_375n);
    expect(NINE_ROUTER_PRICE_SNAPSHOT_FIXTURE.currency).toBe('IDR');
    expect(NINE_ROUTER_PRICE_SNAPSHOT_FIXTURE.id).toBe(NINE_ROUTER_PRICE_SNAPSHOT_ID);
  });

  it('seeds through the authoritative port and reports replay', async () => {
    const seedIfAbsent = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'seeded' })
      .mockResolvedValueOnce({ kind: 'replayed' });
    const uow = stubUoW(seedIfAbsent);
    await expect(seedNineRouterPriceSnapshots(uow)).resolves.toEqual({ kind: 'seeded' });
    await expect(seedNineRouterPriceSnapshots(uow)).resolves.toEqual({ kind: 'replayed' });
    expect(seedIfAbsent).toHaveBeenCalledTimes(2);
    expect(seedIfAbsent.mock.calls[0]?.[0]).toMatchObject({
      providerId: 'nine-router',
      requestedModelId: 'gweb/gemini-3.8-flash',
    });
  });

  it('fails closed without a modelPrice port', async () => {
    const uow: UnitOfWork = {
      execute: async (work) => work({} as never),
    };
    await expect(seedNineRouterPriceSnapshots(uow)).rejects.toThrow(/modelPrice port/);
  });
});

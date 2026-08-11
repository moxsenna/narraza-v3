import { expect, test } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  CAPABILITY_REASON_MESSAGES,
  deriveEffectiveCapability,
} from './capabilities';

test('locks complete typed canonical action keys and reason catalog', () => {
  expect(Object.keys(CAPABILITIES)).toEqual(CAPABILITY_KEYS);
  expect(CAPABILITY_KEYS).toHaveLength(32);
  expect(Object.keys(CAPABILITY_REASON_MESSAGES)).toHaveLength(16);
});

test('keeps protected declarations separate from server-derived effective state', () => {
  const declaration = CAPABILITIES['project.foundation.manage'];
  expect(declaration.actionPolicy).toBe('SERVER_DERIVED');
  expect(declaration.primaryAction).not.toHaveProperty('enabled');
  expect(
    deriveEffectiveCapability(declaration, {
      allowed: false,
      reasonCode: 'FOUNDATION_NOT_LOCKED',
    }).primaryAction.enabled,
  ).toBe(false);
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.chat.ai-reply'], {
      allowed: true,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Only REAL capability can derive an enabled primary action');
  expect(() =>
    deriveEffectiveCapability(declaration, {
      allowed: false,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Disabled primary action requires an unavailable reason');
});

test('rejects every contradictory effective decision', () => {
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.concept.choose'], {
      allowed: true,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Only REAL capability can derive an enabled primary action');
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.chat.ai-reply'], {
      allowed: true,
      reasonCode: 'BACKEND_NOT_AVAILABLE',
    }),
  ).toThrow('Only REAL capability can derive an enabled primary action');
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.foundation.manage'], {
      allowed: true,
      reasonCode: 'FOUNDATION_NOT_LOCKED',
    }),
  ).toThrow('Enabled primary action requires AVAILABLE reason');
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['landing.view'], {
      allowed: true,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Only SERVER_DERIVED capability accepts a server decision');
});

test('enables only explicit available decisions for real server-derived actions', () => {
  expect(
    deriveEffectiveCapability(CAPABILITIES['project.foundation.manage'], {
      allowed: true,
      reasonCode: 'AVAILABLE',
    }),
  ).toEqual({
    key: 'project.foundation.manage',
    mode: 'REAL',
    reasonCode: 'AVAILABLE',
    primaryAction: { label: 'Simpan fondasi', enabled: true },
  });
});

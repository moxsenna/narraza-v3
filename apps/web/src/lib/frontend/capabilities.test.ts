import { expect, test } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  CAPABILITY_REASON_MESSAGES,
  deriveEffectiveCapability,
} from './capabilities';
import type { CapabilityDeclaration } from './capabilities';

const keysWithPolicy = (actionPolicy: CapabilityDeclaration['actionPolicy']) =>
  CAPABILITY_KEYS.filter((key) => CAPABILITIES[key].actionPolicy === actionPolicy);

test('locks complete typed canonical action keys and reason catalog', () => {
  expect(Object.keys(CAPABILITIES)).toEqual(CAPABILITY_KEYS);
  expect(CAPABILITY_KEYS).toHaveLength(32);
  expect(Object.keys(CAPABILITY_REASON_MESSAGES)).toHaveLength(16);
});

test('locks exact approved action policy sets', () => {
  expect(keysWithPolicy('STATIC_AVAILABLE')).toEqual([
    'landing.view',
    'auth.login',
    'auth.register',
    'auth.password-reset',
    'auth.verification',
    'legal.privacy',
    'legal.terms',
    'app.credit.view',
  ]);
  expect(keysWithPolicy('SERVER_DERIVED')).toEqual([
    'app.dashboard.view',
    'app.project.create',
    'project.home.view',
    'project.chat.user-message',
    'project.foundation.manage',
    'project.characters.read',
    'project.outline.create',
    'project.secrets.read',
    'project.facts.read',
    'chapter.write.compose',
    'shell.logout',
    'shell.project-navigation',
    'shell.mobile-more',
  ]);
  expect(keysWithPolicy('UNAVAILABLE')).toEqual([
    'app.project.import',
    'app.settings.view',
    'project.chat.ai-reply',
    'project.concept.choose',
    'project.write.resume',
    'project.manuscript.view',
    'project.publish.view',
    'chapter.check.run',
    'chapter.complete.run',
    'chapter.manuscript.view',
    'chapter.publish.build',
  ]);
});

test('keeps declaration policy and mode invariants across the complete registry', () => {
  for (const declaration of Object.values(CAPABILITIES)) {
    expect(declaration.primaryAction).not.toHaveProperty('enabled');

    if (declaration.actionPolicy === 'STATIC_AVAILABLE') {
      expect(declaration.mode).toBe('REAL');
      expect(declaration.reasonCode).toBe('AVAILABLE');
    }
    if (declaration.mode === 'PRESENTATION' || declaration.mode === 'DISABLED') {
      expect(declaration.actionPolicy).toBe('UNAVAILABLE');
    }
  }
});

test('keeps every sensitive real declaration server-derived', () => {
  const sensitiveRealKeys = CAPABILITY_KEYS.filter(
    (key) =>
      CAPABILITIES[key].mode === 'REAL' && CAPABILITIES[key].actionPolicy === 'SERVER_DERIVED',
  );

  expect(sensitiveRealKeys).toEqual([
    'app.dashboard.view',
    'app.project.create',
    'project.home.view',
    'project.chat.user-message',
    'project.foundation.manage',
    'project.characters.read',
    'project.outline.create',
    'project.secrets.read',
    'project.facts.read',
    'chapter.write.compose',
    'shell.logout',
    'shell.project-navigation',
    'shell.mobile-more',
  ]);
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
    deriveEffectiveCapability(declaration, {
      allowed: false,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Disabled primary action requires an unavailable reason');
});

test('rejects server decisions for every declaration-only unavailable capability', () => {
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.concept.choose'], {
      allowed: false,
      reasonCode: 'BACKEND_NOT_AVAILABLE',
    }),
  ).toThrow('Only SERVER_DERIVED capability accepts a server decision');
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.chat.ai-reply'], {
      allowed: false,
      reasonCode: 'BACKEND_NOT_AVAILABLE',
    }),
  ).toThrow('Only SERVER_DERIVED capability accepts a server decision');
});

test('rejects every contradictory effective decision after the policy boundary', () => {
  const craftedPresentation = {
    ...CAPABILITIES['project.concept.choose'],
    actionPolicy: 'SERVER_DERIVED',
  } satisfies CapabilityDeclaration;
  const craftedDisabled = {
    ...CAPABILITIES['project.chat.ai-reply'],
    actionPolicy: 'SERVER_DERIVED',
  } satisfies CapabilityDeclaration;

  expect(() =>
    deriveEffectiveCapability(craftedPresentation, {
      allowed: true,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Only REAL capability can derive an enabled primary action');
  expect(() =>
    deriveEffectiveCapability(craftedDisabled, {
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
    deriveEffectiveCapability(CAPABILITIES['project.foundation.manage'], {
      allowed: false,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Disabled primary action requires an unavailable reason');
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

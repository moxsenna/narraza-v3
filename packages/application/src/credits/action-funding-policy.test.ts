import { describe, expect, it } from 'vitest';
import {
  FROZEN_D4_FREE_KINDS,
  FROZEN_D4_PAID_KINDS,
  FROZEN_PRE_D4_LEGACY_KINDS,
  resolveFundingModel,
  validateFundingModelEnqueue,
} from './action-funding-policy.js';

describe('action-funding-policy', () => {
  describe('resolveFundingModel', () => {
    it('maps all frozen D4 paid kinds to user_paid', () => {
      for (const kind of FROZEN_D4_PAID_KINDS) {
        expect(resolveFundingModel(kind)).toBe('user_paid');
      }
    });

    it('maps specific known D4 paid kinds individually', () => {
      expect(resolveFundingModel('concept_generation')).toBe('user_paid');
      expect(resolveFundingModel('create_concepts')).toBe('user_paid');
      expect(resolveFundingModel('foundation_generation')).toBe('user_paid');
      expect(resolveFundingModel('character_generation')).toBe('user_paid');
      expect(resolveFundingModel('outline_generation')).toBe('user_paid');
      expect(resolveFundingModel('scene_generation')).toBe('user_paid');
      expect(resolveFundingModel('beat_write_judge')).toBe('user_paid');
      expect(resolveFundingModel('safe_repair')).toBe('user_paid');
      expect(resolveFundingModel('publish_package')).toBe('user_paid');
    });

    it('maps all frozen D4 free kinds to system_funded', () => {
      for (const kind of FROZEN_D4_FREE_KINDS) {
        expect(resolveFundingModel(kind)).toBe('system_funded');
      }
    });

    it('maps specific known D4 free kinds individually', () => {
      expect(resolveFundingModel('chat_intake')).toBe('system_funded');
      expect(resolveFundingModel('chat_intake_reply')).toBe('system_funded');
      expect(resolveFundingModel('intake_reply')).toBe('system_funded');
      expect(resolveFundingModel('deterministic_validator')).toBe('system_funded');
      expect(resolveFundingModel('autosave')).toBe('system_funded');
      expect(resolveFundingModel('navigation')).toBe('system_funded');
    });

    it('maps all frozen pre-D4 legacy base kinds to pre_d4_legacy', () => {
      for (const kind of FROZEN_PRE_D4_LEGACY_KINDS) {
        expect(resolveFundingModel(kind)).toBe('pre_d4_legacy');
      }
    });

    it('maps specific known base kinds (prose, draft_generation, source-kind) to pre_d4_legacy', () => {
      expect(resolveFundingModel('prose')).toBe('pre_d4_legacy');
      expect(resolveFundingModel('draft_generation')).toBe('pre_d4_legacy');
      expect(resolveFundingModel('source-kind')).toBe('pre_d4_legacy');
    });

    it('fails closed and throws on unmapped new kind introduced post-freeze', () => {
      expect(() => resolveFundingModel('unmapped_future_kind')).toThrowError(
        /Unknown job kind 'unmapped_future_kind'/
      );
      expect(() => resolveFundingModel('random_ai_action')).toThrowError(
        /Unknown job kind 'random_ai_action'/
      );
      expect(() => resolveFundingModel('')).toThrowError();
    });

    it('enforces disjoint frozen kind sets', () => {
      const paidSet = new Set<string>(FROZEN_D4_PAID_KINDS);
      const freeSet = new Set<string>(FROZEN_D4_FREE_KINDS);
      const legacySet = new Set<string>(FROZEN_PRE_D4_LEGACY_KINDS);

      for (const k of paidSet) {
        expect(freeSet.has(k)).toBe(false);
        expect(legacySet.has(k)).toBe(false);
      }
      for (const k of freeSet) {
        expect(paidSet.has(k)).toBe(false);
        expect(legacySet.has(k)).toBe(false);
      }
      for (const k of legacySet) {
        expect(paidSet.has(k)).toBe(false);
        expect(freeSet.has(k)).toBe(false);
      }
    });
  });

  describe('validateFundingModelEnqueue', () => {
    it('allows pre_d4_legacy kinds with or without reservationId', () => {
      expect(
        validateFundingModelEnqueue({ kind: 'prose', reservationId: null })
      ).toEqual({ valid: true, fundingModel: 'pre_d4_legacy' });

      expect(
        validateFundingModelEnqueue({ kind: 'prose', reservationId: 'res-123' })
      ).toEqual({ valid: true, fundingModel: 'pre_d4_legacy' });

      expect(
        validateFundingModelEnqueue({ kind: 'draft_generation', reservationId: null })
      ).toEqual({ valid: true, fundingModel: 'pre_d4_legacy' });
    });

    it('requires non-null reservationId for user_paid kinds', () => {
      expect(
        validateFundingModelEnqueue({ kind: 'scene_generation', reservationId: null })
      ).toEqual({
        valid: false,
        reason: 'missing_reservation_for_paid',
        fundingModel: 'user_paid',
      });

      expect(
        validateFundingModelEnqueue({ kind: 'scene_generation', reservationId: '' })
      ).toEqual({
        valid: false,
        reason: 'missing_reservation_for_paid',
        fundingModel: 'user_paid',
      });

      expect(
        validateFundingModelEnqueue({ kind: 'scene_generation', reservationId: 'res-abc' })
      ).toEqual({
        valid: true,
        fundingModel: 'user_paid',
      });
    });

    it('requires non-null reservationId (upstream created) for system_funded kinds', () => {
      expect(
        validateFundingModelEnqueue({ kind: 'chat_intake_reply', reservationId: null })
      ).toEqual({
        valid: false,
        reason: 'missing_reservation_for_system_funded',
        fundingModel: 'system_funded',
      });

      expect(
        validateFundingModelEnqueue({ kind: 'chat_intake_reply', reservationId: '' })
      ).toEqual({
        valid: false,
        reason: 'missing_reservation_for_system_funded',
        fundingModel: 'system_funded',
      });

      expect(
        validateFundingModelEnqueue({
          kind: 'chat_intake_reply',
          reservationId: 'res-system-budget-1',
        })
      ).toEqual({
        valid: true,
        fundingModel: 'system_funded',
      });
    });

    it('rejects unknown kinds on enqueue validation', () => {
      expect(
        validateFundingModelEnqueue({ kind: 'unknown_kind', reservationId: 'res-1' })
      ).toEqual({
        valid: false,
        reason: 'unknown_kind',
      });
    });
  });
});

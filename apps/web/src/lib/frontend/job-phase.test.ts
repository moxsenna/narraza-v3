import { describe, expect, test } from 'vitest';
import {
  JOB_PHASE_LABELS,
  isNonterminalPhase,
  jobOutcomeMessage,
  type JobPublicView,
} from './job-phase';

function view(overrides: Partial<JobPublicView> = {}): JobPublicView {
  return {
    phase: 'queued',
    cancelRequested: false,
    zeroCharge: false,
    chargedCredits: null,
    recovered: false,
    ...overrides,
  };
}

describe('public job phase vocabulary (S9.4)', () => {
  test('labels every public phase without percentages', () => {
    expect(Object.keys(JOB_PHASE_LABELS).sort()).toEqual(
      ['cancelled', 'dead', 'failed', 'queued', 'running', 'succeeded'].sort(),
    );
    for (const label of Object.values(JOB_PHASE_LABELS)) {
      expect(label).not.toMatch(/%|persen|\d+%/);
    }
  });

  test('only queued and running are nonterminal', () => {
    expect(isNonterminalPhase('queued')).toBe(true);
    expect(isNonterminalPhase('running')).toBe(true);
    expect(isNonterminalPhase('succeeded')).toBe(false);
    expect(isNonterminalPhase('failed')).toBe(false);
    expect(isNonterminalPhase('dead')).toBe(false);
    expect(isNonterminalPhase('cancelled')).toBe(false);
  });

  test('claims zero charge only on server evidence', () => {
    expect(jobOutcomeMessage(view({ phase: 'failed' }))).toBe('Kreditmu tidak dipotong.');
    expect(jobOutcomeMessage(view({ phase: 'cancelled' }))).toBe('Kreditmu tidak dipotong.');
    expect(jobOutcomeMessage(view({ phase: 'dead' }))).toBe('Kreditmu tidak dipotong.');
    expect(
      jobOutcomeMessage(view({ phase: 'succeeded', zeroCharge: false, chargedCredits: null })),
    ).toBe('Proses selesai.');
    expect(
      jobOutcomeMessage(view({ phase: 'succeeded', zeroCharge: true, chargedCredits: null })),
    ).toContain('Kreditmu tidak dipotong.');
    expect(
      jobOutcomeMessage(view({ phase: 'succeeded', zeroCharge: false, chargedCredits: 12 })),
    ).toContain('Kredit yang dipakai: 12.');
    expect(jobOutcomeMessage(view({ phase: 'running' }))).toBeNull();
  });
});

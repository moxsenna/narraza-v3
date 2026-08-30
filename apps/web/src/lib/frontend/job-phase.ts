/**
 * Public job phase vocabulary (S9.4): server-derived, no percentages,
 * no internal identifiers. The axis mirrors the GenerationJob public status.
 */
export type JobPhase = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';

export type JobPublicView = Readonly<{
  phase: JobPhase;
  cancelRequested: boolean;
  /** True only when server evidence shows a full release with zero settlement. */
  zeroCharge: boolean;
  /** Final charged credits when the server settled a usable output; otherwise null. */
  chargedCredits: number | null;
  /** True when the server resolved this job as an active/recoverable job on arrival. */
  recovered: boolean;
}>;

export const JOB_PHASE_LABELS: Readonly<Record<JobPhase, string>> = Object.freeze({
  queued: 'Menunggu diproses',
  running: 'Sedang diproses',
  succeeded: 'Proses selesai',
  failed: 'Proses gagal',
  dead: 'Proses berhenti',
  cancelled: 'Proses dibatalkan',
});

export const NONTERMINAL_JOB_PHASES: readonly JobPhase[] = Object.freeze(['queued', 'running']);

export type QuotePublicView = Readonly<{
  quoteId: string;
  maxCredits: number;
  availableCredits: number;
  expiresAtIso: string;
}>;

export function isNonterminalPhase(phase: JobPhase): boolean {
  return NONTERMINAL_JOB_PHASES.includes(phase);
}

/** D4 copy: zero-charge is only claimed when the server proved the full release. */
export function jobOutcomeMessage(view: JobPublicView): string | null {
  if (isNonterminalPhase(view.phase)) return null;
  if (view.phase === 'succeeded') {
    if (view.zeroCharge) {
      return 'Proses selesai, tetapi hasil siap pakai belum tersedia untuk adegan ini. Kreditmu tidak dipotong.';
    }
    if (view.chargedCredits !== null) {
      return `Proses selesai. Kredit yang dipakai: ${view.chargedCredits}.`;
    }
    return 'Proses selesai.';
  }
  return 'Kreditmu tidak dipotong.';
}

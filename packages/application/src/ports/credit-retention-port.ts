export interface DeleteEligibleCreditRetentionInput {
  readonly maxAgeHours: number;
  readonly batchSize: number;
}

export interface CreditRetentionSweepResult {
  readonly deletedQuotes: number;
  readonly deletedBundles: number;
}

/** Deletes only stale, unused quote and context-bundle rows. */
export interface CreditRetentionPort {
  deleteEligible(input: DeleteEligibleCreditRetentionInput): Promise<CreditRetentionSweepResult>;
}

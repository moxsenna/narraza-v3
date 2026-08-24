export type UsableOutputClassification =
  | {
      readonly kind: 'usable';
      readonly outputKind: string;
      readonly outputRef: string;
      readonly contributingAttemptIds: readonly string[];
    }
  | { readonly kind: 'zero_output' };

export interface ClassifyPublishedOutputInput {
  readonly projectId: string;
  readonly jobId: string;
  readonly jobKind: string;
}

/** Reads durable product rows written by the publish callback. */
export interface UsableOutputClassifier {
  classifyPublishedOutput(input: ClassifyPublishedOutputInput): Promise<UsableOutputClassification>;
}

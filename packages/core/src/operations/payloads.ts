import type { Ref } from './entities.js';

export type CharacterRole = 'main' | 'supporting';
export type FactCanonStatus = 'draft' | 'established' | 'disproven';
export type FactVisibility = 'writer_safe' | 'planner_only';
export type BeliefLevel = 'unknown' | 'suspected' | 'believed' | 'known' | 'disproven';
export type BeliefDowngradeReason =
  | 'new_evidence'
  | 'source_discredited'
  | 'memory_loss'
  | 'deliberate_deception'
  | 'canon_correction';
export interface FoundationChanges {
  readonly coreConcept?: string | null;
  readonly conflict?: string | null;
  readonly endingDirection?: string | null;
  readonly readerPromise?: string | null;
}
export interface CharacterFields {
  readonly displayName: string;
  readonly role: CharacterRole;
  readonly identity: string | null;
  readonly goal: string | null;
  readonly motivation: string | null;
  readonly address: string | null;
  readonly speechStyle: string | null;
}
export interface ProseEvidenceBinding {
  readonly proseVersionRef: Ref;
  readonly proseContentHash: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
}
export interface CanonicalProseEvidenceBinding {
  readonly proseVersionId: string;
  readonly proseContentHash: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
}
export type NormalizedFactSource =
  | { readonly kind: 'foundation' }
  | { readonly kind: 'prose'; readonly evidence: ProseEvidenceBinding };
export interface FactFields {
  readonly statement: string;
  readonly canonStatus: FactCanonStatus;
  readonly visibility: FactVisibility;
  readonly source: NormalizedFactSource;
}
export type ModelRef = { readonly existingId: string } | { readonly tempRef: string };
export type ModelOutlineNode =
  | { readonly kind: 'roadmap'; readonly title: string }
  | { readonly kind: 'arc'; readonly parent: ModelRef; readonly title: string }
  | { readonly kind: 'chapter'; readonly parent: ModelRef; readonly title: string }
  | {
      readonly kind: 'beat';
      readonly parent: ModelRef;
      readonly title: string;
      readonly purpose: string;
    };
export interface RevealFields {
  readonly fact: Ref;
  readonly position: { readonly chapter: Ref; readonly beat?: Ref };
  readonly safeDirectives: readonly string[];
}
export type NormalizedOperationPayload =
  | { readonly kind: 'foundation.update'; readonly changes: FoundationChanges }
  | ({ readonly kind: 'character.create' | 'character.update' } & CharacterFields)
  | ({ readonly kind: 'fact.create' | 'fact.update' } & FactFields)
  | {
      readonly kind: 'state.append';
      readonly stateKey: string;
      readonly value: string;
      readonly evidence: ProseEvidenceBinding;
    }
  | {
      readonly kind: 'belief.append';
      readonly fact: Ref;
      readonly level: BeliefLevel;
      readonly downgradeReason?: BeliefDowngradeReason;
      readonly evidence: ProseEvidenceBinding;
    }
  | {
      readonly kind: 'disclosure.append';
      readonly event:
        | { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' }
        | { readonly kind: 'retract'; readonly disclosure: Ref };
      readonly evidence: ProseEvidenceBinding;
    }
  | ({ readonly kind: 'reveal.create' | 'reveal.update' } & RevealFields)
  | {
      readonly kind: 'breadcrumb.create';
      readonly reveal: Ref;
      readonly position: { readonly chapter: Ref; readonly beat?: Ref };
      readonly safeDirective: string;
    }
  | {
      readonly kind: 'outline.create' | 'outline.update';
      readonly node:
        | { readonly kind: 'roadmap'; readonly title: string }
        | {
            readonly kind: 'arc' | 'chapter';
            readonly parent: Ref;
            readonly title: string;
          }
        | {
            readonly kind: 'beat';
            readonly parent: Ref;
            readonly title: string;
            readonly purpose: string;
          };
    }
  | { readonly kind: 'prose.version.create'; readonly beat: Ref; readonly content: string }
  | { readonly kind: 'prose.accept'; readonly proseVersion: Ref };
export type CanonicalOperationPayload =
  | { readonly kind: 'foundation.update'; readonly changes: FoundationChanges }
  | ({ readonly kind: 'character.create' | 'character.update' } & CharacterFields)
  | {
      readonly kind: 'fact.create' | 'fact.update';
      readonly factKey: string;
      readonly statement: string;
      readonly canonStatus: FactCanonStatus;
      readonly visibility: FactVisibility;
      readonly source:
        | { readonly kind: 'foundation' }
        | { readonly kind: 'prose'; readonly evidence: CanonicalProseEvidenceBinding };
    }
  | {
      readonly kind: 'state.append';
      readonly effectiveSequence: number;
      readonly stateKey: string;
      readonly value: string;
      readonly evidence: CanonicalProseEvidenceBinding;
    }
  | {
      readonly kind: 'belief.append';
      readonly factId: string;
      readonly beliefKey: string;
      readonly effectiveSequence: number;
      readonly level: BeliefLevel;
      readonly downgradeReason?: BeliefDowngradeReason;
      readonly evidence: CanonicalProseEvidenceBinding;
    }
  | {
      readonly kind: 'disclosure.append';
      readonly effectiveSequence: number;
      readonly event:
        | { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' }
        | { readonly kind: 'retract'; readonly disclosureId: string };
      readonly evidence: CanonicalProseEvidenceBinding;
    }
  | {
      readonly kind: 'reveal.create' | 'reveal.update';
      readonly factId: string;
      readonly chapterId: string;
      readonly beatId?: string;
      readonly targetSequence: number;
      readonly safeDirectives: readonly string[];
    }
  | {
      readonly kind: 'breadcrumb.create';
      readonly revealId: string;
      readonly chapterId: string;
      readonly beatId?: string;
      readonly sequence: number;
      readonly safeDirective: string;
    }
  | {
      readonly kind: 'outline.create' | 'outline.update';
      readonly node:
        | { readonly kind: 'roadmap'; readonly title: string }
        | {
            readonly kind: 'arc';
            readonly parentId: string;
            readonly title: string;
            readonly ordinal: number;
          }
        | {
            readonly kind: 'chapter';
            readonly parentId: string;
            readonly title: string;
            readonly ordinal: number;
            readonly narrativeSequence: number;
          }
        | {
            readonly kind: 'beat';
            readonly parentId: string;
            readonly title: string;
            readonly purpose: string;
            readonly ordinal: number;
            readonly narrativeSequence: number;
          };
    }
  | {
      readonly kind: 'prose.version.create';
      readonly beatId: string;
      readonly content: string;
      readonly contentHash: string;
    }
  | { readonly kind: 'prose.accept'; readonly proseVersionId: string };

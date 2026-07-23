import type { NarrativePosition } from '../narrative/position.js';
import type { WriterRevealGuidance } from '../narrative/reveal-policy.js';

declare const writerSafeProjectionBrand: unique symbol;
declare const restrictedProjectionBrand: unique symbol;

export const PACKET_SCHEMA_VERSION = 1 as const;
export const PACKET_POLICY_VERSION = 'domain-core/v1' as const;

export type DataClass = 'writer_safe' | 'review_safe' | 'author_private' | 'service_restricted';

export interface PacketMetadata {
  readonly schemaVersion: typeof PACKET_SCHEMA_VERSION;
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly policyVersion: typeof PACKET_POLICY_VERSION;
}

export interface FoundationPlanningContext {
  readonly coreConcept: string;
  readonly conflict: string;
  readonly endingDirection: string;
  readonly readerPromise: string;
}

export interface PlannerCharacter {
  readonly id: string;
  readonly name: string;
  readonly identity: string;
  readonly goal: string;
  readonly motivation: string;
  readonly privateNotes: readonly string[];
}

export interface AuthorPrivateFact {
  readonly dataClass: 'author_private';
  readonly id: string;
  readonly factKey: string;
  readonly truth: string;
  readonly visibility: 'canonical' | 'planner_only';
}

export interface PlannerReveal {
  readonly id: string;
  readonly factId: string;
  readonly targetPosition: NarrativePosition;
  readonly breadcrumbPositions: readonly NarrativePosition[];
}

export interface FutureOutlineItem {
  readonly id: string;
  readonly position: NarrativePosition;
  readonly purpose: string;
}

export interface WriterSafeBeatContract {
  readonly beatId: string;
  readonly purpose: string;
  readonly sceneGoal: string;
  readonly directives: readonly string[];
}

export interface ValidatorBeatDirective {
  readonly directiveKey: string;
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
}

export interface ValidatorProhibitedAction {
  readonly actionKey: string;
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
}

export interface ValidatorEndingRequirement {
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
}

export interface ValidatorLengthRange {
  readonly min: number;
  readonly max: number;
}

export interface ValidatorBeatContract {
  readonly beatId: string;
  readonly purpose: string;
  readonly requiredCharacterIds: readonly string[];
  readonly requiredFactKeys: readonly string[];
  readonly requiredDirectives: readonly ValidatorBeatDirective[];
  readonly prohibitedActions: readonly ValidatorProhibitedAction[];
  readonly endingRequirement?: ValidatorEndingRequirement;
  readonly lengthRange?: ValidatorLengthRange;
}

export interface BehavioralCharacterDirective {
  readonly characterId: string;
  readonly directives: readonly string[];
}

export interface WriterSafeFact {
  readonly dataClass: 'writer_safe';
  readonly id: string;
  readonly factKey: string;
  readonly safeStatement: string;
}

export interface WriterRevealGuidanceItem {
  readonly revealId: string;
  readonly guidance: WriterRevealGuidance;
}

export interface AcceptedProseContext {
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly excerpt: string;
}

export interface ValidatorProse {
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly content: string;
}

export interface RestrictedGuard {
  readonly guardKey: string;
  readonly prohibitedExact: readonly string[];
  readonly prohibitedAliases: readonly string[];
  readonly coOccurrenceGroups: readonly (readonly string[])[];
  readonly proximityGroups: readonly (readonly string[])[];
  readonly semanticReviewRequired: boolean;
}

export interface ContinuityRule {
  readonly ruleKey: string;
  readonly instruction: string;
  readonly restrictedEvidence: readonly string[];
}

export interface RepairableProse {
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly content: string;
}

export interface FindingLocationInput {
  readonly startUtf16: number;
  readonly endUtf16: number;
}

export interface RepairDirective {
  readonly findingKey: string;
  readonly publicMessageCode: string;
  readonly instruction: string;
  readonly location?: FindingLocationInput;
}

export interface IntakeSignalMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface PublicStructureProse {
  readonly proseVersionId: string;
  readonly content: string;
}

export interface CanonReconciliationCharacter {
  readonly id: string;
  readonly identity: string;
}

interface PacketBase<K extends string, D extends DataClass> {
  readonly kind: K;
  readonly dataClass: D;
  readonly metadata: PacketMetadata;
}

export interface PlannerPacketInput extends PacketBase<'planner', 'author_private'> {
  readonly foundation: FoundationPlanningContext;
  readonly characters: readonly PlannerCharacter[];
  readonly facts: readonly AuthorPrivateFact[];
  readonly reveals: readonly PlannerReveal[];
  readonly futureOutline: readonly FutureOutlineItem[];
}

export interface WriterPacketInput extends PacketBase<'writer', 'writer_safe'> {
  readonly beatContract: WriterSafeBeatContract;
  readonly characterDirectives: readonly BehavioralCharacterDirective[];
  readonly establishedFacts: readonly WriterSafeFact[];
  readonly revealGuidance: readonly WriterRevealGuidanceItem[];
  readonly acceptedProseContext: readonly AcceptedProseContext[];
}

export interface ValidatorPacketInput extends PacketBase<'validator', 'author_private'> {
  readonly prose: ValidatorProse;
  readonly beatContract: ValidatorBeatContract;
  readonly restrictedGuardSets: readonly RestrictedGuard[];
  readonly continuityRules: readonly ContinuityRule[];
}

export interface RepairPacketInput extends PacketBase<'repair', 'writer_safe'> {
  readonly repairableProse: RepairableProse;
  readonly directives: readonly RepairDirective[];
  readonly beatContract: WriterSafeBeatContract;
  readonly revealGuidance: readonly WriterRevealGuidanceItem[];
}

export interface IntakeSignalsExtractionInput extends PacketBase<'extraction', 'review_safe'> {
  readonly useCase: 'intake_signals';
  readonly messages: readonly IntakeSignalMessage[];
}

export interface ProsePublicStructureExtractionInput extends PacketBase<
  'extraction',
  'review_safe'
> {
  readonly useCase: 'prose_public_structure';
  readonly prose: PublicStructureProse;
}

export interface CanonReconciliationExtractionInput extends PacketBase<
  'extraction',
  'author_private'
> {
  readonly useCase: 'canon_reconciliation';
  readonly prose: ValidatorProse;
  readonly facts: readonly AuthorPrivateFact[];
  readonly characters: readonly CanonReconciliationCharacter[];
}

export type ExtractionPacketInput =
  | IntakeSignalsExtractionInput
  | ProsePublicStructureExtractionInput
  | CanonReconciliationExtractionInput;

export interface PlannerContextPacket extends PlannerPacketInput {
  readonly [restrictedProjectionBrand]: true;
}

export interface WriterContextPacket extends WriterPacketInput {
  readonly [writerSafeProjectionBrand]: true;
}

export interface ValidatorContextPacket extends ValidatorPacketInput {
  readonly [restrictedProjectionBrand]: true;
}

export interface RepairContextPacket extends RepairPacketInput {
  readonly [writerSafeProjectionBrand]: true;
}

export type ExtractionContextPacket =
  | (IntakeSignalsExtractionInput & { readonly [writerSafeProjectionBrand]: true })
  | (ProsePublicStructureExtractionInput & {
      readonly [writerSafeProjectionBrand]: true;
    })
  | (CanonReconciliationExtractionInput & {
      readonly [restrictedProjectionBrand]: true;
    });

export type ContextPacket =
  | PlannerContextPacket
  | WriterContextPacket
  | ValidatorContextPacket
  | RepairContextPacket
  | ExtractionContextPacket;

export type ContextPacketErrorCode =
  | 'INVALID_PACKET'
  | 'UNKNOWN_KEY'
  | 'PACKET_KIND_MISMATCH'
  | 'DATA_CLASS_MISMATCH'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSUPPORTED_POLICY_VERSION'
  | 'INVALID_DEPENDENCY_HASH'
  | 'DUPLICATE_ENTITY_ID'
  | 'UNRESOLVED_REFERENCE'
  | 'SERVICE_RESTRICTED_DATA';

export class ContextPacketError extends Error {
  readonly code: ContextPacketErrorCode;
  readonly path: string;

  constructor(code: ContextPacketErrorCode, path: string, message: string) {
    super(message);
    this.name = 'ContextPacketError';
    this.code = code;
    this.path = path;
  }
}

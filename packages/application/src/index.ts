// @narraza/application — use cases + UnitOfWork + ports (interfaces only).
// Depends on core + shared; never on concrete adapters (db/ai/web). Auth (D21)
// landed in M0; domain ports/UoW/authz land in M2.

export const APPLICATION_PACKAGE = '@narraza/application' as const;

export { ok, err, type Result } from './result.js';

export { appError, notFound, type AppError, type AppErrorCode } from './errors.js';

export { authorizeActiveUser, type ActiveUser } from './authz/authorize-active-user.js';

// Domain ports + UnitOfWork contract (M2). Concrete adapters live in @narraza/db.
export type {
  JsonObject,
  GenerationJobStatus,
  TerminalJobStatus,
  GenerationJobRecord,
  JobLeaseIdentity,
  WorkflowInvocationStatus,
  GenerationAttemptStatus,
  WorkflowInvocationRecord,
  GenerationAttemptRecord,
  ProjectRecord,
  FoundationRecord,
  CharacterRecord,
  FactRecord,
  OutlineNodeRecord,
  RevealRecord,
  RevealBreadcrumbRecord,
  IntakeSessionRecord,
  IntakeMessageRecord,
  CanonicalChangeSetRecord,
  CanonicalChangeOperationRecord,
  ProposalRecord,
  CreditQuoteRecord,
  ProjectInsertInput,
  ProjectRepo,
  FoundationInsertInput,
  FoundationRepo,
  CharacterInsertInput,
  CharacterUpdateInput,
  CharacterRepo,
  FactInsertInput,
  FactUpdateInput,
  FactRepo,
  OutlineEntityType,
  OutlineNodeInsertInput,
  OutlineNodeUpdateInput,
  OutlineRepo,
  RevealInsertInput,
  RevealUpdateInput,
  BreadcrumbInsertInput,
  RevealRepo,
  ChangeSetInsertInput,
  ChangeOperationInsertInput,
  ChangeSetRepo,
  ProposalInsertInput,
  ProposalRepo,
  IntakeSessionInsertInput,
  IntakeMessageInsertInput,
  IntakeRepo,
  ConceptRecord,
  ConceptSetRecord,
  ConceptSetInsertInput,
  ConceptInsertInput,
  ConceptRepo,
  AuditAppendInput,
  AuditPort,
  OutboxAppendInput,
  CreditOverageIncidentInput,
  CreditOverageIncidentResult,
  ReservationReconciliationIncidentInput,
  ReservationReconciliationIncidentReason,
  ReservationReconciliationIncidentResult,
  MissingJobReservationFundingModel,
  MissingJobReservationIncidentInput,
  MissingJobReservationIncidentResult,
  OutboxPort,
  SnapshotAppendInput,
  SnapshotPort,
  ReleaseQueuedCancellationInput,
  ReleaseQueuedCancellationResult,
  AppendReservationSettlementInput,
  ReservationSettlementAppendResult,
  AppendReservationReleaseInput,
  ReservationReleaseAppendResult,
  LedgerPort,
  JobInsertInput,
  JobInsertResult,
  JobLookupInput,
  JobClaimInput,
  JobClaimResult,
  JobHeartbeatInput,
  JobHeartbeatResult,
  JobRequeueInput,
  JobRequeueResult,
  QueuedTerminalStatus,
  RunningTerminalStatus,
  JobQueuedTerminalInput,
  JobRunningTerminalInput,
  JobTerminalTransitionResult,
  JobCancelQueuedResult,
  JobRunningCancellationResult,
  JobReclaimInput,
  JobReclaimResult,
  JobExpiredReclaimLockResult,
  JobFencedLockResult,
  JobLiveOwnerLockResult,
  JobFinalizationLockResult,
  JobPort,
  UsageMetrics,
  AppendUsageResult,
  AiUsagePort,
  BeginAttemptInput,
  BeginAttemptResult,
  FinalizableAttemptStatus,
  FinalizeAttemptInput,
  WinnerOutcome,
  FinalizeAttemptResult,
  BeginAttemptPortResult,
  FinalizeAttemptPortResult,
  WinnerClassificationResult,
  FinalizationEligibility,
  InvocationFinalizationLockResult,
  WorkflowInvocationPort,
  GenerationAttemptPort,
  QuoteInsertInput,
  QuoteInsertResult,
  QuotePort,
  CreditBalanceSnapshot,
  CreditSummaryView,
  CreditBalancePort,
  CreditReservationRecord,
  AppendCreditBillingAllocationInput,
  AppendCreditBillingAllocationResult,
  CreditBillingAllocationPort,
  UsableOutputClassification,
  ClassifyPublishedOutputInput,
  UsableOutputClassifier,
  CreditReservationPort,
  CreateReservationInput,
  CreateReservationResult,
  ApplyReconciliationTargetInput,
  ReconciliationApplyResult,
  DeleteEligibleCreditRetentionInput,
  CreditRetentionSweepResult,
  CreditRetentionPort,
  OutboxDeliveryEvent,
  OutboxDeliveryReceipt,
  OutboxClaim,
  ClaimNextOutboxInput,
  ClaimNextOutboxResult,
  OutboxFinalizeFence,
  OutboxFailureFence,
  OutboxFinalizeResult,
  ReplayDeadOutboxInput,
  ReplayDeadOutboxResult,
  OutboxNotReplayableReason,
  OutboxDeliveryPort,
  OutboxDeliveryUnitOfWork,
  IsolationLevel,
  UnitOfWorkOptions,
  TxPorts,
  UnitOfWork,
} from './ports/index.js';

export {
  createCreditQuoteService,
  type IssueQuoteInput,
  type IssueQuoteResult,
  type CreditQuoteService,
} from './credits/quote-service.js';

export {
  createCreditSummaryService,
  type CreditSummaryInput,
  type CreditSummaryService,
} from './credits/credit-summary-service.js';

export { computeCreditSummaryView } from './credits/credit-summary.js';
export {
  createCreditRetentionService,
  DEFAULT_RETENTION_MAX_AGE_HOURS,
  DEFAULT_RETENTION_BATCH_SIZE,
  type CreditRetentionSweepInput,
  type CreditRetentionService,
} from './credits/credit-retention-service.js';
export {
  ReservationReconciliationConflict,
  type ReservationReconciliationConflictReason,
} from './credits/reservation-reconciliation-error.js';
export {
  recordMissingJobReservationIncident,
  reconcileTerminalReservation,
  type MissingReservationViolation,
  type RecordMissingJobReservationOutcome,
  type ReservationReconciliationResult,
  type ReservationSettlementEvidence,
} from './credits/reservation-reconciliation-service.js';
export {
  createJobService,
  type CancelInput,
  type CancelResult,
  type ManualRetryInput,
  type ManualRetryResult,
  type ClaimInput,
  type HeartbeatInput,
  type RequeueInput,
  type FinishInput,
  type ReclaimOneInput,
  type FencedPublishSentinelInput,
  type FencedPublishContext,
  type FencedPublishOptions,
  type FencedPublishResult,
  type JobFinishResult,
  type JobReclaimServiceResult,
  type JobService,
} from './jobs/job-service.js';

export {
  outboxIdempotencyKey,
  type OutboxHandler,
  type OutboxHandlerContext,
  type OutboxHandlerResult,
} from './outbox/outbox-handler.js';
export {
  createOutboxHandlerRegistry,
  createProductionOutboxHandlerRegistry,
  type OutboxHandlerRegistry,
} from './outbox/outbox-handler-registry.js';
export {
  createOutboxDeliveryService,
  type OutboxDeliveryOutcome,
  type OutboxDeliveryService,
  type OutboxDeliveryServiceSettings,
  type OutboxReplayOutcome,
  type OutboxTerminalKind,
} from './outbox/outbox-delivery-service.js';
export {
  createOutboxConsumerLoop,
  type OutboxConsumerLoop,
  type OutboxConsumerLoopDependencies,
  type OutboxConsumerLoopSettings,
} from './outbox/outbox-consumer-loop.js';
export {
  createOutboxModule,
  outboxSettingsFromEnv,
  type OutboxModuleDependencies,
  type OutboxModuleSettings,
  type OutboxSettingsEnv,
} from './outbox/outbox-module.js';

export {
  createWorkflowInvocationService,
  type WorkflowInvocationService,
} from './workflows/workflow-invocation-service.js';
export {
  createThreePhaseAttemptHarness,
  type ExecutorOutcome,
  type ValidatorOutcome,
  type ThreePhaseEvent,
  type ThreePhaseAttemptResult,
  type ThreePhaseAttemptDependencies,
  type ThreePhaseAttemptHarness,
} from './workflows/three-phase-attempt.js';

// Namespace for the auth service + helpers.
export * as auth from './auth/index.js';

// Auth port interfaces + records exported at top level so adapter packages
// (db/web) implement them without reaching through the namespace.
export type {
  AuthPorts,
  AuthUserRecord,
  UserStore,
  EmailTokenStore,
  AuthTransactions,
  RateLimitStore,
  SessionIssuer,
  PasswordHasher,
  TokenService,
  IdentifierHasher,
  Mailer,
} from './auth/ports.js';
export { type AuthConfig, type EmailTokenPurpose } from './auth/constants.js';

// M4 Block A: frozen context bundles + deterministic mock price fixtures.
export { toStoredDataClass } from './ai/context-bundle-port.js';
export type {
  ContextBundlePort,
  ContextBundleRecord,
  ContextBundleCreateInput,
  ContextBundleSnapshot,
  StoredDataClass,
} from './ai/context-bundle-port.js';
export {
  createContextBundleFreezeService,
  type FreezeBundleInput,
  type FreezeBundleResult,
  type FreezeBundleErrorCode,
  type FrozenBundle,
  type ContextPacketLike,
} from './ai/context-bundle-freeze-service.js';
export type {
  ModelPriceSnapshotPort,
  ModelPriceSnapshotRecord,
  ModelPriceSnapshotSeedInput,
} from './ai/model-price-port.js';
export { seedMockPriceSnapshots } from './ai/seed-mock-prices.js';
// M4 Block B: frozen workflow plans + paid-generation preparation.
export type {
  WorkflowPlanPort,
  WorkflowPlanRecord,
  WorkflowPlanCreateInput,
} from './ai/workflow-plan-port.js';
export {
  buildWorkflowPlan,
  createWorkflowPlanFreezeService,
} from './ai/workflow-plan-freeze-service.js';
export type {
  BuildPlanErrorCode,
  BuildWorkflowPlanInput,
  BuildWorkflowPlanResult,
  FrozenWorkflowPlan,
} from './ai/workflow-plan-freeze-service.js';
export { createPaidGenerationPreparationService } from './ai/paid-generation-preparation-service.js';
export type {
  PreparePaidGenerationInput,
  PreparePaidGenerationResult,
} from './ai/paid-generation-preparation-service.js';
export {
  MOCK_PRICE_SNAPSHOT_FIXTURES,
  MOCK_PRICE_SNAPSHOT_ID,
  MOCK_PROVIDER_ID,
  MOCK_WRITER_MODEL_ID,
  MOCK_JUDGE_MODEL_ID,
  MOCK_PRICE_EFFECTIVE_AT,
} from './ai/mock-price-fixtures.js';
export { type AuthError, type AuthErrorCode } from './auth/errors.js';

// Task 6: Credit quote confirmation service
export { createCreditQuoteConfirmationService } from './credits/credit-quote-confirmation-service.js';
export type {
  CreateConfirmationInput,
  ConfirmQuoteResult,
} from './credits/confirmation-contract.js';
// Re-export Task 2 pure functions for integration testing
export {
  computeReservationTargets,
  deriveReservationStatus,
} from './credits/reservation-target.js';
export {
  createAuthService,
  type AuthService,
  type SessionResult,
  type RequestContext,
} from './auth/service.js';

// Single write door (M2 / S2.2).
export {
  createCommitCanonicalChangeSet,
  type CommitChangeSetInput,
  type CommitChangeSetOutput,
  type CanonicalOpPersist,
} from './change-set/commit-canonical-change-set.js';
export { applyOperation, type ApplyResult } from './change-set/apply-operations.js';

// Use cases (M2 W2.3).
export {
  createCreateProject,
  jalurToIntakePath,
  OPENERS,
  type IntakeJalur,
  type IntakePathDb,
  type CreateProjectInput,
  type CreateProjectOutput,
} from './use-cases/create-project.js';
export {
  createAppendIntakeMessage,
  type AppendIntakeMessageInput,
  type AppendIntakeMessageOutput,
} from './use-cases/append-intake-message.js';
export {
  createUpdateFoundationDraft,
  createConfirmFoundation,
  createLockFoundation,
  toReadinessInput,
  type UpdateFoundationDraftInput,
  type ConfirmFoundationInput,
  type LockFoundationInput,
  type FoundationOutput,
} from './use-cases/foundation.js';
export {
  createUpsertCharacter,
  type UpsertCharacterInput,
  type UpsertCharacterOutput,
} from './use-cases/character.js';
export { createUpsertFact, type UpsertFactInput, type UpsertFactOutput } from './use-cases/fact.js';
export {
  createUpsertOutlineNode,
  type UpsertOutlineNodeInput,
  type UpsertOutlineNodeOutput,
} from './use-cases/outline.js';
export {
  createCreateReveal,
  type CreateRevealInput,
  type CreateRevealOutput,
} from './use-cases/reveal.js';
export {
  createAcceptConcept,
  foundationPayloadFromConcept,
  type AcceptConceptInput,
  type AcceptConceptOutput,
} from './use-cases/accept-concept.js';

// Progress reducer v1 (W2.4).
export {
  projectProgressView,
  type ProjectProgressSnapshot,
  type ProjectProgressView,
} from './progress/project-progress-view.js';

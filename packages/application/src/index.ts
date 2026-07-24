// @narraza/application — use cases + UnitOfWork + ports (interfaces only).
// Depends on core + shared; never on concrete adapters (db/ai/web). Auth (D21)
// landed in M0; domain ports/UoW/authz land in M2.

export const APPLICATION_PACKAGE = '@narraza/application' as const;

export { ok, err, type Result } from './result.js';

export {
  appError,
  notFound,
  type AppError,
  type AppErrorCode,
} from './errors.js';

export {
  authorizeActiveUser,
  type ActiveUser,
} from './authz/authorize-active-user.js';

// Domain ports + UnitOfWork contract (M2). Concrete adapters live in @narraza/db.
export type {
  JsonObject,
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
  AuditAppendInput,
  AuditPort,
  OutboxAppendInput,
  OutboxPort,
  SnapshotAppendInput,
  SnapshotPort,
  LedgerPort,
  JobPort,
  IsolationLevel,
  UnitOfWorkOptions,
  TxPorts,
  UnitOfWork,
} from './ports/index.js';

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
export { type AuthError, type AuthErrorCode } from './auth/errors.js';
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
export {
  createUpsertFact,
  type UpsertFactInput,
  type UpsertFactOutput,
} from './use-cases/fact.js';
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

// Progress reducer v1 (W2.4).
export {
  projectProgressView,
  type ProjectProgressSnapshot,
  type ProjectProgressView,
} from './progress/project-progress-view.js';

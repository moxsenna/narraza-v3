import type { AiUsagePort } from './ai-usage-port.js';
import type { AuditPort } from './audit-port.js';
import type { ChangeSetRepo } from './change-set-repo.js';
import type { CharacterRepo } from './character-repo.js';
import type { CreditBalancePort } from './credit-balance-port.js';
import type { CreditBillingAllocationPort } from './credit-billing-allocation-port.js';
import type { CreditReservationPort } from './credit-reservation-port.js';
import type { ConceptRepo } from './concept-repo.js';
import type { FactRepo } from './fact-repo.js';
import type { FoundationRepo } from './foundation-repo.js';
import type { IntakeRepo } from './intake-repo.js';
import type { JobPort } from './job-port.js';
import type { LedgerPort } from './ledger-port.js';
import type { OutlineRepo } from './outline-repo.js';
import type { OutboxPort } from './outbox-port.js';
import type { ProjectRepo } from './project-repo.js';
import type { ProposalRepo } from './proposal-repo.js';
import type { QuotePort } from './quote-port.js';
import type { RevealRepo } from './reveal-repo.js';
import type { SnapshotPort } from './snapshot-port.js';
import type { UsableOutputClassifier } from './usable-output-classifier.js';
import type { GenerationAttemptPort, WorkflowInvocationPort } from './workflow-invocation-port.js';

/** D9: default read committed + row lock/CAS; serializable opt-in per use case. */
export type IsolationLevel = 'read_committed' | 'serializable';

export interface UnitOfWorkOptions {
  readonly isolation?: IsolationLevel;
  /** Stable across retries for the same logical request. */
  readonly requestId?: string;
  /** Default 3 (D9). */
  readonly maxRetries?: number;
}

/**
 * Transaction-scoped ports only. Use cases never hold a Prisma client —
 * only these ports inside `unitOfWork.execute`.
 */
export interface TxPorts {
  readonly project: ProjectRepo;
  readonly foundation: FoundationRepo;
  readonly character: CharacterRepo;
  readonly fact: FactRepo;
  readonly outline: OutlineRepo;
  readonly reveal: RevealRepo;
  readonly proposal: ProposalRepo;
  readonly changeSet: ChangeSetRepo;
  readonly intake: IntakeRepo;
  readonly concept: ConceptRepo;
  readonly audit: AuditPort;
  readonly outbox: OutboxPort;
  readonly snapshot: SnapshotPort;
  readonly ledger: LedgerPort;
  readonly creditBalance: CreditBalancePort;
  /** W3.3 opt-in capability; optional for legacy UnitOfWork test doubles. */
  readonly creditBillingAllocation?: CreditBillingAllocationPort;
  readonly creditReservation: CreditReservationPort;
  /** W3.3 opt-in capability; optional for legacy UnitOfWork test doubles. */
  readonly usableOutputClassifier?: UsableOutputClassifier;
  readonly job: JobPort;
  readonly workflowInvocation: WorkflowInvocationPort;
  readonly generationAttempt: GenerationAttemptPort;
  readonly aiUsage: AiUsagePort;
  readonly quote: QuotePort;
  readonly dbNow: () => Promise<Date>;
  readonly dbOperationalNow: () => Promise<Date>;
  readonly allocateId: () => string;
}

export interface UnitOfWork {
  execute<T>(fn: (ports: TxPorts) => Promise<T>, opts?: UnitOfWorkOptions): Promise<T>;
}

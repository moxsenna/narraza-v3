import type { AuditPort } from './audit-port.js';
import type { ChangeSetRepo } from './change-set-repo.js';
import type { CharacterRepo } from './character-repo.js';
import type { FactRepo } from './fact-repo.js';
import type { FoundationRepo } from './foundation-repo.js';
import type { IntakeRepo } from './intake-repo.js';
import type { JobPort } from './job-port.js';
import type { LedgerPort } from './ledger-port.js';
import type { OutlineRepo } from './outline-repo.js';
import type { OutboxPort } from './outbox-port.js';
import type { ProjectRepo } from './project-repo.js';
import type { ProposalRepo } from './proposal-repo.js';
import type { RevealRepo } from './reveal-repo.js';
import type { SnapshotPort } from './snapshot-port.js';

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
  readonly audit: AuditPort;
  readonly outbox: OutboxPort;
  readonly snapshot: SnapshotPort;
  readonly ledger: LedgerPort;
  readonly job: JobPort;
  readonly dbNow: () => Promise<Date>;
  readonly allocateId: () => string;
}

export interface UnitOfWork {
  execute<T>(fn: (ports: TxPorts) => Promise<T>, opts?: UnitOfWorkOptions): Promise<T>;
}

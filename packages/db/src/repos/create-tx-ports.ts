import type { TxPorts } from '@narraza/application';
import { dbNow } from '../db-now.js';
import { createAuditPort } from './audit-port.js';
import { createChangeSetRepo } from './change-set-repo.js';
import { createCharacterRepo } from './character-repo.js';
import { createConceptRepo } from './concept-repo.js';
import { createFactRepo } from './fact-repo.js';
import { createFoundationRepo } from './foundation-repo.js';
import { createIntakeRepo } from './intake-repo.js';
import { createJobRepo } from './job-repo.js';
import { createLedgerPort } from './ledger-port.js';
import { createOutlineRepo } from './outline-repo.js';
import { createOutboxPort } from './outbox-port.js';
import { createProjectRepo } from './project-repo.js';
import { createProposalRepo } from './proposal-repo.js';
import { createRevealRepo } from './reveal-repo.js';
import { createSnapshotPort } from './snapshot-port.js';
import type { TxClient } from './tx-client.js';
import { createWorkflowInvocationRepo } from './workflow-invocation-repo.js';

export function createTxPorts(tx: TxClient): TxPorts {
  const workflowInvocation = createWorkflowInvocationRepo(tx);
  return {
    project: createProjectRepo(tx),
    foundation: createFoundationRepo(tx),
    character: createCharacterRepo(tx),
    fact: createFactRepo(tx),
    outline: createOutlineRepo(tx),
    reveal: createRevealRepo(tx),
    proposal: createProposalRepo(tx),
    changeSet: createChangeSetRepo(tx),
    intake: createIntakeRepo(tx),
    concept: createConceptRepo(tx),
    audit: createAuditPort(tx),
    outbox: createOutboxPort(tx),
    snapshot: createSnapshotPort(tx),
    ledger: createLedgerPort(tx),
    job: createJobRepo(tx),
    workflowInvocation,
    generationAttempt: workflowInvocation,
    aiUsage: undefined as never,
    dbNow: () => dbNow(tx),
    allocateId: () => crypto.randomUUID(),
  };
}

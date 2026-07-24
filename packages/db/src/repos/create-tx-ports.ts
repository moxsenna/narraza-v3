import type { TxPorts } from '@narraza/application';
import { dbNow } from '../db-now.js';
import { createAuditPort } from './audit-port.js';
import { createChangeSetRepo } from './change-set-repo.js';
import { createCharacterRepo } from './character-repo.js';
import { createFactRepo } from './fact-repo.js';
import { createFoundationRepo } from './foundation-repo.js';
import { createIntakeRepo } from './intake-repo.js';
import { createJobStub, createLedgerStub } from './stub-ports.js';
import { createOutlineRepo } from './outline-repo.js';
import { createOutboxPort } from './outbox-port.js';
import { createProjectRepo } from './project-repo.js';
import { createProposalRepo } from './proposal-repo.js';
import { createRevealRepo } from './reveal-repo.js';
import { createSnapshotPort } from './snapshot-port.js';
import type { TxClient } from './tx-client.js';

export function createTxPorts(tx: TxClient): TxPorts {
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
    audit: createAuditPort(tx),
    outbox: createOutboxPort(tx),
    snapshot: createSnapshotPort(tx),
    ledger: createLedgerStub(),
    job: createJobStub(),
    dbNow: () => dbNow(tx),
    allocateId: () => crypto.randomUUID(),
  };
}

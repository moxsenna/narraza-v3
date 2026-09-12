import type { TxPorts } from '@narraza/application';
import { dbNow, dbOperationalNow } from '../db-now.js';
import { createAiUsagePort } from './ai-usage-port.js';
import { createArtifactProposalRepo } from './artifact-repo.js';
import { createAuditPort } from './audit-port.js';
import { createChangeSetRepo } from './change-set-repo.js';
import { createContextBundlePort } from './context-bundle-port.js';
import { createCharacterRepo } from './character-repo.js';
import { createConceptRepo } from './concept-repo.js';
import { createCreditBalanceRepo } from './credit-balance-repo.js';
import { createCreditBillingAllocationPort } from './credit-billing-allocation-port.js';
import { createCreditReservationRepo } from './credit-reservation-repo.js';
import { createCreditRetentionPort } from './credit-retention-port.js';
import { createFactRepo } from './fact-repo.js';
import { createFoundationRepo } from './foundation-repo.js';
import { createIntakeRepo } from './intake-repo.js';
import { createJobRepo } from './job-repo.js';
import { createLedgerPort } from './ledger-port.js';
import { createModelPricePort } from './model-price-port.js';
import { createM4ProductOutputPort } from './m4-product-output-port.js';
import { createM4ProductReadPort } from './m4-product-read-port.js';
import { createOutlineRepo } from './outline-repo.js';
import { createOutboxPort } from './outbox-port.js';
import { createProjectRepo } from './project-repo.js';
import { createProposalGroupRepo, createProposalRepo } from './proposal-repo.js';
import { createProseDraftRepo, createProseVersionRepo } from './prose-repo.js';
import { createValidationFindingRepo, createValidationReportRepo } from './validation-repo.js';
import { createQuoteRepo } from './quote-repo.js';
import { createRevealRepo } from './reveal-repo.js';
import { createSnapshotPort } from './snapshot-port.js';
import type { TxClient } from './tx-client.js';
import { createUsableOutputClassifier } from './usable-output-classifier.js';
import { createWorkflowPlanPort } from './workflow-plan-port.js';
import { createAttemptRecoveryPort } from './attempt-recovery-port.js';
import { createSystemFundedIntakePort } from './system-funded-intake-port.js';
import { createWorkflowInvocationRepo } from './workflow-invocation-repo.js';

export function createTxPorts(tx: TxClient): TxPorts {
  const allocateId = () => crypto.randomUUID();
  const workflowInvocation = createWorkflowInvocationRepo(tx);
  return {
    project: createProjectRepo(tx),
    foundation: createFoundationRepo(tx),
    character: createCharacterRepo(tx),
    fact: createFactRepo(tx),
    outline: createOutlineRepo(tx),
    reveal: createRevealRepo(tx),
    proposal: createProposalRepo(tx),
    proposalGroup: createProposalGroupRepo(tx),
    artifactProposal: createArtifactProposalRepo(tx),
    proseDraft: createProseDraftRepo(tx),
    proseVersion: createProseVersionRepo(tx),
    validationReport: createValidationReportRepo(tx),
    validationFinding: createValidationFindingRepo(tx),
    changeSet: createChangeSetRepo(tx),
    intake: createIntakeRepo(tx),
    concept: createConceptRepo(tx),
    audit: createAuditPort(tx),
    outbox: createOutboxPort(tx),
    snapshot: createSnapshotPort(tx),
    contextBundle: createContextBundlePort(tx),
    modelPrice: createModelPricePort(tx),
    workflowPlan: createWorkflowPlanPort(tx),
    attemptRecovery: createAttemptRecoveryPort(tx),
    systemFundedIntake: createSystemFundedIntakePort(tx),
    m4ProductOutput: createM4ProductOutputPort(tx),
    m4ProductRead: createM4ProductReadPort(tx),
    ledger: createLedgerPort(tx),
    creditBalance: createCreditBalanceRepo(tx),
    creditBillingAllocation: createCreditBillingAllocationPort(tx),
    creditReservation: createCreditReservationRepo(tx),
    creditRetention: createCreditRetentionPort(tx),
    usableOutputClassifier: createUsableOutputClassifier(tx),
    job: createJobRepo(tx),
    workflowInvocation,
    generationAttempt: workflowInvocation,
    aiUsage: createAiUsagePort(tx, allocateId),
    quote: createQuoteRepo(tx),
    dbNow: () => dbNow(tx),
    dbOperationalNow: () => dbOperationalNow(tx),
    allocateId,
  };
}

import type { UnitOfWork } from '../ports/unit-of-work.js';
import type {
  BeginAttemptInput,
  BeginAttemptResult,
  FinalizeAttemptInput,
  FinalizeAttemptResult,
} from '../ports/workflow-invocation-port.js';

export interface WorkflowInvocationService {
  beginAttempt(input: BeginAttemptInput): Promise<BeginAttemptResult>;
  finalizeAttempt(input: FinalizeAttemptInput): Promise<FinalizeAttemptResult>;
}

class FinalizeRollback extends Error {
  constructor(readonly result: Extract<FinalizeAttemptResult, { readonly kind: 'conflict' }>) {
    super('Workflow attempt transaction must roll back');
    this.name = 'FinalizeRollback';
  }
}

export function createWorkflowInvocationService(unitOfWork: UnitOfWork): WorkflowInvocationService {
  return {
    beginAttempt(input) {
      return unitOfWork.execute<BeginAttemptResult>(async (ports) => {
        const project = await ports.project.lockForUpdate(input.projectId);
        if (project === null || project.deletedAt !== null) return { kind: 'not_authorized' };

        const owner = await ports.job.lockLiveOwnerForAttempt(input);
        if (owner.kind === 'not_authorized') return { kind: 'not_authorized' };

        return ports.workflowInvocation.beginAttempt(input);
      });
    },

    async finalizeAttempt(input) {
      try {
        return await unitOfWork.execute<FinalizeAttemptResult>(async (ports) => {
          const project = await ports.project.lockForUpdate(input.projectId);
          if (project === null) return { kind: 'not_authorized' };

          const job = await ports.job.lockForFinalization(input);
          if (job.kind === 'not_authorized') return { kind: 'not_authorized' };

          const invocation = await ports.workflowInvocation.lockForFinalization(input);
          if (invocation.kind === 'not_authorized') return { kind: 'not_authorized' };

          const finalized = await ports.generationAttempt.finalizeAttempt(input);
          if (finalized.kind === 'not_authorized') return finalized;
          if (finalized.kind === 'conflict') throw new FinalizeRollback({ kind: 'conflict' });

          const usage = await ports.aiUsage.appendForAttempt(finalized.attempt, input.usage);
          if (usage.kind === 'conflict') throw new FinalizeRollback({ kind: 'conflict' });

          const eligibility = project.deletedAt !== null ? 'project_tombstoned' : job.eligibility;
          const classified = await ports.workflowInvocation.classifyWinner(
            input,
            finalized.attempt,
            finalized.kind === 'finalized',
            eligibility,
          );
          if (classified.kind === 'conflict') throw new FinalizeRollback({ kind: 'conflict' });
          if (classified.kind === 'not_authorized') return classified;

          return { kind: finalized.kind, attempt: finalized.attempt, winner: classified.winner };
        });
      } catch (error) {
        if (error instanceof FinalizeRollback) return error.result;
        throw error;
      }
    },
  };
}

import { describe, expect, it, vi } from 'vitest';
import type {
  BeginAttemptInput,
  FinalizeAttemptResult,
} from '../ports/workflow-invocation-port.js';
import type { WorkflowInvocationService } from './workflow-invocation-service.js';
import type { JobService } from '../jobs/job-service.js';
import { createThreePhaseAttemptHarness, type ExecutorOutcome } from './three-phase-attempt.js';

const input: BeginAttemptInput = {
  projectId: 'project',
  jobId: 'job',
  leaseToken: 'lease',
  fenceVersion: 3,
  invocationId: 'invocation',
  attemptId: 'attempt',
  stageKey: 'writer',
  schemaVersion: 2,
  payload: { prompt: 'stable' },
};
const billable: ExecutorOutcome = {
  kind: 'billable',
  status: 'succeeded',
  providerRequestId: 'request',
  resultHash: 'hash',
  schemaVersion: 4,
  payload: { result: true },
  usage: { priceSnapshotId: 'price', inputTokens: 2, outputTokens: 3, providerCostMicroIdr: 5n },
};
const record = { id: 'attempt' } as never;

function setup(
  finalize: FinalizeAttemptResult = { kind: 'finalized', attempt: record, winner: 'selected' },
) {
  const workflow: WorkflowInvocationService = {
    beginAttempt: vi.fn(async () => ({
      kind: 'started',
      invocation: {} as never,
      attempt: record,
    })),
    finalizeAttempt: vi.fn(async () => finalize),
  };
  const appendSentinel = vi.fn(async () => undefined);
  const jobs: JobService = {
    withFencedPublish: vi.fn(async (_identity, callback) => {
      await callback({ appendSentinel });
      return { kind: 'published', job: {} as never };
    }),
  } as never;
  const executor = vi.fn(async () => billable);
  const validator = vi.fn(async () => ({ kind: 'valid' as const }));
  return { workflow, jobs, executor, validator, appendSentinel };
}

describe('three-phase attempt harness', () => {
  it('runs fresh selected winner in deterministic phase order and appends exact sentinel', async () => {
    const deps = setup();
    const events: string[] = [];
    const harness = createThreePhaseAttemptHarness({
      ...deps,
      instrument: (event) => events.push(event),
    });
    expect(await harness.run(input)).toMatchObject({ kind: 'published' });
    expect(events).toEqual([
      'tx-a:begin',
      'tx-a:commit',
      'executor:begin',
      'executor:end',
      'tx-b:begin',
      'tx-b:commit',
      'validator:begin',
      'validator:end',
      'tx-c:begin',
      'sentinel:append',
      'job:terminalize',
      'tx-c:commit',
    ]);
    expect(deps.appendSentinel).toHaveBeenCalledWith({
      aggregateType: 'workflow_invocation',
      aggregateId: 'invocation',
      eventType: 'workflow_attempt_validated',
      dedupeKey: 'workflow-attempt-validated:invocation:attempt',
      schemaVersion: 1,
      payload: {
        projectId: 'project',
        jobId: 'job',
        invocationId: 'invocation',
        attemptId: 'attempt',
        stageKey: 'writer',
        resultHash: 'hash',
      },
    });
    expect(deps.executor).toHaveBeenCalledOnce();
    expect(deps.validator).toHaveBeenCalledOnce();
  });

  it('does not rerun executor for already_started replay', async () => {
    const deps = setup();
    vi.mocked(deps.workflow.beginAttempt).mockResolvedValue({
      kind: 'already_started',
      invocation: {} as never,
      attempt: record,
    });
    expect(await createThreePhaseAttemptHarness(deps).run(input)).toEqual({
      kind: 'already_started',
    });
    expect(deps.executor).not.toHaveBeenCalled();
    expect(deps.workflow.finalizeAttempt).not.toHaveBeenCalled();
    expect(deps.validator).not.toHaveBeenCalled();
    expect(deps.jobs.withFencedPublish).not.toHaveBeenCalled();
  });

  it.each([
    [() => Promise.reject(new Error('offline')), 'threw'],
    [
      () =>
        Promise.resolve({
          kind: 'recoverable_no_response',
          reason: 'rejected',
          errorCode: 'provider_rejected',
        } as const),
      'rejected',
    ],
    [
      () =>
        Promise.resolve({
          kind: 'recoverable_no_response',
          reason: 'aborted',
          errorCode: 'aborted',
        } as const),
      'aborted',
    ],
  ])(
    'keeps attempt started and creates no fake usage for no response %#',
    async (execute, reason) => {
      const deps = setup();
      deps.executor.mockImplementation(execute);
      expect(await createThreePhaseAttemptHarness(deps).run(input)).toMatchObject({
        kind: 'recoverable_no_response',
        reason,
      });
      expect(deps.workflow.finalizeAttempt).not.toHaveBeenCalled();
      expect(deps.validator).not.toHaveBeenCalled();
    },
  );

  it('keeps executor and validator once when transaction callbacks retry internally', async () => {
    const deps = setup();
    let txCallbacks = 0;
    vi.mocked(deps.workflow.beginAttempt).mockImplementation(async () => {
      txCallbacks += 2;
      return { kind: 'started', invocation: {} as never, attempt: record };
    });
    vi.mocked(deps.workflow.finalizeAttempt).mockImplementation(async () => {
      txCallbacks += 2;
      return { kind: 'finalized', attempt: record, winner: 'selected' };
    });
    await createThreePhaseAttemptHarness(deps).run(input);
    expect(txCallbacks).toBe(4);
    expect(deps.executor).toHaveBeenCalledOnce();
    expect(deps.validator).toHaveBeenCalledOnce();
  });

  it('keeps immutable selected winner when CPU validation fails', async () => {
    const deps = setup();
    deps.validator.mockResolvedValue({ kind: 'invalid', errorCode: 'bad_shape' });
    expect(await createThreePhaseAttemptHarness(deps).run(input)).toEqual({
      kind: 'validation_failed',
      errorCode: 'bad_shape',
    });
    expect(deps.jobs.withFencedPublish).not.toHaveBeenCalled();
    expect(deps.workflow.finalizeAttempt).toHaveBeenCalledOnce();
  });

  it.each([
    'selected_replay',
    'already_won_by_other',
    'ineligible_owner',
    'cancelled',
    'project_tombstoned',
    'attempt_failed',
    'not_selected',
  ] as const)('validates only fresh selected winner: %s', async (winner) => {
    const deps = setup({ kind: 'finalized', attempt: record, winner });
    expect(await createThreePhaseAttemptHarness(deps).run(input)).toMatchObject({
      kind: 'finalized_without_publish',
      winner,
    });
    expect(deps.validator).not.toHaveBeenCalled();
  });
});

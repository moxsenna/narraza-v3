import type { CreditReservationRecord, GenerationJobRecord, JsonObject } from '../ports/types.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { resolveFundingModel, type ActionFundingModel } from './action-funding-policy.js';
import type { ConfirmQuoteResult, CreateConfirmationInput } from './confirmation-contract.js';

type RollbackResult = Extract<ConfirmQuoteResult, { readonly kind: 'conflict' }>;

class ConfirmationRollbackError extends Error {
  constructor(readonly result: RollbackResult) {
    super('Credit quote confirmation transaction must roll back');
    this.name = 'ConfirmationRollbackError';
  }
}

function jsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    );
  }
  const leftRecord = left as JsonObject;
  const rightRecord = right as JsonObject;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonEquals(leftRecord[key], rightRecord[key]),
    )
  );
}

function reservationMatchesInput(
  reservation: CreditReservationRecord,
  input: CreateConfirmationInput,
): reservation is CreditReservationRecord & { readonly jobId: string } {
  return (
    reservation.id === input.reservationId &&
    reservation.userId === input.userId &&
    reservation.projectId === input.projectId &&
    reservation.quoteId === input.quoteId &&
    reservation.confirmationRequestId === input.confirmationRequestId &&
    reservation.fundingModel === 'user_paid' &&
    reservation.jobId !== null &&
    reservation.jobId === input.jobId &&
    reservation.projectJobId === input.projectId
  );
}

function jobMatchesInput(
  job: GenerationJobRecord,
  reservation: CreditReservationRecord,
  input: CreateConfirmationInput,
): boolean {
  return (
    job.id === input.jobId &&
    job.projectId === input.projectId &&
    job.reservationId === reservation.id &&
    job.kind === input.jobKind &&
    job.bundleId === input.bundleId &&
    job.workflowPlanId === input.workflowPlanId &&
    jsonEquals(job.payload, input.payload)
  );
}

export function createCreditQuoteConfirmationService(unitOfWork: UnitOfWork) {
  return {
    async confirmQuote(input: CreateConfirmationInput): Promise<ConfirmQuoteResult> {
      let fundingModel: ActionFundingModel;
      try {
        fundingModel = resolveFundingModel(input.jobKind);
      } catch {
        return { kind: 'funding_model_violation', reason: 'unknown_kind' };
      }

      if (fundingModel !== 'user_paid') {
        return { kind: 'funding_model_violation', reason: 'known_ineligible_kind' };
      }

      try {
        return await unitOfWork.execute<ConfirmQuoteResult>(
          async (txPorts) => {
            await txPorts.creditBalance.serializeUserBalance(input.userId);

            const project = await txPorts.project.lockForUpdate(input.projectId);
            if (
              project === null ||
              project.deletedAt !== null ||
              project.ownerUserId !== input.userId ||
              project.status !== 'active'
            ) {
              return { kind: 'not_found' };
            }

            const quote = await txPorts.quote.confirmLock(
              input.userId,
              input.projectId,
              input.quoteId,
            );
            if (quote === null) return { kind: 'not_found' };

            const replay = await txPorts.creditReservation.findReplayByConfirmationRequestId(
              input.confirmationRequestId,
            );
            if (replay !== null) {
              if (
                quote.workflowPlanHash !== input.expectedWorkflowPlanHash ||
                quote.dependencyHash !== input.expectedDependencyHash ||
                !reservationMatchesInput(replay, input)
              ) {
                return { kind: 'conflict' };
              }

              const job = await txPorts.job.findById({
                projectId: input.projectId,
                jobId: replay.jobId,
              });
              if (job === null || !jobMatchesInput(job, replay, input)) {
                return { kind: 'conflict' };
              }
              return { kind: 'exact_replay', reservation: replay, job };
            }

            if (quote.consumedAt !== null) return { kind: 'already_consumed' };

            const operationalNow = await txPorts.dbOperationalNow();
            if (quote.expiresAt <= operationalNow) return { kind: 'expired' };
            if (quote.maxAmountMicroIdr <= 0n) {
              return { kind: 'invalid_quote_amount', amount: quote.maxAmountMicroIdr };
            }
            if (quote.workflowPlanHash !== input.expectedWorkflowPlanHash) {
              return { kind: 'hash_mismatch', field: 'workflowPlanHash' };
            }
            if (quote.dependencyHash !== input.expectedDependencyHash) {
              return { kind: 'hash_mismatch', field: 'dependencyHash' };
            }

            const snapshot = await txPorts.creditBalance.getBalanceSnapshot(input.userId);
            const availableMicroIdr =
              snapshot.bookMicroIdr - snapshot.heldMicroIdr - snapshot.reconcilingMicroIdr;
            if (availableMicroIdr < quote.maxAmountMicroIdr) {
              return { kind: 'insufficient_credit' };
            }

            const consumeResult = await txPorts.quote.consumeQuote(
              input.quoteId,
              input.expectedWorkflowPlanHash,
              input.expectedDependencyHash,
            );
            switch (consumeResult.kind) {
              case 'consumed':
                break;
              case 'expired':
                return { kind: 'expired' };
              case 'not_found':
                return { kind: 'not_found' };
              case 'already_consumed':
                return { kind: 'already_consumed' };
              case 'hash_mismatch':
                return { kind: 'conflict' };
            }

            const created = await txPorts.creditReservation.create({
              id: input.reservationId,
              userId: input.userId,
              projectId: input.projectId,
              quoteId: input.quoteId,
              confirmationRequestId: input.confirmationRequestId,
              reservedMicroIdr: quote.maxAmountMicroIdr,
              exposureMicroIdr: quote.maxAmountMicroIdr,
            });
            if (created.kind === 'conflict') {
              throw new ConfirmationRollbackError({ kind: 'conflict' });
            }

            const inserted = await txPorts.job.insert({
              id: input.jobId,
              projectId: input.projectId,
              kind: input.jobKind,
              fundingModel: 'user_paid',
              priority: 0,
              availableInMs: 0,
              retryOfJobId: null,
              bundleId: input.bundleId,
              workflowPlanId: input.workflowPlanId,
              reservationId: created.reservation.id,
              schemaVersion: 1,
              payload: input.payload,
            });
            if (inserted.kind !== 'inserted') {
              throw new ConfirmationRollbackError({ kind: 'conflict' });
            }

            const boundReservation =
              await txPorts.creditReservation.findReplayByConfirmationRequestId(
                input.confirmationRequestId,
              );
            if (
              boundReservation === null ||
              !reservationMatchesInput(boundReservation, input) ||
              !jobMatchesInput(inserted.job, boundReservation, input)
            ) {
              throw new ConfirmationRollbackError({ kind: 'conflict' });
            }

            return {
              kind: 'confirmed',
              reservation: boundReservation,
              job: inserted.job,
            };
          },
          {
            isolation: 'read_committed',
            requestId: input.confirmationRequestId,
          },
        );
      } catch (error) {
        if (error instanceof ConfirmationRollbackError) return error.result;
        throw error;
      }
    },
  };
}

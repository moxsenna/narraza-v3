import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { CreateConfirmationInput, ConfirmQuoteResult } from './confirmation-contract.js';
import { resolveFundingModel, type ActionFundingModel } from './action-funding-policy.js';

export function createCreditQuoteConfirmationService(unitOfWork: UnitOfWork) {
  return {
    async confirmQuote(input: CreateConfirmationInput): Promise<ConfirmQuoteResult> {
      // Validation 1: Pure funding-model admission check (before UoW or any DB IO)
      let fundingModel: ActionFundingModel;
      try {
        fundingModel = resolveFundingModel(input.jobKind);
      } catch {
        return { kind: 'funding_model_violation', reason: 'unknown_kind' };
      }

      if (fundingModel !== 'user_paid') {
        return { kind: 'funding_model_violation', reason: 'unknown_kind' };
      }

      return await unitOfWork.execute<ConfirmQuoteResult>(async (txPorts) => {
        // FROZEN LOCK ORDER #1: USER BALANCE SERIALIZATION
        await txPorts.creditBalance.serializeUserBalance(input.userId);

        // FROZEN LOCK ORDER #2: PROJECT LOCK & VALIDATION
        const project = await txPorts.project.lockForUpdate(input.projectId);
        if (project === null || project.deletedAt !== null) {
          return { kind: 'not_found' };
        }

        // Validate project owner (non-enumerating)
        if (project.ownerUserId !== input.userId) {
          return { kind: 'not_found' };
        }

        // Project must be active
        if (project.status !== 'active') {
          return { kind: 'not_found' };
        }

        // FROZEN LOCK ORDER #3: QUOTE LOCK FOR UPDATE
        const quote = await txPorts.quote.confirmLock(input.userId, input.projectId, input.quoteId);

        if (quote === null) {
          return { kind: 'not_found' };
        }

        // Check if already consumed
        if (quote.consumedAt !== null) {
          return { kind: 'already_consumed' };
        }

        // Check expiry using PostgreSQL clock_timestamp() comparison (done via SQL in next step)
        // For now, we'll validate after getting full quote details

        // FROZEN LOCK ORDER #4: REPLAY FIRST (Idempotency Gate)
        const existingReservation =
          await txPorts.creditReservation.findReplayByConfirmationRequestId(
            input.confirmationRequestId,
          );

        if (existingReservation !== null) {
          // Must match the same quote
          if (existingReservation.quoteId !== input.quoteId) {
            // Divergent replay - should not happen due to unique constraint, but handle it
            return { kind: 'conflict' };
          }

          // Find the job associated with this reservation
          const job = await txPorts.job.findById({
            projectId: input.projectId,
            jobId: existingReservation.id as string, // Use reservation ID as job ID reference
          });

          if (job === null) {
            // Reservation exists but job doesn't - data integrity issue
            return { kind: 'conflict' };
          }

          return {
            kind: 'exact_replay',
            reservation: existingReservation,
            job,
          };
        }

        // FROZEN LOCK ORDER #5: LIVE QUOTE VALIDATION

        // Check consumed state again (double-safety)
        if (quote.consumedAt !== null) {
          return { kind: 'already_consumed' };
        }

        // Check expiry using PostgreSQL clock_timestamp()
        // Validate expires_at is still in the future
        const now = await txPorts.dbNow();
        if (quote.expiresAt <= now) {
          return { kind: 'expired' };
        }

        // Check maxAmountMicroIdr > 0
        if (quote.maxAmountMicroIdr <= 0n) {
          return { kind: 'invalid_quote_amount', amount: quote.maxAmountMicroIdr };
        }

        // Check workflow_plan_hash exact match
        if (quote.workflowPlanHash !== input.expectedWorkflowPlanHash) {
          return { kind: 'hash_mismatch', field: 'workflowPlanHash' };
        }

        // Check dependency_hash exact match
        if (quote.dependencyHash !== input.expectedDependencyHash) {
          return { kind: 'hash_mismatch', field: 'dependencyHash' };
        }

        // FROZEN LOCK ORDER #6: BALANCE SNAPSHOT
        const snapshot = await txPorts.creditBalance.getBalanceSnapshot(input.userId);
        const availableMicroIdr =
          snapshot.bookMicroIdr - snapshot.heldMicroIdr - snapshot.reconcilingMicroIdr;

        if (availableMicroIdr < quote.maxAmountMicroIdr) {
          return { kind: 'insufficient_credit' };
        }

        // FROZEN LOCK ORDER #7: CONSUME QUOTE CAS
        const consumeResult = await txPorts.quote.consumeQuote(
          input.quoteId,
          input.expectedWorkflowPlanHash,
          input.expectedDependencyHash,
        );

        switch (consumeResult.kind) {
          case 'consumed':
            // Proceed with reservation creation
            break;
          case 'not_found':
          case 'already_consumed':
            return { kind: 'already_consumed' };
          case 'hash_mismatch':
            return { kind: 'hash_mismatch', field: 'workflowPlanHash' };
          default: {
            const _never: never = consumeResult;
            return _never;
          }
        }

        // FROZEN LOCK ORDER #8: CREATE USER-PAID RESERVATION
        const reservationId = txPorts.allocateId();
        const createResult = await txPorts.creditReservation.create({
          id: reservationId,
          userId: input.userId,
          projectId: input.projectId,
          quoteId: input.quoteId,
          confirmationRequestId: input.confirmationRequestId,
          reservedMicroIdr: quote.maxAmountMicroIdr,
          exposureMicroIdr: quote.maxAmountMicroIdr,
        });

        switch (createResult.kind) {
          case 'created': {
            const reservation = createResult.reservation;

            // FROZEN LOCK ORDER #9: CREATE + BIND JOB
            const jobId = txPorts.allocateId();

            const inserted = await txPorts.job.insert({
              id: jobId,
              projectId: input.projectId,
              kind: input.jobKind,
              fundingModel: 'user_paid',
              priority: 0,
              availableInMs: 0,
              retryOfJobId: null,
              bundleId: input.bundleId,
              workflowPlanId: input.workflowPlanId,
              reservationId: reservation.id,
              schemaVersion: 1,
              payload: input.payload,
            });

            switch (inserted.kind) {
              case 'inserted':
                return {
                  kind: 'confirmed',
                  reservation,
                  job: inserted.job,
                };
              case 'binding_invalid':
              case 'funding_model_mismatch':
                // Rollback would happen automatically on transaction failure
                return { kind: 'conflict' };
              case 'conflict':
                return { kind: 'conflict' };
              default: {
                const _never: never = inserted;
                return _never;
              }
            }
          }
          case 'conflict': {
            // Concurrent reservation created - treat as replay
            const replayReservation =
              await txPorts.creditReservation.findReplayByConfirmationRequestId(
                input.confirmationRequestId,
              );

            if (replayReservation === null) {
              return { kind: 'conflict' };
            }

            const replayJob = await txPorts.job.findById({
              projectId: input.projectId,
              jobId: replayReservation.id as string,
            });

            if (replayJob === null) {
              return { kind: 'conflict' };
            }

            return {
              kind: 'exact_replay',
              reservation: replayReservation,
              job: replayJob,
            };
          }
          default: {
            const _never: never = createResult;
            return _never;
          }
        }
      });
    },
  };
}

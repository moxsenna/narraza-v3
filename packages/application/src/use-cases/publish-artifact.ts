/**
 * Publish artifact accept (W5.3). Accepts one pending ArtifactProposal and
 * materializes immutable PublishArtifact rows (text/markdown/html) derived
 * from the bound accepted prose version. Deliberately does NOT create a
 * change set and does NOT bump the canonical version: publish packages are
 * derived content, never canon (verification-matrix: publish-artifact).
 *
 * Preconditions enforced server-side:
 *  - the artifact proposal's prose version is the beat's accepted one;
 *  - the artifact proposal is still pending (CAS accepted);
 *  - artifact types are deterministic projections of the prose content.
 */
import { dependency } from '@narraza/core';
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { PublishArtifactRecord } from '../ports/artifact-repo.js';

const { sha256Hex } = dependency;

export interface PublishArtifactInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly artifactProposalId: string;
  readonly requestId?: string;
}

export interface PublishArtifactOutput {
  readonly artifacts: readonly PublishArtifactRecord[];
  /** Always equals the project's unchanged canonical version. */
  readonly canonicalVersionAfter: number;
}

const ARTIFACT_TYPES = ['text', 'markdown'] as const;

export function createPublishArtifact(
  uow: UnitOfWork,
): (input: PublishArtifactInput) => Promise<Result<PublishArtifactOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        if (!ports.artifactProposal) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const artifactProposal = await ports.artifactProposal.findById(
          input.projectId,
          input.artifactProposalId,
        );
        if (!artifactProposal) {
          throw asDomain(appError('NOT_FOUND', 'msg.artifact.not_found', 404));
        }
        if (artifactProposal.status !== 'pending') {
          throw asDomain(appError('CONFLICT', 'msg.artifact.not_pending', 409));
        }
        if (!ports.proseVersion) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const proseVersion = await ports.proseVersion.findById(
          input.projectId,
          artifactProposal.proseVersionId,
        );
        if (!proseVersion) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.version_not_found', 404));
        }
        // Publish only from the beat's ACCEPTED prose.
        const beat = await ports.outline.findBeat(input.projectId, proseVersion.beatId);
        if (!beat) throw asDomain(appError('NOT_FOUND', 'msg.outline.beat_not_found', 404));
        if (beat.acceptedProseVersionId !== proseVersion.id) {
          throw asDomain(appError('CONFLICT', 'msg.artifact.prose_not_accepted', 409));
        }

        // CAS: only one concurrent publish wins.
        const accepted = await ports.artifactProposal.setAccepted(
          input.projectId,
          artifactProposal.id,
        );
        if (!accepted) {
          throw asDomain(appError('CONFLICT', 'msg.artifact.not_pending', 409));
        }

        const artifacts: PublishArtifactRecord[] = [];
        for (const artifactType of ARTIFACT_TYPES) {
          const content = renderArtifact(artifactType, proseVersion.content);
          const existing = await ports.artifactProposal.listArtifacts(
            input.projectId,
            artifactProposal.id,
          );
          if (existing.some((a) => a.artifactType === artifactType)) continue;
          const inserted = await ports.artifactProposal.insertArtifact({
            id: ports.allocateId(),
            projectId: input.projectId,
            artifactProposalId: artifactProposal.id,
            proseVersionId: proseVersion.id,
            artifactType,
            contentHash: sha256Hex(content),
            payload: {
              schemaVersion: 1,
              generatedAt: 'tx',
            },
          });
          artifacts.push(inserted);
        }

        const now = await ports.dbNow();
        await ports.audit.append({
          userId: input.ownerUserId,
          action: 'artifact.published',
          entityType: 'artifact_proposal',
          entityId: artifactProposal.id,
          metadata: {
            proseVersionId: proseVersion.id,
            artifactTypes: artifacts.map((a) => a.artifactType),
          },
        });
        await ports.outbox.append({
          id: ports.allocateId(),
          aggregateType: 'artifact_proposal',
          aggregateId: artifactProposal.id,
          eventType: 'artifact.published',
          dedupeKey: `artifact:${artifactProposal.id}:published`,
          occurredAt: now,
          payload: {
            projectId: input.projectId,
            proseVersionId: proseVersion.id,
            canonicalVersionAfter: project.currentCanonicalVersion,
            requestId: input.requestId ?? null,
          },
        });

        return {
          artifacts,
          // Invariant: publish never bumps canon.
          canonicalVersionAfter: project.currentCanonicalVersion,
        };
      });
      return ok(outcome);
    } catch (e) {
      if (typeof e === 'object' && e !== null && '__domain' in e) {
        return err((e as DomainError).error);
      }
      throw e;
    }
  };
}

function renderArtifact(artifactType: string, prose: string): string {
  if (artifactType === 'markdown') {
    return `${prose.trim()}\n`;
  }
  return prose;
}

class DomainError extends Error {
  readonly __domain = true as const;
  constructor(readonly error: AppError) {
    super(error.publicMessageCode);
  }
}

function asDomain(error: AppError): DomainError {
  return new DomainError(error);
}

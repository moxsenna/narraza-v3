/**
 * Safe Repair orchestration (W5.2).
 * - Directives are built ONLY from the CURRENT persisted validation report
 *   bound to (proseVersionId, proseContentHash, policyVersion). Stale report
 *   (draft edited after validation) → VALIDATION_STALE, no packet.
 * - Directive fields are sanitized: { findingKey, publicMessageCode,
 *   instruction, location? }. Instruction text is a STATIC server-authored
 *   string per message-code family — never finding content, never model
 *   output. buildRepairPacket enforces the exact-key writer_safe shape.
 * - Stop conditions come from core decideRepairStop over previous vs current
 *   blockers. Repair NEVER auto-accepts: output is a repair packet for the
 *   existing M4 safe_repair prep flow; the repaired text returns as a new
 *   candidate → seed draft → snapshot ProseVersion + Proposal via W5.3.
 */
import {
  context as coreContext,
  prose as coreProse,
  type context as contextNs,
} from '@narraza/core';
type RepairDirective = contextNs.RepairDirective;
const { buildRepairPacket } = coreContext;
const { decideRepairStop } = coreProse;
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ValidationFindingRecord } from '../ports/validation-repo.js';
import { M5_VALIDATION_POLICY_VERSION } from './prose-validation.js';

/**
 * Static server-authored repair instructions per public message-code family.
 * Writer-safe by construction: no finding content, no raw prose, no model text.
 */
const REPAIR_INSTRUCTIONS: Readonly<Record<string, string>> = {
  'validation.prose.empty': 'Tulis isi adegan sesuai tujuan beat; jangan kosong.',
  'validation.character.required_missing':
    'Hadirkah karakter wajib secara natural dalam adegan.',
  'validation.character.semantic_review':
    'Perkuat kehadiran karakter wajib agar terbaca jelas.',
  'validation.fact.required_missing': 'Jalin fakta wajib ke dalam adegan secara natural.',
  'validation.fact.semantic_review': 'Perjelas fakta wajib agar terbaca dalam adegan.',
  'validation.directive.required_missing': 'Penuhi arahan pengarahan yang belum terpenuhi.',
  'validation.directive.semantic_review': 'Pertegas pemenuhan arahan pengarahan.',
  'validation.action.prohibited_present': 'Hapus aksi terlarang dari adegan.',
  'validation.action.semantic_review': 'Pastikan tidak ada aksi terlarang dalam adegan.',
  'validation.ending.required_missing': 'Tutup adegan sesuai persyaratan akhir.',
  'validation.ending.semantic_review': 'Pertegas penutup adegan.',
  'validation.length.out_of_range': 'Sesuaikan panjang naskah ke rentang yang diminta.',
  'validation.restricted.matched': 'Tulis ulang bagian terlarang tanpa menyebut materi terlarang.',
  'validation.restricted.suspected': 'Tulis ulang bagian mencurigakan tanpa materi terlarang.',
  'validation.restricted.semantic_review':
    'Tulis ulang agar tidak menyentuh materi terlarang.',
};
const FALLBACK_INSTRUCTION = 'Perbaiki adegan sesuai temuan validasi.';

export function repairInstructionFor(messageCode: string): string {
  return REPAIR_INSTRUCTIONS[messageCode] ?? FALLBACK_INSTRUCTION;
}

const SEVERITY_SCORE: Readonly<Record<string, number>> = {
  info: 0,
  warning: 1,
  error: 2,
  blocking: 3,
};

export function severityScoreFor(severity: string): number {
  return SEVERITY_SCORE[severity] ?? 0;
}

/** Sanitized directive projection of one persisted finding. */
export function toRepairDirective(finding: ValidationFindingRecord): RepairDirective {
  return Object.freeze({
    findingKey: finding.id,
    publicMessageCode: finding.message,
    instruction: repairInstructionFor(finding.message),
  });
}

export interface PreviousRepairAttempt {
  readonly blockers: readonly {
    readonly ruleKey: string;
    readonly severityScore: number;
  }[];
  readonly completedAttempts: number;
}

export interface RequestSafeRepairInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly proseVersionId: string;
  /** Blockers from the previous repair attempt, if any (stop-condition input). */
  readonly previous?: PreviousRepairAttempt;
  readonly maxAttempts?: number;
}

export interface RequestSafeRepairOutput {
  readonly packet: contextNs.RepairContextPacket;
  readonly directives: readonly RepairDirective[];
  readonly reportId: string;
  readonly stop: { readonly reason: string; readonly shouldStop: boolean };
}

const DEFAULT_MAX_ATTEMPTS = 3;

export function createRequestSafeRepair(
  uow: UnitOfWork,
): (input: RequestSafeRepairInput) => Promise<Result<RequestSafeRepairOutput, AppError>> {
  return async (input) => {
    try {
      const outcome = await uow.execute(async (ports) => {
        if (!ports.proseVersion || !ports.validationReport || !ports.validationFinding) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const version = await ports.proseVersion.findById(input.projectId, input.proseVersionId);
        if (!version) throw asDomain(appError('NOT_FOUND', 'msg.prose.version_not_found', 404));

        const policyVersion = M5_VALIDATION_POLICY_VERSION;
        const report = await ports.validationReport.findCurrent(
          input.projectId,
          version.id,
          version.contentHash,
          policyVersion,
        );
        // No current report: either never validated or draft edited after
        // validation (hash changed). Never repair against a stale binding.
        if (!report) {
          throw asDomain(appError('CONFLICT', 'msg.validation.stale', 409));
        }
        const findings = await ports.validationFinding.listByReport(input.projectId, report.id);
        // Only undecided blocking findings drive repair; overridden findings
        // are operator-accepted and must not be repaired.
        const blockers = findings.filter(
          (f) => f.severity === 'blocking' && f.overrideStatus === null,
        );
        if (blockers.length === 0) {
          throw asDomain(appError('VALIDATION', 'msg.validation.nothing_to_repair', 422));
        }

        const directives = blockers.map(toRepairDirective);
        const beat = await ports.outline.findBeat(input.projectId, version.beatId);
        if (!beat) throw asDomain(appError('NOT_FOUND', 'msg.outline.beat_not_found', 404));

        const packet = buildRepairPacket({
          kind: 'repair',
          dataClass: 'writer_safe',
          metadata: {
            schemaVersion: 1,
            projectId: input.projectId,
            dependencyHash: version.contentHash,
            policyVersion: 'domain-core/v1',
          },
          repairableProse: {
            proseVersionId: version.id,
            beatId: version.beatId,
            content: version.content,
          },
          directives,
          beatContract: {
            beatId: version.beatId,
            purpose: resolveBeatPurpose(beat.payload, beat.title, version.beatId),
            sceneGoal: `Perbaiki adegan: ${beat.title || version.beatId}`,
            directives: [],
          },
          revealGuidance: [],
        });

        const currentBlockers = blockers.map((f) => ({
          ruleKey: f.ruleKey,
          location: null,
          severityScore: severityScoreFor(f.severity),
        }));
        // No baseline on the first attempt: stop conditions (regression /
        // no-progress / same-fingerprint) require a previous attempt to
        // compare against, so the first request always continues.
        const stop =
          input.previous === undefined
            ? { reason: 'continue', shouldStop: false }
            : decideRepairStop({
                previousBlockers: input.previous.blockers.map((b) => ({
                  ruleKey: b.ruleKey,
                  location: null,
                  severityScore: b.severityScore,
                })),
                currentBlockers,
                completedAttempts: input.previous.completedAttempts,
                maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
              });

        return { packet, directives, reportId: report.id, stop };
      });
      return ok(outcome);
    } catch (e) {
      if (e instanceof DomainError) return err(e.error);
      throw e;
    }
  };
}

function resolveBeatPurpose(payload: unknown, title: string, beatId: string): string {
  const raw =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>).purpose
      : undefined;
  const purpose = typeof raw === 'string' && raw.trim() ? raw.trim() : title.trim();
  return purpose || beatId;
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

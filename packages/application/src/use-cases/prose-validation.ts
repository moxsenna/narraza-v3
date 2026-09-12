/**
 * Prose validation binding + server-owned override (W5.2, R-M5.1/R-M5.2).
 * - Validation runs deterministic validators over server-loaded prose, merges
 *   via mergeFindings, persists an immutable report bound to
 *   (proseVersionId, proseContentHash, policyVersion).
 * - AI judge runs ONLY when the authoritative validation policy for the action
 *   requires it (initial M5: never — deterministic-only; judge path reuses M4
 *   machinery when a policy entry exists).
 * - Override authority is server-owned, versioned, default DENY. The initial
 *   M5 allowlist is EMPTY: no ruleKey is overrideable until an authoritative
 *   source marks one. UI must not offer override.
 */
import { validation as coreValidation, type validation as validationNs } from '@narraza/core';
type InternalValidationFinding = validationNs.InternalValidationFinding;
type PublicValidationFinding = validationNs.PublicValidationFinding;
const { mergeFindings, validateBeatStructure, VALIDATOR_POLICY_VERSION } = coreValidation;
import type { AppError } from '../errors.js';
import { appError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ValidationFindingRecord, ValidationReportRecord } from '../ports/validation-repo.js';

export const M5_VALIDATION_POLICY_VERSION: string = VALIDATOR_POLICY_VERSION;

/**
 * Server-owned override allowlist: (policyVersion, ruleKey) → allowed.
 * Initial M5: EMPTY. Entries require an authoritative source marking the rule
 * overrideable; never infer from severity/source/messageCode.
 */
const OVERRIDE_ALLOWLIST: ReadonlyMap<string, ReadonlySet<string>> = new Map();

export function isOverrideAllowed(policyVersion: string, ruleKey: string): boolean {
  return OVERRIDE_ALLOWLIST.get(policyVersion)?.has(ruleKey) ?? false;
}

export interface ValidateProseVersionInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly proseVersionId: string;
}

export interface ValidateProseVersionOutput {
  readonly report: ValidationReportRecord;
  readonly findings: readonly ValidationFindingRecord[];
}

export function createValidateProseVersion(
  uow: UnitOfWork,
): (input: ValidateProseVersionInput) => Promise<Result<ValidateProseVersionOutput, AppError>> {
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
        const existing = await ports.validationReport.findCurrent(
          input.projectId,
          version.id,
          version.contentHash,
          policyVersion,
        );
        if (existing) {
          const findings = await ports.validationFinding.listByReport(input.projectId, existing.id);
          return { report: existing, findings };
        }

        const beat = await ports.outline.findBeat(input.projectId, version.beatId);
        if (!beat) throw asDomain(appError('NOT_FOUND', 'msg.outline.beat_not_found', 404));

        const deterministic = runDeterministicValidators(
          version.beatId,
          resolveBeatPurpose(beat.payload, beat.title, version.beatId),
          version.content,
        );
        const merged = mergeFindings(deterministic, []);
        const passed = merged.passed && !merged.findings.some((f) => f.severity === 'blocking');
        const reportId = ports.allocateId();
        const report = await ports.validationReport.insert({
          id: reportId,
          projectId: input.projectId,
          proseVersionId: version.id,
          proseContentHash: version.contentHash,
          policyVersion,
          status: 'completed',
          passed,
        });
        await ports.validationFinding.insertMany(
          merged.findings.map((finding) => ({
            id: ports.allocateId(),
            projectId: input.projectId,
            reportId,
            proseVersionId: version.id,
            // SQL CHECK vocabulary: validator | human | system.
            source: 'validator',
            severity: finding.severity,
            ruleKey: finding.ruleKey,
            message: finding.publicMessageCode,
          })),
        );
        const findings = await ports.validationFinding.listByReport(input.projectId, reportId);
        return { report, findings };
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

function runDeterministicValidators(
  beatId: string,
  purpose: string,
  content: string,
): readonly InternalValidationFinding[] {
  const contract = {
    beatId,
    purpose,
    requiredCharacterIds: [],
    requiredFactKeys: [],
    requiredDirectives: [],
    prohibitedActions: [],
  };
  return validateBeatStructure({
    policyVersion: VALIDATOR_POLICY_VERSION,
    prose: content,
    contract,
    evidence: { characters: [], facts: [] },
  });
}

export interface PublicValidationView {
  readonly reportId: string;
  readonly proseVersionId: string;
  readonly policyVersion: string;
  readonly passed: boolean;
  readonly current: boolean;
  readonly findings: readonly PublicValidationFinding[];
  readonly availableActions: readonly string[];
}

export function toPublicValidationView(
  report: ValidationReportRecord,
  findings: readonly ValidationFindingRecord[],
  input: { current: boolean },
): PublicValidationView {
  // Public view must never re-derive identity hashes from persisted rows:
  // findingKey integrity is a core invariant (key must equal identity over
  // ruleKey+location+evidenceHash). Build the public projection directly.
  const publicFindings: PublicValidationFinding[] = findings.map((f) =>
    Object.freeze({
      findingKey: f.id,
      ruleKey: f.ruleKey,
      severity: f.severity as PublicValidationFinding['severity'],
      publicMessageCode: f.message,
    }),
  );
  const actions: string[] = [];
  if (input.current && findings.some((f) => isOverrideAllowed(report.policyVersion, f.ruleKey))) {
    actions.push('override');
  }
  return {
    reportId: report.id,
    proseVersionId: report.proseVersionId,
    policyVersion: report.policyVersion,
    passed: report.passed,
    current: input.current,
    findings: publicFindings,
    availableActions: actions,
  };
}

export interface OverrideFindingInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly reportId: string;
  readonly findingId: string;
  readonly reason: string;
}

export function createOverrideFinding(
  uow: UnitOfWork,
): (
  input: OverrideFindingInput,
) => Promise<Result<{ finding: ValidationFindingRecord }, AppError>> {
  return async (input) => {
    try {
      const reason = input.reason.trim();
      if (!reason) {
        throw asDomain(appError('VALIDATION', 'msg.validation.override_reason_required', 422));
      }
      const outcome = await uow.execute(async (ports) => {
        if (!ports.validationReport || !ports.validationFinding) {
          throw asDomain(appError('NOT_FOUND', 'msg.prose.unsupported', 500));
        }
        const project = await ports.project.findByIdForOwner(input.projectId, input.ownerUserId);
        if (!project) throw asDomain(appError('NOT_FOUND', 'msg.project.not_found', 404));
        const report = await ports.validationReport.findById(input.projectId, input.reportId);
        if (!report) throw asDomain(appError('NOT_FOUND', 'msg.validation.report_not_found', 404));
        const findings = await ports.validationFinding.listByReport(input.projectId, report.id);
        const target = findings.find((f) => f.id === input.findingId);
        if (!target) throw asDomain(appError('NOT_FOUND', 'msg.validation.finding_not_found', 404));
        if (!isOverrideAllowed(report.policyVersion, target.ruleKey)) {
          throw asDomain(appError('POLICY_DENIED', 'msg.validation.override_not_allowed', 403));
        }
        const updated = await ports.validationFinding.setOverride(
          input.projectId,
          report.id,
          target.id,
          { status: 'accepted', reason },
        );
        if (!updated) {
          throw asDomain(appError('CONFLICT', 'msg.validation.override_decided', 409));
        }
        return { finding: updated };
      });
      return ok(outcome);
    } catch (e) {
      if (e instanceof DomainError) return err(e.error);
      throw e;
    }
  };
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

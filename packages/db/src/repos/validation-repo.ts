import type {
  ValidationFindingInsertInput,
  ValidationFindingRecord,
  ValidationFindingRepo,
  ValidationReportInsertInput,
  ValidationReportRecord,
  ValidationReportRepo,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const REPORT_SELECT = {
  id: true,
  projectId: true,
  proseVersionId: true,
  proseContentHash: true,
  policyVersion: true,
  status: true,
  passed: true,
} as const;

const FINDING_SELECT = {
  id: true,
  projectId: true,
  reportId: true,
  proseVersionId: true,
  source: true,
  severity: true,
  ruleKey: true,
  message: true,
  overrideStatus: true,
  overrideReason: true,
} as const;

type ReportRow = {
  id: string;
  projectId: string;
  proseVersionId: string;
  proseContentHash: string;
  policyVersion: string;
  status: string;
  passed: boolean;
};

type FindingRow = {
  id: string;
  projectId: string;
  reportId: string;
  proseVersionId: string;
  source: string;
  severity: string;
  ruleKey: string;
  message: string;
  overrideStatus: string | null;
  overrideReason: string | null;
};

function toReport(row: ReportRow): ValidationReportRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    proseVersionId: row.proseVersionId,
    proseContentHash: row.proseContentHash,
    policyVersion: row.policyVersion,
    status: row.status,
    passed: row.passed,
  };
}

function toFinding(row: FindingRow): ValidationFindingRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    reportId: row.reportId,
    proseVersionId: row.proseVersionId,
    source: row.source,
    severity: row.severity,
    ruleKey: row.ruleKey,
    message: row.message,
    overrideStatus: row.overrideStatus,
    overrideReason: row.overrideReason,
  };
}

export function createValidationReportRepo(tx: TxClient): ValidationReportRepo {
  return {
    async insert(input: ValidationReportInsertInput): Promise<ValidationReportRecord> {
      const row = await tx.validationReport.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          proseVersionId: input.proseVersionId,
          proseContentHash: input.proseContentHash,
          policyVersion: input.policyVersion,
          status: input.status,
          passed: input.passed,
          payload: (input.payload ?? {}) as never,
        },
        select: REPORT_SELECT,
      });
      return toReport(row);
    },

    async findCurrent(projectId, proseVersionId, proseContentHash, policyVersion) {
      const row = await tx.validationReport.findFirst({
        where: { projectId, proseVersionId, proseContentHash, policyVersion },
        orderBy: { createdAt: 'desc' },
        select: REPORT_SELECT,
      });
      return row ? toReport(row) : null;
    },

    async findById(projectId, id): Promise<ValidationReportRecord | null> {
      const row = await tx.validationReport.findUnique({
        where: { projectId, id },
        select: REPORT_SELECT,
      });
      return row ? toReport(row) : null;
    },
  };
}

export function createValidationFindingRepo(tx: TxClient): ValidationFindingRepo {
  return {
    async insertMany(inputs: readonly ValidationFindingInsertInput[]): Promise<number> {
      if (inputs.length === 0) return 0;
      const result = await tx.validationFinding.createMany({
        data: inputs.map((input) => ({
          id: input.id,
          projectId: input.projectId,
          reportId: input.reportId,
          proseVersionId: input.proseVersionId,
          source: input.source,
          severity: input.severity,
          ruleKey: input.ruleKey,
          message: input.message,
          payload: (input.payload ?? {}) as never,
        })),
      });
      return result.count;
    },

    async listByReport(projectId, reportId): Promise<readonly ValidationFindingRecord[]> {
      const rows = await tx.validationFinding.findMany({
        where: { projectId, reportId },
        select: FINDING_SELECT,
      });
      return rows.map(toFinding);
    },

    async setOverride(projectId, reportId, findingId, input) {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE validation_findings
            SET override_status = $4, override_reason = $5
          WHERE project_id = $1 AND report_id = $2 AND id = $3
            AND override_status IS NULL
          RETURNING id, project_id AS "projectId", report_id AS "reportId",
                    prose_version_id AS "proseVersionId", source, severity,
                    rule_key AS "ruleKey", message,
                    override_status AS "overrideStatus",
                    override_reason AS "overrideReason"`,
        projectId,
        reportId,
        findingId,
        input.status,
        input.reason,
      )) as FindingRow[];
      const row = rows[0];
      return row ? toFinding(row) : null;
    },
  };
}

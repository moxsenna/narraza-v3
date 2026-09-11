export interface ValidationReportRecord {
  readonly id: string;
  readonly projectId: string;
  readonly proseVersionId: string;
  readonly proseContentHash: string;
  readonly policyVersion: string;
  readonly status: string;
  readonly passed: boolean;
}

export interface ValidationFindingRecord {
  readonly id: string;
  readonly projectId: string;
  readonly reportId: string;
  readonly proseVersionId: string;
  readonly source: string;
  readonly severity: string;
  readonly ruleKey: string;
  readonly message: string;
  readonly overrideStatus: string | null;
  readonly overrideReason: string | null;
}

export interface ValidationReportInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly proseVersionId: string;
  readonly proseContentHash: string;
  readonly policyVersion: string;
  readonly status: string;
  readonly passed: boolean;
  readonly payload?: { readonly [key: string]: unknown };
}

export interface ValidationFindingInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly reportId: string;
  readonly proseVersionId: string;
  readonly source: string;
  readonly severity: string;
  readonly ruleKey: string;
  readonly message: string;
  readonly payload?: { readonly [key: string]: unknown };
}

export interface ValidationReportRepo {
  insert(input: ValidationReportInsertInput): Promise<ValidationReportRecord>;
  findCurrent(
    projectId: string,
    proseVersionId: string,
    proseContentHash: string,
    policyVersion: string,
  ): Promise<ValidationReportRecord | null>;
  findById(projectId: string, id: string): Promise<ValidationReportRecord | null>;
}

export interface ValidationFindingRepo {
  insertMany(inputs: readonly ValidationFindingInsertInput[]): Promise<number>;
  listByReport(projectId: string, reportId: string): Promise<readonly ValidationFindingRecord[]>;
  setOverride(
    projectId: string,
    reportId: string,
    findingId: string,
    input: { status: string; reason: string },
  ): Promise<ValidationFindingRecord | null>;
}

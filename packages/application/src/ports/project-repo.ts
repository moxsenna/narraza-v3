import type { ProjectRecord } from './types.js';

export interface ProjectInsertInput {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly intakePath: string;
  readonly status: string;
}

export interface ProjectRepo {
  insert(input: ProjectInsertInput): Promise<ProjectRecord>;
  findByIdForOwner(projectId: string, ownerUserId: string): Promise<ProjectRecord | null>;
  listByOwner(ownerUserId: string): Promise<readonly ProjectRecord[]>;
  /** SELECT … FOR UPDATE on the project row (must run inside a transaction). */
  lockForUpdate(projectId: string): Promise<ProjectRecord | null>;
  /**
   * Conditional bump: WHERE id = projectId AND current_canonical_version = expectedVersion.
   * Returns new version, or null if CAS missed.
   */
  bumpCanonicalVersion(projectId: string, expectedVersion: number): Promise<number | null>;
}

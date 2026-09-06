import 'server-only';

import {
  createCreditSummaryService,
  type CreditSummaryView,
  type FoundationRecord,
  type GenerationJobRecord,
  type IntakeMessageRecord,
  type IntakeSessionRecord,
  type M4ArtifactProposalView,
  type M4CandidateGroupView,
  type M4ConceptSetView,
  type M4ProseVersionView,
  type OutlineNodeRecord,
  type ProjectRecord,
} from '@narraza/application';
import { getMyProject } from './queries';
import { getUnitOfWork } from './uow';

/** The M4 exit-gate vertical exercises these workflow kinds, in order. */
export const M4_VERTICAL_WORKFLOW_KINDS = [
  'chat_intake_reply',
  'concept_generation',
  'foundation_generation',
  'outline_generation',
  'beat_write_judge',
  'safe_repair',
  'publish_package',
] as const;

export type M4VerticalWorkflowKind = (typeof M4_VERTICAL_WORKFLOW_KINDS)[number];

export interface M4JobStateView {
  readonly active: GenerationJobRecord | null;
  readonly terminal: GenerationJobRecord | null;
}

export interface M4VerticalView {
  readonly project: ProjectRecord;
  readonly creditSummary: CreditSummaryView;
  readonly intakeSession: IntakeSessionRecord | null;
  readonly intakeMessages: readonly IntakeMessageRecord[];
  readonly foundation: FoundationRecord | null;
  readonly outline: readonly OutlineNodeRecord[];
  readonly conceptSet: M4ConceptSetView | null;
  readonly candidateGroups: Readonly<Record<M4VerticalWorkflowKind, M4CandidateGroupView | null>>;
  readonly artifactProposal: M4ArtifactProposalView | null;
  readonly proseVersion: M4ProseVersionView | null;
  readonly jobs: Readonly<Record<M4VerticalWorkflowKind, M4JobStateView>>;
}

async function requireActiveProject(projectId: string): Promise<ProjectRecord | null> {
  return getMyProject(projectId);
}

/**
 * Server-assembled observation state for the M4 dev/mock vertical. Everything
 * is derived from real persisted product state (intake thread, foundation,
 * outline nodes, M4 published projections, jobs) — no fixture state.
 */
export async function getM4VerticalView(projectId: string): Promise<M4VerticalView | null> {
  const project = await requireActiveProject(projectId);
  if (!project) return null;

  const unitOfWork = getUnitOfWork();
  const creditSummary = await createCreditSummaryService(unitOfWork).getSummary({
    userId: project.ownerUserId,
  });

  return unitOfWork.execute(async (ports) => {
    const intakeSession = await ports.intake.findSessionByProject(projectId);
    const intakeMessages = intakeSession
      ? await ports.intake.listMessages(projectId, intakeSession.id)
      : [];
    const foundation = await ports.foundation.findByProjectId(projectId);
    const outline = await ports.outline.listByProject(projectId);

    const m4Read = ports.m4ProductRead;
    if (!m4Read) throw new Error('M4 vertical view: m4ProductRead port not configured');
    const conceptSet = await m4Read.findLatestConceptSet(projectId);
    const candidateGroups = {
      chat_intake_reply: null,
      concept_generation: null,
      foundation_generation: await m4Read.findLatestCandidateGroup(
        projectId,
        'foundation_generation',
      ),
      outline_generation: await m4Read.findLatestCandidateGroup(projectId, 'outline_generation'),
      beat_write_judge: await m4Read.findLatestCandidateGroup(projectId, 'beat_write_judge'),
      safe_repair: await m4Read.findLatestCandidateGroup(projectId, 'safe_repair'),
      publish_package: null,
    };
    const artifactProposal = await m4Read.findLatestArtifactProposal(projectId);
    const proseVersion = await m4Read.findLatestProseVersion(projectId);

    const activeJobs = await ports.job.listActiveByProject(projectId);
    const jobs = {} as Record<M4VerticalWorkflowKind, M4JobStateView>;
    for (const kind of M4_VERTICAL_WORKFLOW_KINDS) {
      const active = activeJobs.find((job) => job.kind === kind) ?? null;
      const terminal = await ports.job.findLatestTerminalByProject({
        projectId,
        kind,
        payloadFilter: {},
      });
      jobs[kind] = { active, terminal };
    }

    return {
      project,
      creditSummary,
      intakeSession,
      intakeMessages,
      foundation,
      outline,
      conceptSet,
      candidateGroups,
      artifactProposal,
      proseVersion,
      jobs,
    };
  });
}

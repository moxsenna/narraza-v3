import type {
  JsonObject,
  M4ProductOutputPort,
  PublishM4ProductOutputInput,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const AUTHORITATIVE_WORKFLOWS = new Set([
  'chat_intake_reply',
  'concept_generation',
  'foundation_generation',
  'character_generation',
  'outline_generation',
  'beat_write_judge',
  'safe_repair',
  'publish_package',
]);

function requiredString(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`M4 product projection requires job payload '${key}'`);
  }
  return value;
}

function outputFor(input: PublishM4ProductOutputInput, stageKey: string): JsonObject {
  const direct = input.stageOutputs[stageKey];
  const repaired = input.stageOutputs[`${stageKey}_parse_repair`];
  const output = repaired ?? direct;
  if (!output) throw new Error(`M4 product projection missing successful '${stageKey}' output`);
  return output;
}

function deterministicId(jobId: string, suffix: string): string {
  return `m4:${jobId}:${suffix}`;
}

async function assertExactBindings(
  tx: TxClient,
  input: PublishM4ProductOutputInput,
): Promise<void> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT j.kind, j.payload, p.plan_hash, b.dependency_hash
       FROM generation_jobs j
       JOIN ai_workflow_plans p
         ON p.project_id = j.project_id AND p.id = j.workflow_plan_id
       JOIN generation_context_bundles b
         ON b.project_id = j.project_id AND b.id = j.bundle_id
      WHERE j.project_id = $1 AND j.id = $2 AND j.payload = $3::jsonb
      LIMIT 1`,
    input.projectId,
    input.jobId,
    JSON.stringify(input.jobPayload),
  )) as Array<{
    kind: string;
    payload: JsonObject;
    plan_hash: string;
    dependency_hash: string;
  }>;
  const binding = rows[0];
  if (!binding) throw new Error('M4 product projection job/plan/bundle binding missing');
  if (
    binding.kind !== input.workflowKind ||
    binding.plan_hash !== requiredString(input.jobPayload, 'workflowPlanHash') ||
    binding.dependency_hash !== input.dependencyHash ||
    binding.dependency_hash !== requiredString(input.jobPayload, 'dependencyHash')
  ) {
    throw new Error('M4 product projection exact binding mismatch');
  }
}

async function publishIntake(tx: TxClient, input: PublishM4ProductOutputInput): Promise<void> {
  const output = outputFor(input, 'intake_reply');
  const reply = requiredString(output, 'reply');
  const intakeSessionId = requiredString(input.jobPayload, 'intakeSessionId');
  const sessions = (await tx.$queryRawUnsafe(
    `SELECT id FROM intake_sessions
      WHERE project_id = $1 AND id = $2
      FOR UPDATE`,
    input.projectId,
    intakeSessionId,
  )) as Array<{ id: string }>;
  if (!sessions[0]) throw new Error('M4 intake projection session binding missing');

  const messageId = deterministicId(input.jobId, 'intake-response');
  await tx.$executeRawUnsafe(
    `INSERT INTO intake_messages
       (id, project_id, intake_session_id, role, sequence, content, job_id, created_at)
     SELECT $1, $2, $3, 'assistant',
            COALESCE(MAX(sequence), -1) + 1, $4, $5, now()
       FROM intake_messages
      WHERE intake_session_id = $3
     ON CONFLICT (id) DO NOTHING`,
    messageId,
    input.projectId,
    intakeSessionId,
    reply,
    input.jobId,
  );

  const sufficiency = output.sufficiency as JsonObject | undefined;
  const collected = sufficiency?.collected;
  await tx.$executeRawUnsafe(
    `UPDATE intake_sessions
        SET signal_count = CASE WHEN $3::int IS NULL THEN signal_count ELSE $3::int END,
            payload = jsonb_set(payload, '{m4LatestResponse}', $4::jsonb, true),
            updated_at = now()
      WHERE project_id = $1 AND id = $2`,
    input.projectId,
    intakeSessionId,
    typeof collected === 'number' && Number.isSafeInteger(collected) ? collected : null,
    JSON.stringify({ jobId: input.jobId, dependencyHash: input.dependencyHash, output }),
  );
}

async function publishConcepts(tx: TxClient, input: PublishM4ProductOutputInput): Promise<void> {
  const output = outputFor(input, 'concepts');
  const concepts = output.concepts;
  if (!Array.isArray(concepts) || concepts.length !== 3) {
    throw new Error('M4 concept projection requires exactly three concepts');
  }
  const conceptSetId = deterministicId(input.jobId, 'concept-set');
  await tx.$executeRawUnsafe(
    `INSERT INTO concept_sets
       (id, project_id, source_job_id, status, dependency_hash, schema_version, payload,
        created_at, updated_at)
     VALUES ($1, $2, $3, 'generated', $4, 1, $5, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    conceptSetId,
    input.projectId,
    input.jobId,
    input.dependencyHash,
    JSON.stringify({ stageOutputs: input.stageOutputs }),
  );
  for (const [index, value] of concepts.entries()) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('M4 concept projection received invalid concept');
    }
    const concept = value as JsonObject;
    await tx.$executeRawUnsafe(
      `INSERT INTO concepts
         (id, project_id, concept_set_id, ordinal, title, synopsis, schema_version, payload,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      deterministicId(input.jobId, `concept-${index + 1}`),
      input.projectId,
      conceptSetId,
      index + 1,
      requiredString(concept, 'title'),
      requiredString(concept, 'synopsis'),
      JSON.stringify(concept.payload ?? {}),
    );
  }
}

async function publishCandidates(
  tx: TxClient,
  input: PublishM4ProductOutputInput,
  stageKey: string,
): Promise<void> {
  const output = outputFor(input, stageKey);
  const values = stageKey === 'writer' ? output.candidates : [output];
  if (!Array.isArray(values) || values.length === 0 || values.length > 3) {
    throw new Error('M4 candidate projection requires one to three candidates');
  }
  const groupId = deterministicId(input.jobId, 'proposal-group');
  await tx.$executeRawUnsafe(
    `INSERT INTO proposal_groups
       (id, project_id, kind, status, dependency_hash, source_job_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    groupId,
    input.projectId,
    input.workflowKind,
    input.dependencyHash,
    input.jobId,
  );
  for (const [index, value] of values.entries()) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('M4 candidate projection received invalid candidate');
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO generated_candidates
         (id, project_id, group_id, job_id, ordinal, prose_version_id, schema_version,
          payload, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, 1, $6, now())
       ON CONFLICT (id) DO NOTHING`,
      deterministicId(input.jobId, `candidate-${index + 1}`),
      input.projectId,
      groupId,
      input.jobId,
      index + 1,
      JSON.stringify({ output: value, stageOutputs: input.stageOutputs }),
    );
  }
}

async function publishArtifact(tx: TxClient, input: PublishM4ProductOutputInput): Promise<void> {
  const output = outputFor(input, 'publish_package');
  const artifactProposal = output.artifactProposal;
  if (
    typeof artifactProposal !== 'object' ||
    artifactProposal === null ||
    Array.isArray(artifactProposal)
  ) {
    throw new Error('M4 artifact projection received invalid proposal');
  }
  await tx.$executeRawUnsafe(
    `INSERT INTO artifact_proposals
       (id, project_id, prose_version_id, status, dependency_hash, source_job_id,
        schema_version, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, 1, $6, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    deterministicId(input.jobId, 'artifact-proposal'),
    input.projectId,
    requiredString(input.jobPayload, 'proseVersionId'),
    input.dependencyHash,
    input.jobId,
    JSON.stringify({ artifactProposal, stageOutputs: input.stageOutputs }),
  );
}

export function createM4ProductOutputPort(tx: TxClient): M4ProductOutputPort {
  return {
    async publish(input): Promise<void> {
      if (!AUTHORITATIVE_WORKFLOWS.has(input.workflowKind)) {
        throw new Error(`M4 product projection rejects workflow '${input.workflowKind}'`);
      }
      await assertExactBindings(tx, input);
      switch (input.workflowKind) {
        case 'chat_intake_reply':
          return publishIntake(tx, input);
        case 'concept_generation':
          return publishConcepts(tx, input);
        case 'foundation_generation':
          return publishCandidates(tx, input, 'foundation');
        case 'character_generation':
          return publishCandidates(tx, input, 'characters');
        case 'outline_generation':
          return publishCandidates(tx, input, 'outline');
        case 'beat_write_judge':
          return publishCandidates(tx, input, 'writer');
        case 'safe_repair':
          return publishCandidates(tx, input, 'repair');
        case 'publish_package':
          return publishArtifact(tx, input);
      }
      throw new Error(`M4 product projection missing workflow '${input.workflowKind}'`);
    },
  };
}

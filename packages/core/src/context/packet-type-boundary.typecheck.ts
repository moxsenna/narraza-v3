import {
  buildRepairPacket,
  buildWriterPacket,
  type AuthorPrivateFact,
  type PlannerPacketInput,
  type RepairDirective,
  type WriterPacketInput,
  type WriterSafeFact,
} from './index.js';

declare const privateFact: AuthorPrivateFact;
interface InternalValidationFindingFixture {
  readonly findingKey: string;
  readonly ruleKey: string;
  readonly severity: 'info' | 'warning' | 'error' | 'blocking';
  readonly publicMessageCode: string;
  readonly internalRationale: string;
  readonly restrictedEvidence: readonly string[];
}

declare const internalFinding: InternalValidationFindingFixture;
declare const plannerInput: PlannerPacketInput;

// @ts-expect-error author-private fact is not writer-safe fact
const writerFact: WriterSafeFact = privateFact;

// @ts-expect-error internal finding is not sanitized repair directive
const repairDirective: RepairDirective = internalFinding;

// @ts-expect-error planner input cannot enter writer builder
buildWriterPacket(plannerInput);

const writerInput: WriterPacketInput = {
  kind: 'writer',
  dataClass: 'writer_safe',
  metadata: {
    schemaVersion: 1,
    projectId: 'project-1',
    dependencyHash: 'a'.repeat(64),
    policyVersion: 'domain-core/v1',
  },
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Force a choice',
    sceneGoal: 'Mira refuses the offer',
    directives: ['Show hesitation through action'],
  },
  characterDirectives: [],
  establishedFacts: [],
  revealGuidance: [],
  acceptedProseContext: [],
};

buildWriterPacket(writerInput);

// @ts-expect-error writer input cannot enter repair builder
buildRepairPacket(writerInput);

void writerFact;
void repairDirective;

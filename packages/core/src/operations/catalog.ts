import type {
  CanonicalOperationType,
  EntityType,
  OperationContract,
  OperationRisk,
} from './entities.js';
import { OperationDomainError } from './errors.js';
import type { NormalizedOperationDraft } from './normalized.js';

interface CatalogEntry {
  readonly target: EntityType | 'outline_node';
  readonly mode: 'create' | 'update' | 'append';
  readonly risk: OperationRisk;
  readonly contracts: readonly OperationContract[];
}

export const OPERATION_CATALOG = {
  'foundation.update': {
    target: 'foundation',
    mode: 'update',
    risk: 'medium',
    contracts: ['intake', 'foundation'],
  },
  'character.create': {
    target: 'character',
    mode: 'create',
    risk: 'low',
    contracts: ['foundation'],
  },
  'character.update': {
    target: 'character',
    mode: 'update',
    risk: 'medium',
    contracts: ['foundation'],
  },
  'fact.create': {
    target: 'fact',
    mode: 'create',
    risk: 'high',
    contracts: ['foundation', 'beat.write', 'repair'],
  },
  'fact.update': {
    target: 'fact',
    mode: 'update',
    risk: 'high',
    contracts: ['foundation', 'beat.write', 'repair'],
  },
  'state.append': {
    target: 'character',
    mode: 'append',
    risk: 'medium',
    contracts: ['beat.write', 'repair'],
  },
  'belief.append': {
    target: 'character',
    mode: 'append',
    risk: 'medium',
    contracts: ['beat.write', 'repair'],
  },
  'disclosure.append': {
    target: 'fact',
    mode: 'append',
    risk: 'high',
    contracts: ['beat.write', 'repair'],
  },
  'reveal.create': {
    target: 'reveal',
    mode: 'create',
    risk: 'high',
    contracts: ['foundation', 'outline'],
  },
  'reveal.update': {
    target: 'reveal',
    mode: 'update',
    risk: 'high',
    contracts: ['foundation', 'outline'],
  },
  'breadcrumb.create': {
    target: 'reveal_breadcrumb',
    mode: 'create',
    risk: 'medium',
    contracts: ['outline'],
  },
  'outline.create': {
    target: 'outline_node',
    mode: 'create',
    risk: 'medium',
    contracts: ['outline'],
  },
  'outline.update': {
    target: 'outline_node',
    mode: 'update',
    risk: 'medium',
    contracts: ['outline'],
  },
  'prose.version.create': {
    target: 'prose_version',
    mode: 'create',
    risk: 'low',
    contracts: ['beat.write', 'repair'],
  },
  'prose.accept': {
    target: 'beat',
    mode: 'update',
    risk: 'high',
    contracts: ['beat.write', 'repair'],
  },
} as const satisfies Record<CanonicalOperationType, CatalogEntry>;

export const CONTRACT_LIMITS = {
  intake: 8,
  foundation: 32,
  outline: 64,
  'beat.write': 32,
  repair: 32,
} as const;

export const GLOBAL_OPERATION_LIMIT = 64;
export const CREATION_LIMIT = 32;
export const DEPENDENCY_LIMIT = 16;

export function validateCandidateContract(
  contract: OperationContract,
  drafts: readonly NormalizedOperationDraft[],
): void {
  const cap = Math.min(GLOBAL_OPERATION_LIMIT, CONTRACT_LIMITS[contract]);
  if (drafts.length > cap) {
    throw new OperationDomainError('OPERATION_LIMIT_EXCEEDED', 'candidate total limit', {
      contract,
      limit: cap,
      actual: drafts.length,
    });
  }
  const refs = new Set<string>();
  let creates = 0;
  let proseCreates = 0;
  let accepts = 0;
  for (const draft of drafts) {
    if (refs.has(draft.localRef)) {
      throw new OperationDomainError('DUPLICATE_TEMP_REF', 'duplicate localRef', {
        contract,
        localRef: draft.localRef,
      });
    }
    refs.add(draft.localRef);
    const entry = OPERATION_CATALOG[draft.operationType];
    if (!entry.contracts.includes(contract as never)) {
      throw new OperationDomainError('OPERATION_NOT_ALLOWED', 'operation not allowed', {
        contract,
        localRef: draft.localRef,
        operationType: draft.operationType,
      });
    }
    if (draft.dependsOn.length > DEPENDENCY_LIMIT) {
      throw new OperationDomainError('OPERATION_LIMIT_EXCEEDED', 'dependency limit', {
        contract,
        localRef: draft.localRef,
        limit: DEPENDENCY_LIMIT,
        actual: draft.dependsOn.length,
      });
    }
    if (entry.mode === 'create') {
      creates += 1;
      if (draft.operationType === 'prose.version.create') proseCreates += 1;
    }
    if (draft.operationType === 'prose.accept') accepts += 1;
    if (
      (contract === 'beat.write' || contract === 'repair') &&
      (draft.operationType === 'fact.create' || draft.operationType === 'fact.update') &&
      draft.payload.kind === draft.operationType &&
      draft.payload.visibility === 'planner_only'
    ) {
      throw new OperationDomainError('OPERATION_NOT_ALLOWED', 'writer-safe fact required', {
        contract,
        localRef: draft.localRef,
        reason: 'writer_safe_required',
      });
    }
  }
  if (creates > CREATION_LIMIT) {
    throw new OperationDomainError('OPERATION_LIMIT_EXCEEDED', 'creation limit', {
      contract,
      limit: CREATION_LIMIT,
      actual: creates,
    });
  }
  if (
    (contract === 'beat.write' || contract === 'repair') &&
    (proseCreates !== 1 || accepts !== 1)
  ) {
    throw new OperationDomainError(
      'PROSE_ACCEPT_REQUIRED',
      'one prose create and accept required',
      { contract, proseCreates, accepts },
    );
  }
}

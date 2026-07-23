import { compareCodeUnits, type CanonicalOperationType, type EntityType } from './entities.js';
import { OperationDomainError } from './errors.js';

export interface OperationGraphEdge {
  readonly before: string;
  readonly after: string;
}

export interface SortableOperationNode {
  readonly localRef: string;
  readonly operationType: CanonicalOperationType;
  readonly targetEntityType: EntityType;
  readonly targetId: string;
}

const compare = (a: SortableOperationNode, b: SortableOperationNode) =>
  compareCodeUnits(a.operationType, b.operationType) ||
  compareCodeUnits(a.targetEntityType, b.targetEntityType) ||
  compareCodeUnits(a.targetId, b.targetId) ||
  compareCodeUnits(a.localRef, b.localRef);

export function stableTopologicalSort<T extends SortableOperationNode>(
  nodes: readonly T[],
  edges: readonly OperationGraphEdge[],
): readonly T[] {
  const byId = new Map(nodes.map((n) => [n.localRef, n]));
  if (byId.size !== nodes.length) {
    throw new OperationDomainError('DUPLICATE_TEMP_REF', 'duplicate graph node');
  }
  const outgoing = new Map(nodes.map((n) => [n.localRef, new Set<string>()]));
  const indegree = new Map(nodes.map((n) => [n.localRef, 0]));
  for (const e of edges) {
    if (!byId.has(e.before) || !byId.has(e.after) || e.before === e.after) {
      throw new OperationDomainError('INVALID_DEPENDENCY', 'invalid graph edge', {
        before: e.before,
        after: e.after,
      });
    }
    const set = outgoing.get(e.before)!;
    if (!set.has(e.after)) {
      set.add(e.after);
      indegree.set(e.after, indegree.get(e.after)! + 1);
    }
  }
  const ready = nodes.filter((n) => indegree.get(n.localRef) === 0).sort(compare);
  const result: T[] = [];
  while (ready.length) {
    const n = ready.shift()!;
    result.push(n);
    for (const id of [...outgoing.get(n.localRef)!].sort(compareCodeUnits)) {
      indegree.set(id, indegree.get(id)! - 1);
      if (indegree.get(id) === 0) {
        ready.push(byId.get(id)!);
        ready.sort(compare);
      }
    }
  }
  if (result.length !== nodes.length) {
    const residual = [...indegree]
      .filter(([, v]) => v > 0)
      .map(([id]) => id)
      .sort(compareCodeUnits);
    const cycle = new Set<string>();
    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const visit = (id: string) => {
      state.set(id, 1);
      stack.push(id);
      for (const next of [...outgoing.get(id)!]
        .filter((x) => indegree.get(x)! > 0)
        .sort(compareCodeUnits)) {
        if (state.get(next) === 1) {
          for (const item of stack.slice(stack.indexOf(next))) cycle.add(item);
        } else if (!state.has(next)) {
          visit(next);
        }
      }
      stack.pop();
      state.set(id, 2);
    };
    for (const id of residual) if (!state.has(id)) visit(id);
    throw new OperationDomainError('DEPENDENCY_CYCLE', 'operation graph cycle', {
      cycleNodeIds: [...cycle].sort(compareCodeUnits),
    });
  }
  return result;
}

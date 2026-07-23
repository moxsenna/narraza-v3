import { describe, expect, it } from 'vitest';
import { validateCandidateContract } from './catalog.js';
import { parseAndNormalizeSuggestion } from './normalized.js';

const fact = (visibility: 'writer_safe' | 'planner_only') =>
  parseAndNormalizeSuggestion({
    schemaVersion: 1,
    tempRef: 'factOp',
    operationType: 'fact.create',
    input: {
      statement: 'X',
      canonStatus: 'draft',
      visibility,
      source: { kind: 'foundation' },
    },
  });

describe('operation contract policy', () => {
  it.each(['beat.write', 'repair'] as const)('%s rejects planner_only fact.create', (contract) =>
    expect(() => validateCandidateContract(contract, [fact('planner_only')])).toThrowError(
      expect.objectContaining({
        code: 'OPERATION_NOT_ALLOWED',
        details: { contract, localRef: 'factOp', reason: 'writer_safe_required' },
      }),
    ),
  );
  it('foundation permits planner_only facts', () =>
    expect(() => validateCandidateContract('foundation', [fact('planner_only')])).not.toThrow());
  it('enforces total/create/dependency limits before allocation', () => {
    expect(() =>
      validateCandidateContract(
        'foundation',
        Array.from({ length: 33 }, (_, i) => ({
          ...fact('writer_safe'),
          localRef: `f${i}`,
          target: {
            kind: 'temporary' as const,
            entityType: 'fact' as const,
            tempRef: `f${i}`,
          },
        })),
      ),
    ).toThrowError(expect.objectContaining({ code: 'OPERATION_LIMIT_EXCEEDED' }));
    expect(() =>
      validateCandidateContract('foundation', [
        {
          ...fact('writer_safe'),
          dependsOn: Array.from({ length: 17 }, (_, i) => `d${i}`),
        },
      ]),
    ).toThrowError(expect.objectContaining({ code: 'OPERATION_LIMIT_EXCEEDED' }));
  });
});

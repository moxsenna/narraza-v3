import { describe, expect, it } from 'vitest';
import { toPublicProposalView } from './proposal-view.js';

const baseRow = {
  proposalId: 'p-1',
  groupId: 'g-1',
  status: 'pending',
  source: 'user',
  groupKind: 'prose',
  groupStatus: 'pending',
  operations: [
    { operationType: 'prose.version.create', risk: 'low' },
    { operationType: 'prose.accept', risk: 'high' },
  ],
  proseContent: 'Isi naskah panjang '.repeat(30),
  dependencyCurrent: true,
};

describe('toPublicProposalView', () => {
  it('derives labels, risk, and server-owned actions without raw payload data', () => {
    const view = toPublicProposalView(baseRow);
    expect(view.proposalId).toBe('p-1');
    expect(view.status).toBe('pending');
    expect(view.highRisk).toBe(true);
    expect(view.availableActions).toEqual(['accept', 'reject']);
    expect(view.operations).toHaveLength(2);
    expect(view.operations[0]).toEqual({
      kind: 'prose.version.create',
      label: 'Naskah baru',
      impact: 'Menambahkan versi naskah beat',
      risk: 'low',
    });
    expect(view.operations[1]!.label).toBe('Jadikan resmi');
    // Excerpt capped at 240 chars.
    expect(view.proseExcerpt!.length).toBe(240);
  });

  it('sanitizes: never exposes payload/hash keys or restricted-class fields', () => {
    const view = toPublicProposalView(baseRow);
    const parsed = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
    // Structure-level contract: no internal keys ever present.
    expect(Object.keys(parsed).sort()).toEqual([
      'availableActions',
      'groupKind',
      'highRisk',
      'operations',
      'proposalId',
      'proseExcerpt',
      'risk',
      'source',
      'status',
    ]);
    for (const op of parsed.operations as Record<string, unknown>[]) {
      expect(Object.keys(op).sort()).toEqual(['impact', 'kind', 'label', 'risk']);
    }
    // Excerpt is capped; full prose never serialized.
    expect(view.proseExcerpt!.length).toBeLessThanOrEqual(240);
  });

  it('flags needs_revalidation and drops actions when dependency moved', () => {
    const view = toPublicProposalView({ ...baseRow, dependencyCurrent: false });
    expect(view.status).toBe('needs_revalidation');
    expect(view.availableActions).toEqual([]);
  });

  it('drops actions for decided proposals', () => {
    expect(toPublicProposalView({ ...baseRow, status: 'accepted' }).availableActions).toEqual([]);
    expect(toPublicProposalView({ ...baseRow, status: 'superseded' }).availableActions).toEqual([]);
    // Group decided → no actions even when proposal row pending.
    expect(toPublicProposalView({ ...baseRow, groupStatus: 'accepted' }).availableActions).toEqual(
      [],
    );
  });

  it('normalizes unknown op types to a neutral safe projection', () => {
    const view = toPublicProposalView({
      ...baseRow,
      operations: [{ operationType: 'state.append', risk: 'medium' }],
    });
    expect(view.operations[0]!.label).toBe('state.append');
    expect(view.operations[0]!.impact).toBe('Perubahan cerita resmi');
    expect(view.highRisk).toBe(false);
  });
});

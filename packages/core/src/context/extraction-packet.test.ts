import { describe, expect, it } from 'vitest';
import { buildExtractionPacket } from './index.js';

const metadata = {
  schemaVersion: 1,
  projectId: 'project-1',
  dependencyHash: 'e'.repeat(64),
  policyVersion: 'domain-core/v1',
} as const;

describe('extraction-packet', () => {
  it('maps intake_signals to review_safe', () => {
    const packet = buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata,
      useCase: 'intake_signals',
      messages: [{ id: 'message-1', role: 'user', content: 'I want a family mystery.' }],
    });
    expect(packet).toMatchObject({ useCase: 'intake_signals', dataClass: 'review_safe' });
  });

  it('maps prose_public_structure to review_safe', () => {
    const packet = buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata,
      useCase: 'prose_public_structure',
      prose: { proseVersionId: 'prose-1', content: 'Mira closed the door.' },
    });
    expect(packet).toMatchObject({ useCase: 'prose_public_structure', dataClass: 'review_safe' });
  });

  it('maps canon_reconciliation to author_private', () => {
    const packet = buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'author_private',
      metadata,
      useCase: 'canon_reconciliation',
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Mira named the heir.' },
      facts: [
        {
          dataClass: 'author_private',
          id: 'fact-1',
          factKey: 'heir_alive',
          truth: 'The heir is alive',
          visibility: 'canonical',
        },
      ],
      characters: [{ id: 'character-1', identity: 'Mira is the archivist' }],
    });
    expect(packet).toMatchObject({ useCase: 'canon_reconciliation', dataClass: 'author_private' });
  });

  it.each([
    ['intake_signals', 'author_private'],
    ['prose_public_structure', 'author_private'],
    ['canon_reconciliation', 'review_safe'],
    ['canon_reconciliation', 'writer_safe'],
  ] as const)('rejects %s with %s', (useCase, dataClass) => {
    const base = { kind: 'extraction', metadata, useCase, dataClass };
    const payload =
      useCase === 'intake_signals'
        ? { messages: [] }
        : useCase === 'prose_public_structure'
          ? { prose: { proseVersionId: 'prose-1', content: 'Text' } }
          : {
              prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
              facts: [],
              characters: [],
            };
    expect(() => buildExtractionPacket({ ...base, ...payload } as never)).toThrowError(
      expect.objectContaining({ code: 'DATA_CLASS_MISMATCH' }),
    );
  });

  it('rejects custom extraction use case', () => {
    expect(() =>
      buildExtractionPacket({
        kind: 'extraction',
        dataClass: 'review_safe',
        metadata,
        useCase: 'custom',
        payload: {},
      } as never),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('rejects duplicate canon reconciliation IDs', () => {
    const fact = {
      dataClass: 'author_private',
      id: 'fact-1',
      factKey: 'heir_alive',
      truth: 'The heir is alive',
      visibility: 'canonical',
    } as const;
    expect(() =>
      buildExtractionPacket({
        kind: 'extraction',
        dataClass: 'author_private',
        metadata,
        useCase: 'canon_reconciliation',
        prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
        facts: [fact, fact],
        characters: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
  });
});

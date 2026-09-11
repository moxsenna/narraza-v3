import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname);
const source = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), 'utf8');

/**
 * verification-matrix: proposal-dto (contract). The proposal surface carries
 * only sanitized projections: no raw operations JSON, no payload passthrough,
 * no hashes, and no service_restricted data crossing to the browser.
 */
describe('W5.4 proposal DTO contracts', () => {
  test('proposal actions trust only session-derived owner and server-validated ids', () => {
    const actions = source('server/domain/proposal-actions.ts');

    for (const action of [
      'prepareUserProposalAction',
      'acceptProposalAction',
      'rejectProposalAction',
      'publishArtifactAction',
    ]) {
      expect(actions).toContain(`export async function ${action}`);
    }
    // Every action derives identity from the session, never from the client.
    const ownerDerives = actions.match(/getCurrentUser\(\)/g)?.length ?? 0;
    expect(ownerDerives).toBeGreaterThanOrEqual(4);
    // High-risk second confirm is enforced server-side.
    expect(actions).toContain("confirmPhrase !== HIGH_RISK_CONFIRM_PHRASE");
    // CAS failure routes through the conditional stale gate (R-M5.3).
    expect(actions).toContain("result.error.code === 'CAS_FAILED'");
    expect(actions).toContain('createMarkStaleProposal');
  });

  test('proposal read model crosses only the sanitized view boundary', () => {
    const resolver = source('lib/server/capability-resolvers/chapter-proposals.ts');

    // The view model is built from PublicProposalView projections only.
    expect(resolver).toContain('createGetPendingProposals');
    expect(resolver).not.toContain('listOperations');
    expect(resolver).not.toContain('operationsHash');
    expect(resolver).not.toContain('payload');
    expect(resolver).not.toContain('service_restricted');
  });

  test('proposal page renders server projections without raw op payloads', () => {
    const page = source(
      'app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/page.tsx',
    );
    expect(page).toContain('resolveChapterProposals');
    expect(page).not.toContain('JSON.parse');
    expect(page).not.toContain('payload');

    const cards = source(
      'app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/proposal-cards.tsx',
    );
    // Cards render label/impact/risk/excerpt — never raw op kind JSON blobs.
    expect(cards).toContain('op.label');
    expect(cards).toContain('op.impact');
    expect(cards).toContain('data-testid="high-risk-confirm"');
    expect(cards).not.toContain('payload');
  });
});

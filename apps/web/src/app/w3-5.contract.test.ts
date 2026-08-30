import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');
const source = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), 'utf8');

describe('W3.5 credit quote and job phase contracts', () => {
  test('scene generation actions authorize through session-derived owner and tenant scope', () => {
    const actions = source('server/domain/generation-actions.ts');
    const adapter = source('server/domain/generation.ts');

    for (const action of [
      'requestSceneGenerationQuoteAction',
      'confirmSceneGenerationQuoteAction',
      'getChapterJobStateAction',
      'cancelSceneGenerationJobAction',
    ]) {
      expect(actions).toContain(`export async function ${action}`);
    }
    // Mutating actions re-derive the fail-closed harness decision; the polled
    // read passes through the same owner-derived chapter access guard.
    expect(actions.match(/resolveGenerationHarnessAccess\(/g)?.length).toBe(3);
    expect(actions).toContain('assertSceneChapterAccess(projectId, chapterId)');
    expect(adapter).toContain('getMyProject(projectId)');
    expect(adapter).toContain("node.entityType === 'chapter'");
    // More than one active scene job violates the backend invariant: fail closed.
    expect(adapter).toContain("if (sceneJobs.length > 1) return { kind: 'ambiguous' }");
    expect(adapter).toContain("if (sceneJobs.length > 1) return { kind: 'ambiguous' };");
  });

  test('quote confirmation keeps server-side idempotency and never trusts client hashes', () => {
    const adapter = source('server/domain/generation.ts');

    expect(adapter).toContain('...deriveSceneConfirmationIdentity(quoteId)');
    expect(adapter).toContain('deriveSceneGenerationHashes(projectId, chapterId)');
    expect(adapter).toContain('jobKind: SCENE_GENERATION_JOB_KIND');
    expect(adapter).not.toMatch(/formData\.get\('(workflowPlanHash|dependencyHash|requestId)'\)/);
  });

  test('public job and quote views carry no internal identifiers or micro-IDR values', () => {
    const jobPhase = source('lib/frontend/job-phase.ts');
    const viewMapper = source('lib/server/generation-view-model.ts');

    expect(jobPhase).toContain('phase: JobPhase');
    expect(jobPhase).toContain('zeroCharge: boolean');
    for (const forbidden of [
      'jobId',
      'quoteId: string; // job',
      'workflowPlanHash',
      'dependencyHash',
      'requestId',
      'reservationId',
      'MicroIdr',
    ]) {
      expect(jobPhase).not.toContain(forbidden);
    }
    expect(viewMapper).toContain('microIdrToCreditsFloor');
    expect(viewMapper).not.toMatch(
      /workflowPlanHash|dependencyHash|requestId|leaseToken|fenceVersion/,
    );
  });

  test('credit summary header chip and page share one snapshot contract', () => {
    const layout = source('app/app/layout.tsx');
    const kreditPage = source('app/app/kredit/page.tsx');
    const adapter = source('server/domain/generation.ts');

    expect(layout).toContain('getCreditSummaryViewForUser(user.userId)');
    expect(layout).toContain('getCurrentUser()');
    expect(kreditPage).toContain('getMyCreditSummaryView()');
    expect(adapter).toContain('createCreditSummaryService(getUnitOfWork())');
    expect(adapter).toContain('toCreditSummaryDisplay');
    // CreditSummaryView is already credit-denominated by the application layer
    // (computeCreditSummaryView applies the D6 floor/ceil rules), so the server
    // mapper must widen it without re-applying any micro-IDR conversion.
    const serverMapper = source('lib/server/credit-view-model.ts');
    expect(serverMapper).toContain('Number(view.available)');
    expect(serverMapper).not.toMatch(/microIdrToCredits(Floor|Ceil)\(view\./);
    expect(adapter).toContain('availableCredits: Number(balance.available)');
    expect(source('lib/frontend/credit-display.ts')).not.toContain('@narraza/application');
    expect(source('components/composites/HeaderCreditChip.tsx')).toContain('/app/kredit');
  });

  test('production chapter workspace stays fail-closed; the harness owns the mock vertical', () => {
    const page = source('app/app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx');
    const harness = source(
      'app/(preview)/app/%5F_preview/m3-generation/[projectId]/[chapterId]/page.tsx',
    );
    const boundary = source('lib/server/preview/generation-harness.ts');

    // Product truthfulness: the production route never mounts the generation
    // panel and never derives a plan hash until M4 owns real generation.
    expect(page).not.toContain('<SceneGenerationPanel');
    expect(page).toContain('scene-generation-unavailable');
    expect(page).toContain('Pembuatan adegan otomatis belum dapat dilakukan di sini');
    expect(page).toContain('resolveChapterContext(projectId, chapterId)');
    expect(page).toContain("context.kind !== 'resolved'");

    // The M3 mock vertical runs through the fail-closed preview harness with
    // the same production W3.5 components and the real job-state lookup.
    expect(harness).toContain('<SceneGenerationPanel');
    expect(harness).toContain('findSceneJobState(projectId, chapterId, null)');
    expect(harness).toContain('resolveGenerationHarnessAccess(projectId, chapterId)');
    expect(boundary).toContain("'production' || input.environment === 'staging'");
    expect(boundary).toContain("if (input.environment === 'unknown') return { allowed: false };");
    expect(boundary).toContain('assertSceneChapterAccess(projectId, chapterId)');
  });

  test('generation mutations are gated by the harness boundary in production', () => {
    const actions = source('server/domain/generation-actions.ts');

    // Every state-creating/cancelling action re-derives the fail-closed
    // harness decision server-side; a leaked action id cannot mutate.
    expect(actions.match(/resolveGenerationHarnessAccess\(/g)?.length).toBe(3);
  });

  test('confirmation identity is deterministic for Task 6 exact replay', () => {
    const generation = source('server/domain/generation.ts');
    const identity = source('lib/server/confirmation-identity.ts');

    // No random reservation/job ids on the confirm path: the same quote must
    // always derive the same confirmation identity.
    expect(identity).toContain('deriveSceneConfirmationIdentity');
    expect(identity).toContain('bytes[6] = (bytes[6]! & 0x0f) | 0x50');
    expect(generation).toContain('...deriveSceneConfirmationIdentity(quoteId)');
    expect(generation).not.toContain('reservationId: randomUUID()');
    expect(generation).not.toContain('jobId: randomUUID()');
  });

  test('terminal recovery lookup scopes the chapter before ordering and limit', () => {
    const port = source('../../../packages/application/src/ports/job-port.ts');
    const repo = source('../../../packages/db/src/repos/job-repo.ts');
    const generation = source('server/domain/generation.ts');

    expect(port).toContain('payloadFilter: JsonObject');
    expect(repo).toContain('AND payload @> $3::jsonb');
    expect(repo.indexOf('payload @>')).toBeLessThan(repo.indexOf('ORDER BY updated_at DESC'));
    expect(generation).toContain('payloadFilter: { chapterId }');
  });

  test('quote card states cover expiry, confirmation error, and insufficient balance honestly', () => {
    const card = source('components/credits/CreditQuoteCard.tsx');
    const panel = source('components/credits/SceneGenerationPanel.tsx');

    expect(card).toContain(
      "export type CreditQuoteCardState = 'quoted' | 'expired' | 'error' | 'insufficient';",
    );
    expect(card).toContain('role="alert"');
    expect(panel).toContain("confirmState?.kind === 'job_started'");
    expect(panel).toContain('useFormStatus');
    expect(panel).toContain('name="quoteId"');
    // Double submit is disabled through pending state on every submit button.
    expect(panel.match(/disabled=\{pending/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('job phase panel polls within D12 bounds and never fabricates terminal state', () => {
    const panel = source('components/credits/JobPhasePanel.tsx');

    expect(panel).toContain('INITIAL_POLL_MS = 2500');
    expect(panel).toContain('MAX_POLL_MS = 10000');
    expect(panel).toContain('Math.min(delay * 1.5, MAX_POLL_MS)');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('Ada proses yang masih berjalan untuk adegan ini');
    // Transient read failure stays recoverable; it never maps to a terminal phase.
    expect(panel).toContain('setConnectionIssue(true)');
    expect(panel).not.toContain("phase: 'failed'");
    expect(panel).not.toContain("phase: 'succeeded'");
    expect(panel).toContain('<ConfirmationDialog');
    expect(panel).toContain('confirmLabel="Ya, batalkan"');
  });

  test('polling read action stops the client from choosing among active jobs', () => {
    const actions = source('server/domain/generation-actions.ts');
    expect(actions).toContain('isTerminalJobView(lookup.view)');
    expect(actions).toContain("{ kind: 'none' }");
  });
});

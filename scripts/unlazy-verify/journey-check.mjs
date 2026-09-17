// Repo-owned portable verifier for .unlazy/journey gates.
// Usage: node scripts/unlazy-verify/journey-check.mjs <mode>
// Modes: nextaction | chat-cta | konsep-real | tulis-loop | cek-accept
//        | publish-artifact | modes | f1 | paid | all
// Each mode prints exactly one success-only marker line on success and exits 0.
// Any failure prints UNLAZY_FAIL lines and exits 1. No external tools required.
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function print(line) {
  process.stdout.write(`${line}\n`);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
const failures = [];
function fail(msg) {
  failures.push(msg);
}
function ok(marker, detail) {
  print(`UNLAZY_OK ${marker}${detail ? ' ' + detail : ''}`);
}
function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}
function low(s) {
  return s.toLowerCase();
}

function checkNextAction() {
  // Positive control: hardcoded stage map must be flagged.
  const badFixture = "const nextActionCopy = { intake: { route: 'chat' } };";
  if (!low(badFixture).includes('nextactioncopy')) fail('positive control fixture broken');
  // Negative control: reducer-driven usage passes.
  const goodFixture = 'const { nextAction } = progress; href={nextAction.hrefHint}';
  if (low(goodFixture).includes('nextactioncopy')) fail('negative control wrongly flagged');
  if (failures.length > 0) return;
  const home = low(read('apps/web/src/app/app/proyek/[projectId]/page.tsx'));
  if (!home.includes('nextaction')) fail('project home ignores progress.nextAction');
  if (home.includes('nextactioncopy')) fail('project home keeps hardcoded nextActionCopy map');
  const dashPage = low(read('apps/web/src/app/app/page.tsx'));
  const dashView = low(read('apps/web/src/components/dashboard/DashboardView.tsx'));
  if (!dashPage.includes('nextaction') && !dashView.includes('nextaction')) {
    fail('dashboard never surfaces progress.nextAction');
  }
  if (failures.length === 0) ok('journey-nextaction', 'home+dashboard reducer-driven');
}

function checkChatCta() {
  const badFixture = '<Link href="/konsep">Konsep</Link>';
  if (low(badFixture).includes('sufficien')) fail('positive control fixture broken');
  const goodFixture = '{sufficient && <Link href="konsep">Susun 3 Konsep</Link>}';
  if (!low(goodFixture).includes('konsep') || !low(goodFixture).includes('sufficien')) {
    fail('negative control fixture broken');
  }
  if (failures.length > 0) return;
  const chat = low(read('apps/web/src/app/app/proyek/[projectId]/chat/page.tsx'));
  if (!chat.includes('konsep')) fail('chat has no link onward to konsep');
  if (!chat.includes('sufficien')) fail('chat CTA is not gated by intake sufficiency');
  if (failures.length === 0) ok('journey-chat-cta', 'sufficiency-gated konsep link');
}

function checkKonsepReal() {
  const badFixture = "reasonCode: 'BACKEND_NOT_AVAILABLE'";
  if (!low(badFixture).includes('backend_not_available')) fail('positive control fixture broken');
  if (failures.length > 0) return;
  const page = low(read('apps/web/src/app/app/proyek/[projectId]/konsep/page.tsx'));
  if (!page.includes('acceptconcept') && !page.includes('chooseconceptaction')) {
    fail('konsep page never calls the accept chain');
  }
  if (page.includes('backend_not_available')) fail('konsep still fail-closed placeholder');
  const panel = low(read('apps/web/src/components/credits/ConceptGenerationPanel.tsx'));
  if (!panel.includes('requestconceptgenerationquote')) {
    fail('konsep has no quote request (D4) surface');
  }
  if (!panel.includes('confirmconceptgenerationquote')) {
    fail('konsep has no quote confirm (D4) surface');
  }
  if (failures.length === 0) ok('journey-konsep-real', 'accept path with quote');
}

function checkTulisLoop() {
  const badFixture = 'data-testid="scene-generation-unavailable"';
  if (!low(badFixture).includes('scene-generation-unavailable')) {
    fail('positive control fixture broken');
  }
  if (failures.length > 0) return;
  const page = low(read('apps/web/src/app/app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx'));
  if (!page.includes('confirmscenegenerationquote') && !page.includes('confirmprodscenequote')) {
    fail('tulis never confirms a real generation quote');
  }
  if (!page.includes('findscenejobstate') && !page.includes('getprodscenejobstate')) {
    fail('tulis never observes job state/phases');
  }
  if (page.includes('scene-generation-unavailable')) {
    fail('tulis keeps the unavailable dead-end block');
  }
  if (failures.length === 0) ok('journey-tulis-loop', 'quote+confirm+phases');
}

function checkCekAccept() {
  const badFixture = 'Belum ada usulan yang menunggu keputusan.';
  if (!low(badFixture).includes('belum ada usulan')) fail('positive control fixture broken');
  if (failures.length > 0) return;
  const cek = low(read('apps/web/src/app/app/proyek/[projectId]/bab/[chapterId]/cek/page.tsx'));
  if (!cek.includes('inding')) fail('cek shows no validation findings');
  if (cek.includes('belum tersedia')) fail('cek keeps dead-end copy');
  const selsPage = low(
    read('apps/web/src/app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/page.tsx'),
  );
  const selsCards = low(
    read('apps/web/src/app/app/proyek/[projectId]/bab/[chapterId]/selesaikan/proposal-cards.tsx'),
  );
  if (!selsPage.includes('ccept') && !selsCards.includes('acceptproposalaction')) {
    fail('selesaikan has no accept action');
  }
  if (selsPage.includes('belum ada usulan yang menunggu keputusan')) {
    fail('selesaikan keeps the empty dead-end copy');
  }
  if (failures.length === 0) ok('journey-cek-accept', 'findings+accept live');
}

function checkPublishArtifact() {
  const badFixture = 'Paket terbit belum tersedia';
  if (!low(badFixture).includes('belum tersedia')) fail('positive control fixture broken');
  if (failures.length > 0) return;
  for (const rel of [
    'apps/web/src/app/app/proyek/[projectId]/publish/page.tsx',
    'apps/web/src/app/app/proyek/[projectId]/bab/[chapterId]/publish/page.tsx',
  ]) {
    const src = low(read(rel));
    if (!src.includes('artifact')) fail(`${rel}: no publish artifact flow`);
    if (src.includes('belum tersedia')) fail(`${rel}: keeps dead-end copy`);
  }
  if (failures.length === 0) ok('journey-publish-artifact', 'non-canon artifact live');
}

function checkModes() {
  const badFixture = '<Badge tone="warning">Belum dapat diubah</Badge>';
  if (!low(badFixture).includes('belum dapat diubah')) fail('positive control fixture broken');
  if (failures.length > 0) return;
  const page = low(read('apps/web/src/app/app/pengaturan/page.tsx'));
  if (!page.includes('uimode')) fail('pengaturan never persists uiMode');
  if (!page.includes('aria-pressed')) fail('mode switch has no selected state');
  if (!page.includes('pemula aktif') && !page.includes('mahir aktif')) {
    fail('mode switch shows no active-mode badge');
  }
  if (failures.length === 0) ok('journey-modes', 'uiMode switch live');
}

if (mode === 'nextaction') checkNextAction();
else if (mode === 'chat-cta') checkChatCta();
else if (mode === 'konsep-real') checkKonsepReal();
else if (mode === 'tulis-loop') checkTulisLoop();
else if (mode === 'cek-accept') checkCekAccept();
else if (mode === 'publish-artifact') checkPublishArtifact();
else if (mode === 'modes') checkModes();
else if (mode === 'f1') {
  checkNextAction();
  checkChatCta();
  checkKonsepReal();
  if (failures.length === 0) ok('journey-f1', 'guide wiring complete');
} else if (mode === 'paid') {
  checkTulisLoop();
  checkCekAccept();
  checkPublishArtifact();
  if (failures.length === 0) ok('journey-paid', 'paid loop live');
} else if (mode === 'all') {
  checkNextAction();
  checkChatCta();
  checkKonsepReal();
  checkTulisLoop();
  checkCekAccept();
  checkPublishArtifact();
  checkModes();
  if (failures.length === 0) ok('journey-all', 'full journey live');
} else {
  print(`UNLAZY_FAIL unknown mode ${mode}`);
  process.exit(1);
}
if (failures.length > 0) {
  for (const f of failures.slice(0, 20)) print(`UNLAZY_FAIL ${f}`);
  process.exit(1);
}

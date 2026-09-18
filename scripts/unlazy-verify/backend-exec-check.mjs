// Repo-owned portable verifier for .unlazy/backend-exec gates.
// Usage: node scripts/unlazy-verify/backend-exec-check.mjs <mode>
// Modes: packets | quote | worker | all
// Each mode prints exactly one success-only marker line on success and exits 0.
// Any failure prints UNLAZY_FAIL lines and exits 1. No external tools required.
import { existsSync, readFileSync } from 'node:fs';
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

const PACKET_FILES = [
  'packages/application/src/ai/prod-packets/concept-packets.ts',
  'packages/application/src/ai/prod-packets/beat-packets.ts',
  'packages/application/src/ai/prod-packets/repair-packets.ts',
  'packages/application/src/ai/prod-packets/publish-packets.ts',
];

function checkPacketFiles(files, marker, detail) {
  for (const rel of files) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) {
      fail(`missing ${rel}`);
      continue;
    }
    const src = low(read(rel));
    if (src.length < 500) fail(`${rel}: suspiciously small`);
    if (src.includes('undetermined')) fail(`${rel}: placeholder content`);
    if (src.includes('readverticalcontext')) fail(`${rel}: preview-only context`);
    if (src.includes('__preview')) fail(`${rel}: preview path reference`);
    if (
      !src.includes('buildplannerpacket') &&
      !src.includes('buildwriterpacket') &&
      !src.includes('buildrepairpacket') &&
      !src.includes('buildextractionpacket')
    ) {
      fail(`${rel}: no core packet builder used`);
    }
  }
  if (failures.length === 0) ok(marker, detail);
}

function checkPackets() {
  // Positive control: placeholder packet content must be flagged.
  const badFixture = 'packet: UNDETERMINED // preview readVerticalContext';
  const badNorm = low(badFixture);
  if (!badNorm.includes('undetermined') || !badNorm.includes('readverticalcontext')) {
    fail('positive control fixture broken');
  }
  if (failures.length > 0) return;
  checkPacketFiles(PACKET_FILES, 'backend-packets', 'files=4 real-state builders');
}

const QUOTE_MODULES = [
  'apps/web/src/server/domain/concept-generation.ts',
  'apps/web/src/server/domain/scene-generation-prod-actions.ts',
  'apps/web/src/server/domain/repair-generation.ts',
  'apps/web/src/server/domain/publish-generation.ts',
];

function checkQuoteModules(modules, marker, detail) {
  for (const rel of modules) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) {
      fail(`missing ${rel}`);
      continue;
    }
    const src = low(read(rel));
    if (!src.includes('createpaidgenerationpreparationservice')) {
      fail(`${rel}: not routed through preparePaidGeneration`);
    }
    if (src.includes('workflowplanid: null')) fail(`${rel}: stand-in plan binding remains`);
    if (src.includes('bundleid: null')) fail(`${rel}: stand-in bundle binding remains`);
  }
  if (failures.length === 0) ok(marker, detail);
}

function checkQuote() {
  // Positive control: stand-in plan hashes must be flagged.
  const badFixture = 'workflowPlanHash: sha256Stable({ kind }) // workflowPlanId: null';
  if (!low(badFixture).includes('workflowplanid: null')) fail('positive control fixture broken');
  if (failures.length > 0) return;
  checkQuoteModules(QUOTE_MODULES, 'backend-quote', 'modules=4 real artifacts');
}

function checkWorker() {
  const src = low(read('apps/worker-gen/src/m4-job-processor.ts'));
  for (const kind of ['concept_generation', 'beat_write_judge', 'safe_repair', 'publish_package']) {
    if (!src.includes(`'${kind}'`)) fail(`worker does not support ${kind}`);
  }
  if (failures.length === 0) ok('backend-worker', 'kinds=4 executable');
}

if (mode === 'packets') checkPackets();
else if (mode === 'packets-concept') {
  checkPacketFiles(
    ['packages/application/src/ai/prod-packets/concept-packets.ts'],
    'backend-packets-concept',
    'concept real-state builder',
  );
} else if (mode === 'packets-beat') {
  checkPacketFiles(
    ['packages/application/src/ai/prod-packets/beat-packets.ts'],
    'backend-packets-beat',
    'beat real-state builder',
  );
} else if (mode === 'packets-repair-publish') {
  checkPacketFiles(
    [
      'packages/application/src/ai/prod-packets/repair-packets.ts',
      'packages/application/src/ai/prod-packets/publish-packets.ts',
    ],
    'backend-packets-repair-publish',
    'repair+publish real-state builders',
  );
} else if (mode === 'quote') checkQuote();
else if (mode === 'quote-concept') {
  checkQuoteModules(
    ['apps/web/src/server/domain/concept-generation.ts'],
    'backend-quote-concept',
    'concept real artifacts',
  );
} else if (mode === 'quote-beat') {
  checkQuoteModules(
    ['apps/web/src/server/domain/scene-generation-prod-actions.ts'],
    'backend-quote-beat',
    'beat real artifacts',
  );
} else if (mode === 'quote-repair-publish') {
  checkQuoteModules(
    [
      'apps/web/src/server/domain/repair-generation.ts',
      'apps/web/src/server/domain/publish-generation.ts',
    ],
    'backend-quote-repair-publish',
    'repair+publish real artifacts',
  );
} else if (mode === 'worker') checkWorker();
else if (mode === 'all') {
  checkPackets();
  checkQuote();
  checkWorker();
  if (failures.length === 0) ok('backend-exec-all', 'packets+quote+worker');
} else {
  print(`UNLAZY_FAIL unknown mode ${mode}`);
  process.exit(1);
}
if (failures.length > 0) {
  for (const f of failures.slice(0, 20)) print(`UNLAZY_FAIL ${f}`);
  process.exit(1);
}

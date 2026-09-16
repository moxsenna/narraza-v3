// Repo-owned portable verifier for .unlazy/v3-parity gates.
// Usage: node scripts/unlazy-verify/v3-parity-check.mjs <mode>
// Modes: handoff-tokens | font-body | all
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
function read(p) {
  return readFileSync(p, 'utf8');
}

// Owner canon: docs/design.md §25 + narraza-*.dc.html
// (warm cream canvas, rose brand scale, plum ink, Jakarta + Lora).
const BANNED = [
  '#881337',
  '#0f172a',
  '#f8f9fa',
  '#ffe4e6',
  '#9f1239',
  '#e2e8f0',
  'family=inter',
  'newsreader',
  'atelier',
  'v3 os',
];
const REQUIRED = [
  '#fff9f6',
  '#c13f6b',
  '#24171e',
  '#e8dce1',
  'plus jakarta sans',
  'lora',
  'narraza',
];
function norm(s) {
  return s.toLowerCase().replace(/[_+]/g, ' ');
}

function checkHandoffTokens() {
  // Positive control: the matcher must fire on a known-bad fixture.
  const badFixture = '<div class="bg-[#881337]">Atelier v3 OS</div><link href="family=Newsreader">';
  const badHits = BANNED.filter((b) => norm(badFixture).includes(b));
  if (badHits.length === 0) fail('positive control not detected by matcher');
  // Negative control: owner-canon fixture must be clean and complete.
  const goodFixture =
    '<div style="background:#FFF9F6;color:#24171E;border-color:#E8DCE1">' +
    '<span style="color:#C13F6B;font-family=\'Plus Jakarta Sans\',Inter,sans-serif">Narraza</span>' +
    '<p style="font-family:Lora,Georgia,serif">kutipan</p></div>';
  const goodNorm = norm(goodFixture);
  if (BANNED.some((b) => goodNorm.includes(b))) fail('negative control wrongly flagged');
  for (const r of REQUIRED) {
    if (!goodNorm.includes(r)) fail(`negative control missing required ${r}`);
  }
  if (failures.length > 0) return;
  const files = [
    join(ROOT, 'apps/web/design-handoff-desktop.html'),
    join(ROOT, 'apps/web/design-handoff-mobile.html'),
  ];
  for (const f of files) {
    let src;
    try {
      src = norm(read(f));
    } catch {
      fail(`missing ${f}`);
      continue;
    }
    if (src.length < 10000) fail(`${f}: suspiciously small (${src.length} chars)`);
    for (const b of BANNED) {
      if (src.includes(b)) fail(`${f}: banned token ${b}`);
    }
    for (const r of REQUIRED) {
      if (!src.includes(r)) fail(`${f}: missing required token ${r}`);
    }
  }
  if (failures.length === 0) ok('handoff-tokens', 'files=2 banned=0 required=all');
}

function checkFontBody() {
  const css = read(join(ROOT, 'apps/web/src/app/globals.css'));
  const bodyLine = css.split('\n').find((ln) => /--font-body\s*:/.test(ln)) || '';
  const editorLine = css.split('\n').find((ln) => /--font-editor\s*:/.test(ln)) || '';
  // Positive control: a Jakarta body line passes, an Inter-first body line fails.
  const goodBody = '--font-body: var(--font-plus-jakarta-sans), ui-sans-serif;';
  const badBody = "--font-body: var(--font-inter), 'Inter', sans-serif;";
  if (!/plus-jakarta-sans/i.test(goodBody)) fail('positive control fixture broken');
  if (!/var\(--font-inter\)/i.test(badBody)) fail('positive control fixture broken');
  if (!/plus-jakarta-sans/i.test(bodyLine)) fail('--font-body must lead with Plus Jakarta Sans');
  if (/var\(--font-inter\)/i.test(bodyLine)) fail('--font-body must not lead with Inter');
  if (!/lora/i.test(editorLine)) fail('--font-editor must map to Lora');
  if (/newsreader/i.test(editorLine)) fail('--font-editor must not map to Newsreader');
  if (failures.length === 0) ok('font-body', 'body=jakarta editor=lora');
}

if (mode === 'handoff-tokens') checkHandoffTokens();
else if (mode === 'font-body') checkFontBody();
else if (mode === 'all') {
  checkHandoffTokens();
  checkFontBody();
  if (failures.length === 0) ok('v3-parity-all', 'handoff+fonts');
} else {
  print(`UNLAZY_FAIL unknown mode ${mode}`);
  process.exit(1);
}
if (failures.length > 0) {
  for (const f of failures.slice(0, 20)) print(`UNLAZY_FAIL ${f}`);
  process.exit(1);
}

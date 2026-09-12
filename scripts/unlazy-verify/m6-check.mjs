// Repo-owned portable verifier for .unlazy/m6-prod gates.
// Usage: node scripts/unlazy-verify/m6-check.mjs <mode>
// Modes: raw-colors | components | parity | mobile-nav | tokens-resolve | showcase | a11y-static | headers | runbook | deploy-static
// Each mode prints exactly one success-only marker line on success and exits 0.
// Any failure prints UNLAZY_FAIL lines and exits 1. No external tools required.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
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
function collect(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      collect(p, exts, out);
    } else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}
function read(p) {
  return readFileSync(p, 'utf8');
}

// Positive control: the banned-pattern matcher must fire on a known fixture.
const BANNED = [
  'text-gray-',
  'bg-gray-',
  'border-gray-',
  'text-pink-',
  'bg-pink-',
  'text-slate-',
  'bg-slate-',
  'text-zinc-',
  'bg-zinc-',
  'text-neutral-',
  'bg-neutral-',
  'text-stone-',
  'bg-stone-',
  'text-red-',
  'bg-red-',
  'text-blue-',
  'bg-blue-',
  'text-green-',
  'bg-green-',
];
const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
function matchesBanned(src) {
  return BANNED.filter((b) => src.includes(b));
}

function checkRawColors() {
  // Self-test against a known positive control.
  const control = '<div className="text-gray-500 bg-pink-600">x</div>';
  if (matchesBanned(control).length === 0) fail('positive control not detected by matcher');
  const srcDir = join(ROOT, 'apps/web/src');
  if (!existsSync(srcDir)) fail(`source dir missing: ${srcDir}`);
  const files = collect(srcDir, ['.tsx', '.ts']);
  // Guard against silently scanning nothing (a zero-file pass is dishonest).
  if (files.length < 50) fail(`suspicious file count files=${files.length}, expected >=50`);
  for (const f of files) {
    const src = read(f);
    const bad = matchesBanned(src);
    if (bad.length > 0) {
      fail(`${f}: banned classes ${bad.join(',')}`);
    }
    // Raw hex outside CSS files is banned in ts/tsx (tokens live in globals.css).
    // Test files are exempt: they assert token values as string fixtures and
    // never render styles (e.g. token-inventory.test.ts expectedTokens).
    const isTest = /\.test\.tsx?$/.test(f);
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      if (isTest) return;
      const code = ln.split('//')[0];
      if (HEX_RE.test(code) && /className|style|color|background|border/i.test(code)) {
        fail(`${f}:${i + 1}: raw hex in tsx/ts`);
      }
    });
  }
  if (failures.length === 0) ok('raw-colors', `files=${files.length} hits=0`);
}

function checkComponents() {
  const base = join(ROOT, 'apps/web/src/components');
  const required = {
    // Route tabs are native links in a nav landmark (keyboard-safe without JS).
    'composites/Tabs.tsx': ['Tabs', '<nav', 'aria-current'],
    'composites/ProposalCard.tsx': ['ProposalCard'],
    'composites/FindingCard.tsx': ['FindingCard'],
    'composites/ChatBubble.tsx': ['ChatBubble'],
    'composites/QuickReplies.tsx': ['QuickReplies'],
  };
  for (const [rel, needles] of Object.entries(required)) {
    const p = join(base, rel);
    if (!existsSync(p)) {
      fail(`missing ${rel}`);
      continue;
    }
    const src = read(p);
    for (const n of needles) {
      if (n.includes('|')) {
        if (!new RegExp(n).test(src)) fail(`${rel}: missing pattern ${n}`);
      } else if (!src.includes(n)) fail(`${rel}: missing symbol ${n}`);
    }
    const bad = matchesBanned(src);
    if (bad.length > 0) fail(`${rel}: banned classes ${bad.join(',')}`);
  }
  if (failures.length === 0) ok('components', `required=${Object.keys(required).length}`);
}

function checkParity() {
  const app = join(ROOT, 'apps/web/src/app');
  const routes = [
    'app/page.tsx',
    'app/kredit/page.tsx',
    'app/pengaturan/page.tsx',
    'app/proyek/baru/page.tsx',
    'app/proyek/[projectId]/page.tsx',
    'app/proyek/[projectId]/chat/page.tsx',
    'app/proyek/[projectId]/konsep/page.tsx',
    'app/proyek/[projectId]/fondasi/page.tsx',
    'app/proyek/[projectId]/karakter/page.tsx',
    'app/proyek/[projectId]/fakta/page.tsx',
    'app/proyek/[projectId]/outline/page.tsx',
    'app/proyek/[projectId]/rahasia/page.tsx',
    'app/proyek/[projectId]/tulis/page.tsx',
    'app/proyek/[projectId]/naskah/page.tsx',
    'app/proyek/[projectId]/publish/page.tsx',
    'app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx',
    'app/proyek/[projectId]/bab/[chapterId]/cek/page.tsx',
    'app/proyek/[projectId]/bab/[chapterId]/naskah/page.tsx',
    'app/proyek/[projectId]/bab/[chapterId]/selesaikan/page.tsx',
    'app/proyek/[projectId]/bab/[chapterId]/publish/page.tsx',
  ];
  let checked = 0;
  for (const r of routes) {
    if (!existsSync(join(app, r))) {
      fail(`missing route ${r}`);
    }
    checked++;
  }
  if (failures.length === 0) ok('parity', `routes=${checked}`);
}

// tokens-resolve: every color utility in ts/tsx must resolve to a token
// defined in globals.css (or a well-known keyword). Catches dead classes
// like text-text-muted / border-border-default / bg-surface-muted that
// Tailwind silently ignores.
function checkTokensResolve() {
  const css = read(join(ROOT, 'apps/web/src/app/globals.css'));
  const defined = new Set();
  for (const m of css.matchAll(/--([\w-]+)\s*:/g)) defined.add(m[1]);
  // Controls anchored to a real Tailwind v4 compile against globals.css:
  // short forms resolve via --color-<name> aliases, long forms via the full
  // --color-text-*/--color-border-* variables; invented names resolve to
  // nothing and are dead classes.
  const probe = (cls) => isColorTokenResolved(cls, defined);
  if (probe('bg-surface-muted')) fail('positive control bg-surface-muted not flagged');
  if (probe('border-brand-subtle')) fail('positive control border-brand-subtle not flagged');
  if (!probe('text-primary')) fail('negative control text-primary wrongly flagged');
  if (!probe('text-text-primary')) fail('negative control text-text-primary wrongly flagged');
  if (!probe('border-default')) fail('negative control border-default wrongly flagged');
  if (!probe('bg-brand-soft')) fail('negative control bg-brand-soft wrongly flagged');
  if (failures.length > 0) return;
  const files = collect(join(ROOT, 'apps/web/src'), ['.tsx', '.ts']);
  const seen = new Set();
  for (const f of files) {
    // token-inventory lists CSS property names, not classes.
    if (/token-inventory/.test(f)) continue;
    const src = read(f);
    for (const m of src.matchAll(/["'`]([^"'`]*?)["'`]/g)) {
      const chunk = m[1];
      if (!chunk || !chunk.includes('-')) continue;
      for (const part of chunk.split(/\s+/)) {
        const cls = part.replace(/^[a-z-]+:/, '').replace(/\/\d+$/, '');
        if (
          !/^(text|bg|border|ring|divide|placeholder|decoration|outline|accent|caret|fill|stroke|from|via|to)-[a-z]/.test(
            cls,
          )
        )
          continue;
        const key = `${f}::${cls}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!isColorTokenResolved(cls, defined)) fail(`${f}: unresolved token class ${cls}`);
      }
    }
  }
  if (failures.length === 0) ok('tokens-resolve', `classes=${seen.size}`);
}

function isColorTokenResolved(cls, defined) {
  const dash = cls.indexOf('-');
  const prefix = cls.slice(0, dash);
  const name = cls.slice(dash + 1);
  // Non-color utilities sharing the prefix.
  if (
    prefix === 'text' &&
    /^(xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|nowrap|truncate|ellipsis|clip|balance|pretty|wrap)$/.test(
      name,
    )
  )
    return true;
  if (
    prefix === 'bg' &&
    /^(clip|cover|contain|auto|fixed|scroll|local|repeat|no-repeat|gradient|none)$/.test(name)
  )
    return true;
  if (
    prefix === 'border' &&
    /^([tblrxyse](-|$)|dashed|dotted|double|hidden|none|solid|collapse|separate)/.test(name)
  )
    return true;
  if (prefix === 'outline' && /^(offset|hidden|none|dashed|dotted|double|solid|\d)/.test(name))
    return true;
  if (/^(white|black|transparent|current|inherit)$/.test(name)) return true;
  if (name.startsWith('[') || name.includes('[')) return !/#[0-9a-fA-F]{3,8}/.test(name);
  return defined.has(`color-${name}`);
}

// showcase: dev-only component gallery exists, renders the canon set, and is
// guarded out of production with no production nav linking to it.
function checkShowcase() {
  const page = join(ROOT, 'apps/web/src/app/(preview)/komponen/page.tsx');
  if (!existsSync(page)) {
    fail('missing showcase apps/web/src/app/(preview)/komponen/page.tsx');
    return;
  }
  const src = read(page);
  for (const sym of [
    'Tabs',
    'ProposalCard',
    'FindingCard',
    'ChatBubble',
    'QuickReplies',
    'Banner',
    'ProgressChecklist',
    'Stepper',
  ]) {
    if (!src.includes(sym)) fail(`showcase missing ${sym}`);
  }
  if (!/NODE_ENV.*production.*notFound|notFound.*NODE_ENV/.test(src))
    fail('showcase missing production guard');
  const navFiles = collect(join(ROOT, 'apps/web/src/components/composites'), ['.tsx']).concat(
    collect(join(ROOT, 'apps/web/src/app/app'), ['.tsx']),
  );
  for (const f of navFiles) {
    if (/href=["']\/komponen["']/.test(read(f))) fail(`${f}: production nav links to dev showcase`);
  }
  if (failures.length === 0) ok('showcase', 'dev-only gallery');
}

function checkMobileNav() {
  const p = join(ROOT, 'apps/web/src/components/composites/MobileBottomNav.tsx');
  if (!existsSync(p)) {
    fail('missing MobileBottomNav.tsx');
  } else {
    const src = read(p);
    // Positive control for the label extractor.
    const fixture = "label: 'Beranda', label: 'Rencana'";
    if (extractNavLabels(fixture).length !== 2) fail('label-extractor self-test failed');
    const labels = extractNavLabels(src);
    for (const expected of ['Beranda', 'Rencana', 'Tulis', 'Cek']) {
      if (!labels.includes(expected)) fail(`mobile nav missing tab ${expected}`);
    }
    // Fifth tab ("Lainnya") lives in MobileMoreControl.
    if (!src.includes('MobileMoreControl')) fail('mobile nav missing Lainnya (MobileMoreControl)');
    if (!src.includes('grid-cols-5')) fail('mobile nav is not a 5-column grid');
    if (!/min-h-11|min-h-\[44px\]|min-h-12/.test(src)) fail('no >=44px touch target evidence');
  }
  if (failures.length === 0) ok('mobile-nav', 'tabs=5 touch>=44px');
}

function extractNavLabels(src) {
  const out = [];
  for (const m of src.matchAll(/label:\s*'([^']+)'/g)) out.push(m[1]);
  return out;
}

function checkA11yStatic() {
  const css = join(ROOT, 'apps/web/src/app/globals.css');
  const src = read(css);
  if (!/--focus-ring-width:\s*3px/.test(src)) fail('focus ring width 3px missing');
  if (!/prefers-reduced-motion/.test(src)) fail('reduced-motion block missing');
  const dlg = join(ROOT, 'apps/web/src/components/composites/ConfirmationDialog.tsx');
  const hook = join(ROOT, 'apps/web/src/components/composites/use-native-dialog.ts');
  if (!existsSync(dlg)) fail('missing ConfirmationDialog.tsx');
  else {
    // ESC handling lives in the shared native-dialog hook (cancel event).
    const combined = read(dlg) + (existsSync(hook) ? read(hook) : '');
    if (!/Escape|onKeyDown|onCancel|cancel/.test(combined))
      fail('dialog keyboard escape handling missing');
  }
  if (failures.length === 0) ok('a11y-static', 'focus+motion+keyboard');
}

function checkHeaders() {
  const candidates = [
    join(ROOT, 'apps/web/middleware.ts'),
    join(ROOT, 'apps/web/src/middleware.ts'),
    join(ROOT, 'apps/web/next.config.mjs'),
    join(ROOT, 'apps/web/next.config.ts'),
  ];
  const found = candidates.filter(existsSync).map(read).join('\n');
  if (!found) fail('no middleware or next config found');
  for (const h of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'frame-ancestors',
    'Referrer-Policy',
  ]) {
    if (!found.includes(h)) fail(`missing header ${h}`);
  }
  if (failures.length === 0) ok('headers', 'csp+hsts+frame+referrer');
}

function checkRunbook() {
  const p = join(ROOT, 'docs/runbook.md');
  if (!existsSync(p)) fail('missing docs/runbook.md');
  else {
    const src = read(p).toLowerCase();
    for (const h of ['deploy', 'rollback', 'kredit', 'backup', 'restore', 'alert']) {
      if (!src.includes(h)) fail(`runbook missing section ${h}`);
    }
  }
  if (failures.length === 0) ok('runbook', 'sections=6');
}

function checkDeployStatic() {
  const eco = join(ROOT, 'deploy/ecosystem.config.cjs');
  if (!existsSync(eco)) fail('missing deploy/ecosystem.config.cjs');
  const scripts = collect(join(ROOT, 'deploy'), ['.mjs', '.sh', '.cjs', '.ps1']);
  const body = scripts
    .map((s) => {
      try {
        return read(s);
      } catch {
        return '';
      }
    })
    .join('\n')
    .toLowerCase();
  for (const k of ['checksum', 'migrate', 'readiness', 'rollback']) {
    if (!body.includes(k)) fail(`deploy missing step ${k}`);
  }
  if (failures.length === 0) ok('deploy-static', `files=${scripts.length}`);
}

// exec-ok: run an arbitrary repo command; print the success marker only when
// the command exits 0. Usage:
//   node scripts/unlazy-verify/m6-check.mjs exec-ok -- <cmd> [args...]
function checkExecOk() {
  const sep = process.argv.indexOf('--');
  if (sep === -1 || sep === process.argv.length - 1) {
    print('UNLAZY_FAIL exec-ok missing -- <command>');
    process.exit(1);
  }
  const cmd = process.argv.slice(sep + 1).join(' ');
  try {
    execSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe', timeout: 600000 });
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    print(`UNLAZY_FAIL exec-ok exit=${e.status} signal=${e.signal} errno=${e.errno} cmd=${cmd}`);
    print(String(out).split('\n').slice(-15).join('\n'));
    process.exit(1);
  }
  print(`UNLAZY_OK exec-ok ${cmd}`);
}

const MODES = {
  'exec-ok': checkExecOk,
  'raw-colors': checkRawColors,
  components: checkComponents,
  parity: checkParity,
  'mobile-nav': checkMobileNav,
  'tokens-resolve': checkTokensResolve,
  showcase: checkShowcase,
  'a11y-static': checkA11yStatic,
  headers: checkHeaders,
  runbook: checkRunbook,
  'deploy-static': checkDeployStatic,
};

if (!MODES[mode]) {
  print(`UNLAZY_FAIL unknown mode ${mode}`);
  process.exit(1);
}
MODES[mode]();
if (failures.length > 0) {
  for (const f of failures.slice(0, 20)) print(`UNLAZY_FAIL ${f}`);
  process.exit(1);
}

# Task 5 Implementer Report

## Status

DONE

## Commit

- Base: `1a69f7d757f6a3725c6a06b458599ccafca5bbe3`
- Task 5: `b9cfe1bce249c1c34e6b0877e5477d9c1812bf48`
- Message: `feat(web): align landing with approved reference`

## Implemented

- Added semantic composite `BrandMark` and preserved old import path through compatibility re-export.
- Added desktop public header with four canonical anchors and login/register actions.
- Added accessible native-dialog mobile menu below desktop breakpoint, including initial focus, explicit close, Escape close, close-on-link, and focus restoration.
- Rebuilt landing composition in canonical order: hero, 3 problem cards, 6 workflow steps, 6 feature cards, 4 safe persona cards, 3 credit tiers, additive trust/FAQ, final CTA, footer.
- Added approved safe landing catalog copy and credit non-guarantee disclosure.
- Replaced landing raw palette values with semantic token utilities and reused primitives.
- Added source contract coverage for exact counts, labels, order, forbidden claims, and mobile dialog mechanics.

## TDD Evidence

### RED

Command:

`pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts -t "landing preserves exact reference|public mobile menu"`

Result: FAIL as expected, exit code 1.

Expected failures:

- Landing test could not find `id="masalah"` and remaining required sections/composition.
- Mobile menu source was absent, so dialog accessibility assertions failed.
- Summary: 2 failed, 4 skipped.

### GREEN

Focused command after implementation:

`pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts -t "landing preserves exact reference|public mobile menu"`

Result: PASS.

Final full command:

`pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts`

Result: PASS, 1 file and 6 tests.

## Validation

- `pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts` — PASS, 6/6.
- `pnpm --filter @narraza/web typecheck` — PASS, `tsc --noEmit`.
- `pnpm exec eslint apps/web/src/app/page.tsx apps/web/src/messages/app-id.ts apps/web/src/app/m0-w05.test.ts apps/web/src/components/BrandMark.tsx apps/web/src/components/composites/BrandMark.tsx apps/web/src/components/composites/PublicHeader.tsx apps/web/src/components/composites/PublicMobileMenu.tsx` — PASS, no output.
- `pnpm exec prettier --check apps/web/src/app/page.tsx apps/web/src/messages/app-id.ts apps/web/src/app/m0-w05.test.ts apps/web/src/components/BrandMark.tsx apps/web/src/components/composites/BrandMark.tsx apps/web/src/components/composites/PublicHeader.tsx apps/web/src/components/composites/PublicMobileMenu.tsx` — PASS, all matched files use Prettier style.
- `pnpm --filter @narraza/web build` — PASS, Next production build and TypeScript completed.
- `git diff --check` before commit — PASS. Git emitted expected Windows LF-to-CRLF working-copy warnings only.
- Scoped raw-palette scan on landing/public composites — PASS, no hex or raw pink/gray/rose/slate/zinc utilities.
- Landing forbidden-copy scan — PASS for forbidden draft/import/internal milestone phrases.

## Files

- `apps/web/src/app/m0-w05.test.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/BrandMark.tsx`
- `apps/web/src/components/composites/BrandMark.tsx`
- `apps/web/src/components/composites/PublicHeader.tsx`
- `apps/web/src/components/composites/PublicMobileMenu.tsx`
- `apps/web/src/messages/app-id.ts`

## Exact Snippet Corrections

1. Forbidden-copy assertion originally scanned all of `messages/app-id.ts`. Existing dashboard catalog outside Task 5 contains `Aku sudah punya draft`, so literal snippet would fail on unrelated existing Task 6+ copy. Smallest correction scopes scan to catalog block between `landing: {` and `shell: {`. Landing page and landing catalog remain fully checked; dashboard semantics remain untouched.
2. Literal assertion `expect(mobileMenu).toContain('{label}</a>')` conflicts with repository Prettier formatting, which places `{label}` and `</a>` on separate lines. Smallest correction uses `/\{label\}\s*<\/a>/`, preserving same semantic assertion while allowing formatting whitespace.

## Blocking Mobile No-JavaScript Navigation Fix

### Status

DONE

### Implemented

- Added server-rendered mobile `<noscript>` navigation containing exact four landing anchors plus `/masuk` and `/daftar`.
- Added no-JavaScript-only CSS that hides the dead enhanced-menu trigger; JavaScript-enabled users retain the existing accessible native-dialog menu unchanged.
- Used semantic token utilities and `lg:hidden`; desktop navigation and landing composition/copy remain unchanged.

### TDD Evidence

RED:

`pnpm --dir "D:/Coding/Narraza Fix/Narraza v3/.worktrees/feat-frontend-foundation" exec playwright test tests/e2e/landing-no-js.spec.ts --project=mobile`

Result: FAIL, 1 failed. Real mobile browser with `javaScriptEnabled: false` could not find `Navigasi utama mobile tanpa JavaScript`.

GREEN:

Same command after implementation: PASS, 1/1.

### Test Choice

Direct React server rendering from existing `m0-w05.test.ts` is not supported by current Vitest transform because web TypeScript preserves JSX; importing `PublicHeader.tsx` failed during Vite import analysis. Existing Playwright harness could run one bounded no-JavaScript landing test without adding Task 8 infrastructure, so regression coverage uses actual server output and browser semantics instead of source-string existence.

### Fix Files

- `apps/web/src/components/composites/PublicHeader.tsx`
- `tests/e2e/landing-no-js.spec.ts`
- `.superpowers/sdd/task-5-report.md`

## Concerns

- No product/code blocker.
- No auth, backend, domain, DB, worker, AI, package, or Task 6+ route changes.
- Root lint was not used because approved baseline documents existing nested-worktree `ambiguous tsconfigRootDir`; required scoped lint passed.
- Visual browser screenshot review remains controller/reviewer evidence work; source composition, responsive classes, and accessibility mechanics are implemented and validated here.

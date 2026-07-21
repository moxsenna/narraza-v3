# Handoff — Narraza v3, M0 remaining (W0.5 + W0.6)

**Written:** 2026-07-22, after M0 W0.1–W0.4 landed. Point-in-time handoff for a
fresh agent picking up the rest of M0. **Not a source-of-truth doc** — if this
conflicts with `docs/DECISIONS.md` / `docs/implementation-plan.md`, those win.

Repo: `D:\Coding\Narraza Fix\Narraza v3` · GitHub `github.com/moxsenna/narraza-v3`
(public) · branch `master` · last commit `65afe59`.

---

## 0. Read these first (source of truth, in priority order)

1. `docs/DECISIONS.md` (D1–D21) — **D21 is critical**: auth is email+password, not
   magic link.
2. `docs/narraza-v3-prd-rilis-1.md`
3. `docs/verification-matrix.md` — the invariant → test-name → CI-job contract.
4. `docs/narraza-v3-design-spec.md` (S1–S10; note **§1.3.1** pinned versions,
   **§6.1.1** session decision).
5. `docs/design.md` (brand/tokens) and the prototypes
   `narraza-landing.dc.html`, `narraza-app.dc.html`, `narraza-mobile.dc.html`
   (copy + layout for the shell/landing come from these).
6. `docs/implementation-plan.md` — **§4 = M0 spec**; **§3.4 = CI job names**;
   `docs/BRANCH_PROTECTION.md` = the 8 required checks.

Your work is **M0 W0.5 and W0.6** (implementation-plan.md §4). Do not start M1.

---

## 1. What is DONE (do not redo; do not break)

| WS | What | Status |
|----|------|--------|
| W0.1 | Monorepo scaffold: pnpm workspace, 5 packages (`core`,`application`,`ai`,`db`,`shared`) + 3 apps (`web`,`worker-gen`,`worker-outbox`), TS project refs, ESLint flat + Prettier, dependency-cruiser boundaries. | ✅ |
| W0.2 | Per-process env schemas in `packages/shared/src/env/` (`web`,`worker`,`outbox`) with all D12/D21 numbers as env defaults. `env-boundary` test green. `docker-compose.dev.yml` (postgres+mailpit). `.env.example` per process. | ✅ |
| W0.3 | `prisma/schema.prisma` M0 baseline (User, Session, EmailActionToken, RateLimitCounter, AuditEvent — all `timestamptz`). First migration applied. `packages/db/src/migrate.ts` = advisory-lock migration runner. Prisma 7 + `PrismaPg` adapter. | ✅ |
| W0.4 | Email+password auth end-to-end (D21): register → mandatory email verify (two-step) → login (lockout) → forgot/reset (revokes all sessions). Verified in a real browser + **51 automated tests** (incl. atomic-consume race on real Postgres). | ✅ |

**Auth invariants already proven — keep them passing:** atomic single-consume of
tokens, brute-force lockout, token cap (max 3), enumeration-safety (register &
reset), generic `INVALID_CREDENTIALS`, reset revokes all sessions, rate-limit
atomicity, `env-boundary`.

Auth pages already built (functional, M6 polishes visuals): `/daftar`, `/masuk`,
`/lupa-password`, `/verifikasi/selesaikan`, `/reset-password/baru`, and the
GET-confirm route handlers `/verifikasi/konfirmasi`, `/reset-password/konfirmasi`.
A **minimal** authed page exists at `/app` (`apps/web/src/app/app/page.tsx`) —
**W0.5 replaces it with the real app shell.**

---

## 2. Your tasks

### W0.5 — Shell & static pages  (model: **Opus** — mechanical, copy from prototype)

Plan §4 W0.5, verbatim:
1. **Landing skeleton** (hero + "cara kerja" + CTA; copy from `narraza-landing.dc.html`;
   final polish is M6). Currently `apps/web/src/app/page.tsx` is a placeholder.
   Hero secondary CTA is "Lihat cara kerja" anchor (D2/D19), **not** "Lanjutkan draft".
2. **App shell**: header (logo → dashboard; placeholder credit chip; avatar + "keluar"),
   sidebar with the 6 groups (PERSIAPAN/PERENCANAAN/PENULISAN/PEMERIKSAAN/PUBLIKASI/
   LAINNYA) with items **disabled** for now, and an **auth guard redirect** (unauth →
   `/masuk`). Layout lives under `apps/web/src/app/app/` (make it a route-group layout).
   Use `getCurrentUser()` from `apps/web/src/server/auth/session.ts` for the guard, and
   `logoutAction` from `.../auth/actions.ts` for "keluar".
3. **Dashboard empty state** (the real `kosong` state — see `§2.3` of the plan and
   `dashStates` in the prototype), `/privasi` + `/ketentuan` placeholder pages (D17),
   and **branded** `not-found.tsx` + `error.tsx` with a way back (lesson Y2).

Notes:
- Copy comes from the prototypes; move user-facing strings toward message codes
  (there's a stopgap catalog pattern at `apps/web/src/messages/auth-id.ts`; follow it,
  e.g. add `app-id.ts`). **No internal strings in the UI** (D-rule 4).
- Brand tokens are seeded in `apps/web/src/app/globals.css` (Tailwind v4 `@theme`).
  Full design system is M6 — don't build it now; just use the seeded brand primitives.
  brand-900 = `#641E35` (D19).
- Tap targets ≥44px, visible focus rings (baseline a11y).

### W0.6 — CI  (model: **Opus** — standard CI wiring)

Plan §4 W0.6 + §3.4:
1. `.github/workflows/ci.yml` with **exactly these 8 job names** (must match
   `docs/BRANCH_PROTECTION.md` verbatim, or branch protection can't reference them):
   1. `Lint & Typecheck`
   2. `Unit Tests`
   3. `Integration Tests`
   4. `Architecture Boundaries`
   5. `Migration (empty + drift)`
   6. `Security Smoke`
   7. `Contract Tests`
   8. `E2E (Playwright)`
   Triggers: `push` and `pull_request` targeting `master`. **No soft-fail**
   (`continue-on-error` / `|| true`) on any job (BRANCH_PROTECTION rule).
2. dependency-cruiser base rules already exist (`.dependency-cruiser.cjs`) — the
   Architecture job just runs `pnpm arch`.

What each job must actually run (map to existing scripts / infra):
- **Lint & Typecheck**: `pnpm lint` + `pnpm typecheck` (root `tsc -b`) + `pnpm --filter @narraza/web typecheck` + `pnpm format:check`.
- **Unit Tests**: `pnpm -r --filter "./packages/**" test:unit` (core/application/shared). No DB.
- **Integration Tests**: needs a **Postgres 16 service**; set `DATABASE_URL` + `TEST_DATABASE_URL`, run migrations (`pnpm --filter @narraza/db migrate`), then `pnpm --filter @narraza/db test:integration`. (db tests skip if `TEST_DATABASE_URL` unset — so CI MUST set it.)
- **Architecture Boundaries**: `pnpm arch`.
- **Migration (empty + drift)**: apply all migrations to an empty DB (`prisma migrate deploy` via the runner), then a drift check (`prisma migrate diff` / `migrate status`). Invariants: `migrate-empty`, `prisma-migrate-diff`.
- **Security Smoke**: `env-boundary` test + scan the built client bundle for AI keys / internal terms + a `no-internal-strings` subset. (For M0, a bundle grep for `OPENROUTER`/`GEMINI`/`service_restricted`/raw model ids is enough; wire the real scanner incrementally.)
- **Contract Tests**: no contract tests exist until M1 — make the job **exist and pass** (e.g. a `--passWithNoTests` vitest run over contract fixtures dir). It must be green, not skipped.
- **E2E (Playwright)**: install `@playwright/test` (pinned `1.61.1`, see §1.3.1), add a Playwright project (desktop 1280 + mobile 375 per D20, though M0 e2e = **auth smoke only**). The smoke test drives the **real** flow: register → read the verification link from the **Mailpit API** → verify → land on `/app` (and ideally login + reset). Needs Postgres + Mailpit services + a built web app + a seeded web env. There is a **manually-verified** version of this exact flow you can mirror (see §4).

**Exit gate M0** (implementation-plan.md §4 — all must be true before M1):
- [ ] Register → verify (Mailpit) → login → dashboard works in dev; forgot → reset → login works; **e2e auth green**.
- [ ] All **8 CI jobs green on `master`**; branch protection enabled (per `docs/BRANCH_PROTECTION.md`, after the first green run).
- [ ] `env-boundary`, `migrate-empty`, arch boundaries green.
- [ ] Stack versions recorded in design spec §1.3 — **already done (§1.3.1)**.

Branch-protection note: the 8 check names only appear in GitHub's UI **after the
first green CI run on `master`**. So: land CI green first, then the repo owner
enables branch protection.

---

## 3. Environment & how to run (a cold agent MUST read this)

Toolchain: **Node ≥22** (dev on 24), **pnpm 11**, **Docker**. `corepack enable`.

**Dev services** (`docker-compose.dev.yml`) — non-standard ports because
5432/1025 were taken by other local stacks on this machine:
- Postgres: host **5434** → `postgresql://narraza:narraza@localhost:5434/narraza`
- Mailpit SMTP: host **1026**; Mailpit **API/UI: host 8026** (e2e reads links here).
```bash
docker compose -f docker-compose.dev.yml up -d      # start
docker exec narrazav3-postgres-1 psql -U narraza -d narraza -c '\dt'   # sanity
```

**First-time setup / build order matters:**
```bash
pnpm install
cp .env.example .env                        # root .env: DATABASE_URL for Prisma CLI (port 5434)
pnpm --filter @narraza/db generate          # generate Prisma client (gitignored)
pnpm --filter @narraza/db migrate           # apply migrations (advisory-lock runner)
pnpm build                                   # BUILD PACKAGES FIRST — web imports compiled dist
```

**Run web in dev** (a real dev server is currently running on **:3007**; reuse or restart):
```bash
cd apps/web && cp .env.example .env.local    # then fill 3× 32-char secrets (see below)
#   set APP_URL=http://localhost:3007 and dev on the same port:
cd apps/web && PORT=3007 pnpm dev
```
`.env.local` needs `AUTH_SECRET`, `RATE_LIMIT_PEPPER`, `EMAIL_TOKEN_PEPPER`
(≥32 chars, all different), `DATABASE_URL_WEB` (port 5434), `SMTP_URL=smtp://localhost:1026`,
`EMAIL_FROM`, `APP_URL`. Peppers MUST differ from `AUTH_SECRET`.

**Quality gate (run before every commit — CI mirrors this):**
```bash
pnpm typecheck && pnpm --filter @narraza/web typecheck   # tsc -b + web tsc
pnpm lint && pnpm format:check
pnpm arch
pnpm -r --filter "./packages/**" test:unit
TEST_DATABASE_URL="postgresql://narraza:narraza@localhost:5434/narraza" pnpm --filter @narraza/db test:integration
pnpm build                                                # packages (dist) + next build + workers
```

---

## 4. Non-obvious landmines (these already bit; don't step on them again)

1. **Packages build to `dist`; web consumes compiled output — NOT `src`.**
   `next.config.ts` has **no** `transpilePackages`. Turbopack (Next 16 default)
   **cannot** map NodeNext `.js` imports to `.ts` (`extensionAlias` is unsupported),
   and the Prisma client uses `.js` imports. ⇒ **You must `pnpm build` (or `tsc -b`)
   the packages before `next build`/`next dev` picks up changes to a package.**
   `pnpm build` runs packages first (topological).
2. **Import style differs by location.** Inside **packages** (`packages/*/src`) use
   explicit NodeNext `.js` extensions (`./foo.js`). Inside **apps/web** use
   **extensionless** relative imports (Bundler resolution). Cross-package imports use
   the bare specifier `@narraza/x` (no extension).
3. **Sessions are custom, not Auth.js.** M0 has NO `next-auth`/`@auth/prisma-adapter`
   wired (design-spec §6.1.1). Session I/O is `packages/db/src/auth/session-store.ts`,
   consumed by web via `apps/web/src/server/auth/session.ts` (`getCurrentUser`,
   `setSessionCookie`, `logoutAction`). Use those; don't add Auth.js. (OAuth is a
   post-M0 follow-up — D21.)
4. **Prisma `migrate reset` / destructive commands are blocked for AI agents.**
   Prisma refuses and demands explicit user consent via
   `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<user's exact consent text>"`.
   **Ask the user first** (dev DB only; never prod). `migrate deploy`/`migrate dev`
   are fine.
5. **All timestamps are `timestamptz`** (`@db.Timestamptz(3)`). Keep it that way — the
   auth raw SQL compares columns to `now()` (which is `timestamptz`); tz-naive columns
   reintroduce timezone bugs.
6. **Generated Prisma client is gitignored** (`packages/db/src/generated/`). `db`'s
   `build`/`pretest` run `prisma generate` first, so CI/fresh clones regenerate it.
   dependency-cruiser, eslint, prettier all **exclude** it.
7. **Prettier ignores `docs/`** (source-of-truth docs are hand-authored). Don't rely
   on `pnpm format` to touch docs.
8. **`'use server'` files may only export async functions** — shared consts/types go in
   a sibling non-`use server` module (see `apps/web/src/server/auth/form-state.ts`).
9. **TypeScript is pinned 5.9.3, not 7.x** (typescript-eslint doesn't support TS7 yet).
   Don't "upgrade" it. Same for the whole pin table (§1.3.1) — no major bumps mid-M0.
10. **Integration tests share the dev DB** and truncate between tests; they need
    `TEST_DATABASE_URL`. Per-file schema isolation is an M1 harness task — don't run
    two integration files against the same DB in parallel yet.
11. **cookies() / headers() are async in Next 16** (`await cookies()`), and dev uses
    non-secure cookies (works over http); `next start`/prod forces secure cookies
    (won't set over plain http localhost). For local e2e use `next dev`.

---

## 5. Model discipline (project rule — remind the user each task)

Per the user's Opus/Fable table: **both W0.5 and W0.6 are Opus** (mechanical shell
transcription + standard CI wiring). Remind the user to be on **Opus** before starting;
the reminder is a one-time flag, not a gate — if they say proceed anyway, respect it.
Nothing in the remaining M0 work is Fable-class (no concurrency/money/crypto).

---

## 6. Suggested order for the delegated agent

1. Read §0 docs + skim `narraza-landing.dc.html` and `narraza-app.dc.html` for copy/layout.
2. W0.5: landing → app-shell layout + guard → dashboard empty state → /privasi /ketentuan → 404/error. Verify manually in the browser (dev on :3007, Mailpit on :8026).
3. W0.6: Playwright auth-smoke e2e first (locally green), then author `ci.yml` with the 8 jobs, wiring Postgres+Mailpit services and the build-before-web order. Push; confirm all 8 green on `master`.
4. Run the full quality gate (§3) + audit the M0 exit gate (§2). Then hand back for branch-protection enablement.

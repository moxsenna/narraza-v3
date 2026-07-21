# Narraza v3

AI Serial Fiction Production OS. **Build long fiction without losing the plot.**

Greenfield codebase, brownfield knowledge (see `docs/`). Source of truth, in
priority order: `docs/DECISIONS.md` (D1–D20) → `docs/narraza-v3-prd-rilis-1.md`
→ `docs/verification-matrix.md` → `docs/narraza-v3-design-spec.md` (S1–S10) →
`docs/design.md` → the HTML prototypes.

## Requirements

- **Node** ≥ 22 (`.nvmrc` pins 22; developed on 24)
- **pnpm** ≥ 11 (`corepack enable`)
- **Docker** (for the dev Postgres + Mailpit via `docker-compose.dev.yml`)

## Workspace layout

```
apps/
  web            Next.js App Router (adapter only)
  worker-gen     generation worker host (+ outbox consumer module, D11)
  worker-outbox  standalone outbox entrypoint (used when split into its own process)
packages/
  core           pure domain — no AI/DB/HTTP/Next
  application    use cases + UnitOfWork + ports
  ai             provider adapters, routing, prompts, parse, model-policy
  db             Prisma schema+client, repos implementing ports, Auth.js adapter (D8)
  shared         DTOs, zod schemas, per-process env schemas, i18n message codes, utils
prisma/          migrations (owned by packages/db)
deploy/          nginx, PM2 ecosystem, release/migrate/backup/restore scripts
```

Dependency direction is enforced by dependency-cruiser (`pnpm arch`): adapters →
application → core (pure) + ports. Core never imports AI/DB/Next/HTTP; web never
imports Prisma directly (D8).

## Quick start (dev)

```bash
corepack enable
pnpm install
cp .env.example .env                 # then fill values (see W0.2)
docker compose -f docker-compose.dev.yml up -d   # postgres + mailpit
pnpm db:migrate
pnpm dev                             # web on http://localhost:3000
```

## Common scripts (root)

| Script                              | What                                       |
| ----------------------------------- | ------------------------------------------ |
| `pnpm dev`                          | Run the web app                            |
| `pnpm build`                        | Build every workspace package/app          |
| `pnpm typecheck`                    | `tsc --build` across project references    |
| `pnpm lint`                         | ESLint (flat config)                       |
| `pnpm format` / `pnpm format:check` | Prettier                                   |
| `pnpm arch`                         | dependency-cruiser architecture boundaries |
| `pnpm test`                         | All package tests                          |

## Stack versions

Pinned at M0 (D7) and recorded in `docs/narraza-v3-design-spec.md` §1.3. No major
upgrades mid-M1–M8 without an explicit decision.

## Milestones

Execution follows `docs/implementation-plan.md` (M0 → M8), each with a hard exit
gate. Branch protection + the 8 required CI checks are documented in
`docs/BRANCH_PROTECTION.md`.

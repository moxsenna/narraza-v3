# Narraza v3 — Master Progress Checklist (M0–M8)

Living checklist derived from `docs/implementation-plan.md` so **tidak ada yang
terlewat**. Update the boxes as work lands. This tracks _coverage_; the binding
truth for each item stays in `implementation-plan.md`, `DECISIONS.md`, and
`verification-matrix.md`.

**Legend:** `[x]` done · `[~]` in progress / in open PR · `[ ]` not started.
**Model** column = the user's Opus/Fable discipline (remind before each task).
**Order is a hard sequence** M0→M8 (§15); only W6.1 / W4.3 fixtures / W7.1 may be
started early.

## Milestone status

| M | Title | Status |
|---|---|---|
| M0 | Repo, scaffold, auth, shell, CI | ✅ **done** (merged `master`, 8 CI checks green, branch protection on) |
| M1 | Domain core & critical schema | 🔄 W1.1–W1.5 merged to `master` (PR #1–#5); exit gate M1 still open (S3/S7 unit coverage + migration drift re-check) |
| M2 | Ports, UnitOfWork, user-origin flow | ⬜ not started |
| M3 | Jobs, worker, outbox, credit | ⬜ not started |
| M4 | AI layer (mock + real adapters) | ⬜ not started |
| M5 | Proposal accept, working draft, validation | ⬜ not started |
| M6 | Full UI, design system, a11y, e2e | ⬜ not started |
| M7 | Staging hardening | ⬜ not started |
| M8 | Production deploy & launch | ⬜ not started |

---

## M0 — Repo, scaffold, auth, shell ✅

- [x] **W0.1 Repo & tooling** _(Opus)_ — pnpm workspace, 5 packages + 3 apps, TS refs, eslint/prettier, dep-cruiser boundaries, versions pinned (D7) → design-spec §1.3.1
- [x] **W0.2 Env & config** _(Opus)_ — per-process zod env (web/worker/outbox), `env-boundary` test, docker-compose (postgres+mailpit), `.env.example` per process
- [x] **W0.3 Prisma baseline + migration runner** _(Opus)_ — User/Session/EmailActionToken/RateLimitCounter/AuditEvent (timestamptz), advisory-lock `migrate.ts`, CI migration job
- [x] **W0.4 Auth email+password two-step** _(Fable-class; done on Opus per user)_ — register → verify → login (lockout) → forgot/reset (revokes sessions); atomic consume; 51 tests
- [x] **W0.5 Shell & static pages** _(Opus)_ — landing, app shell (header/sidebar/guard), dashboard empty state, /privasi /ketentuan, branded 404/error
- [x] **W0.6 CI** _(Opus)_ — `ci.yml` 8 jobs (exact names), Playwright auth smoke, dep-cruiser
- **Exit gate M0**
  - [x] Register→verify(Mailpit)→login→dashboard; forgot→reset→login — e2e auth green
  - [x] 8 CI jobs green on `master`; branch protection active
  - [x] `env-boundary`, `migrate-empty`, arch boundaries green
  - [x] Stack versions recorded (design-spec §1.3.1)

---

## M1 — Domain core & critical schema

- [x] **W1.1 Full schema + raw SQL** _(Fable)_ — merged PR #1
  - [x] All Lampiran B tables via expand-only migrations (48 models)
  - [x] Raw SQL: partial unique `WHERE deleted_at IS NULL`; composite FK `(beat_id, accepted_prose_version_id)`; CHECK enums/status; key indexes (job claim, ledger dedupe, belief fold)
  - [x] N-1 fixture + `migrate-upgrade`; drift check
  - [x] Tests: `soft-delete-unique`, `prose-fk` (+ schema-inventory, credit-integrity, quality-gaps)
  - [x] **Merge PR #1 to `master`**
  - [ ] _Optional follow-up:_ comment the circular-FK insert order (job↔reservation, candidate↔prose, quote↔plan) + drop no-op `generated_candidates_job_project_guard` CHECK
- [x] **W1.2 Core values & policies** _(Fable)_ — merged PR #2
  - [x] `NarrativePosition {chapterId, beatId?, sequence}` + comparator
  - [x] `reveal-policy`: reveal+breadcrumbs+position → writer-guidance (safe) vs restricted guard set; truth never in guidance
  - [x] `expression-policy`: non-POV → behavioral directives, not raw belief
  - [x] `knowledge-policy`: belief-stream fold (sequence, createdAt, id); downgrade needs allowed reason
  - [x] `disclosure-policy`: fold FactDisclosure → ReaderFactState + retraction target
  - [x] `readiness-policy` (D5): weighted checklist → {percent, checklist[], nextRecommendation}
  - [x] `dependency-manifest`: canonical serialization (stable sort) + schema-version prefix + SHA-256; reject dup (entityType, entityId)
  - [x] `stale-policy`: dependency change → needs_revalidation|stale; global bump alone does NOT invalidate
  - [x] `prose-policy`, `repair-policy` (stop OR: resolved/limit/no-progress/repeat/regression)
  - [x] Tests: `expression-policy`, `belief-transition`, `disclosure-fold`, `foundation-readiness`, `dependency-hash`, `repair-policy`
- [x] **W1.3 Context packets** _(Fable)_ — merged PR #3
  - [x] 5 discriminated-union packets + builder allowlist (planner/validator=restricted; writer/repair=writer_safe; extraction=per use case)
  - [x] `planner_only` facts forbidden from writer packet
  - [x] Tests: `writer-packet-leak`, `writer-guidance-safe`
- [x] **W1.4 Deterministic validator** _(Fable)_ — merged PR #4
  - [x] Structural beat-contract checks; restricted-representation matcher (exact/alias/co-occurrence/proximity → matched|suspected|requires_semantic_review)
  - [x] `merge-findings`: AI only adds; deterministic blockers can't be removed/downgraded; `passed = no blocking`
  - [x] `toPublicFinding`: strip restrictedDetail → publicMessageCode
  - [x] Tests: `merge-findings`, adversarial fixtures for `prompt-injection-guard` (policy level)
- [x] **W1.5 Operation layers** _(Fable)_ — merged PR #5
  - [x] 3 type layers `ModelSuggestionDraft → NormalizedOperationDraft → CanonicalChangeOperation` (`op-type-boundary`)
  - [x] Resolution: ID alloc, tempRef, DAG + topo-sort, operationsHash; system-derived fields
  - [x] Allowlist ops + max counts per contract; `prose.accept` always last
  - [x] Tests: `op-type-boundary`, `tempref-resolve`, `op-allowlist`, `prose-accept-order` (unit), `repair-reextract` (unit)
- **Exit gate M1**
  - [x] All S3/S7 unit tests in verification matrix green (core unit: 670 tests)
  - [x] Migrate empty + N-1 green; drift clean (W1.1 CI + subsequent PRs)
  - [x] Core coverage: every policy has its own test file

---

## M2 — Ports, UnitOfWork, user-origin flow

- [ ] **W2.1 Ports & UnitOfWork (D9)** _(Fable)_
  - [ ] Port interfaces: Project/Foundation/Character/Fact/Outline/Reveal/Proposal/ChangeSet repos + Ledger/Audit/Outbox/Snapshot/Job (stub) ports
  - [ ] `unitOfWork.execute(fn, opts?)`: read-committed default; serializable opt-in; bounded retry (3, jitter, same requestId); tx-scoped ports
  - [ ] Prisma repos implement ports; `dbNow` helper
- [ ] **W2.2 Single write door** _(Fable)_
  - [ ] `commitCanonicalChangeSet`: validate → apply canon → bump revisions → `currentCanonicalVersion += 1` (once) → Audit + Outbox
  - [ ] User-origin proposal path (fact/reveal/outline post-lock) → ChangeSet `origin=user`
  - [ ] Tests: `fact-lifecycle`, `accept-proposal` (base: +1 per change set)
- [ ] **W2.3 Use cases + Server Actions** _(Opus)_ — all `authorizeActiveUser` + tenant scope
  - [ ] `createProject(jalur)` → project + intake session + opening template
  - [ ] `appendIntakeMessage` (persist only; AI reply = M4)
  - [ ] Foundation: `updateFoundationDraft`, `confirmFoundation`, `lockFoundation` (readiness guard + confirm)
  - [ ] Character CRUD; Fact CRUD via change set; Reveal + breadcrumbs CRUD (author_private)
  - [ ] Outline CRUD strict; `outline-downstream` guard (accepted-prose beats reject plain upsert)
  - [ ] Tests: `outline-downstream`, `concept-accept` (seeded), `idor` (e2e), `active-user-guard`
- [ ] **W2.4 Progress reducer v1 + plain pages** _(Opus)_
  - [ ] `ProjectProgressView → {stage, blockers[], nextAction, counts}` (`progress-view`)
  - [ ] Functional (unpolished) pages: dashboard filled/empty, project home, foundation, character, fact, outline, reveal
- **Exit gate M2**
  - [ ] Manual flow: create → chat persists → foundation → lock → outline 10 chapters — works in browser
  - [ ] `fact-lifecycle`, `outline-downstream`, `progress-view`, `idor`, canon +1 green
  - [ ] No query without tenant scope (PR review checklist)

---

## M3 — Jobs, worker, outbox, credit

- [ ] **W3.1 Job state machine** _(Fable)_
  - [ ] `GenerationJob` + `FOR UPDATE SKIP LOCKED` + leaseToken/fenceVersion; heartbeat (D12); reclaim sweeper
  - [ ] CAS transitions; running→queued (fenced exec retry); terminal immutable
  - [ ] Cancel (queued=release; running=`cancelRequestedAt`); manual retry = new job `retryOfJobId`
  - [ ] `apps/worker-gen` claim loop, graceful SIGTERM shutdown, PM2 ecosystem file
  - [ ] Tests: `job-terminal`, `exec-retry`, `cancel-queued`, `retry-new-job`, `lease-fence-publish`
- [ ] **W3.2 WorkflowInvocation & three-phase attempt** _(Fable)_
  - [ ] Invocation per stage key; attempts; CAS winner; late attempt records usage, not winner
  - [ ] Three-phase harness (Tx create attempt → external mock → Tx finalize+settle → CPU validate → Tx C fenced publish)
  - [ ] Tests: `invocation-winner`, `late-attempt`, `tombstone-mid-attempt`
- [ ] **W3.3 Credit engine (S2.6 + D4 + D6)** _(Fable)_
  - [ ] Ledger append-only + dedupe; reservations + closing; `safeRelease ≥ 0`; exposure exceeded → ops incident
  - [ ] `issueCreditQuote` bound to workflowPlanHash+dependencyHash+maxMicroIdr+expiry(10m); consume once
  - [ ] Confirm: revalidate owner/quote/hash/balance → jobId + reserve → enqueue (idempotent by requestId)
  - [ ] Zero-charge: no-usable-output → full release; provider cost → system via AIUsageEvent
  - [ ] Display conversion (D6): `microIdrToCredits` floor/ceil; `CreditSummaryView {available, held, reconciling}`
  - [ ] Retention sweeper (unused quote/bundle, D12)
  - [ ] Tests: `credit-quote`, `reservation-exposure`, `failed-job-zero-charge`, `credit-rounding`
- [ ] **W3.4 Outbox** _(Fable)_
  - [ ] OutboxEvent + receipts (processing/completed/uncertain/dead + deliveryGeneration); consumer module in worker (D11); idempotent handler; dead replay = new generation, same dedupeKey
  - [ ] Tests: `outbox-idempotent`, `outbox-uncertain-delivery`, `outbox-replay-generation`
- [ ] **W3.5 UI mechanics** _(Opus)_
  - [ ] `CreditQuoteCard` generic (all paid actions, D4)
  - [ ] `JobPhasePanel` (public phases, cancel, no %) + polling (D12) + recovery banner + JOB_ALREADY_ACTIVE
  - [ ] Credit page (normal/low) + header chip from same `CreditSummaryView`
  - [ ] Early e2e: `job-recovery` (mock job), `credit-summary`
- **Exit gate M3**
  - [ ] Mock job end-to-end from UI: quote → confirm → phases → success/fail → credit consistent; refresh mid → recover
  - [ ] All S8 + credit matrix tests green
  - [ ] `kill -9` worker mid-job → correct reclaim, no double publish (manual + fence test)

---

## M4 — AI layer (mock + real adapters)

- [ ] **W4.1 Port & mock provider** _(Opus, after pattern)_
  - [ ] `buildWorkflowPlan`, `executeSingleAttempt`, `parseOutput`, `classifyError`, `decideNextAction`
  - [ ] Mock provider deterministic per fixture + fault injection; `AI_ENABLE_MOCK` non-prod only
- [ ] **W4.2 Routing & pricing** _(Opus)_
  - [ ] RoutingPlan per stage + execution profiles; tier→profile; worst-case budget → quote basis
  - [ ] `ModelPriceSnapshot` immutable + seeding; ceil estimates; requested vs resolved model ID
  - [ ] Tests: `request-beat-snapshot`, `credit-quote-plan-binding` (full)
- [ ] **W4.3 Prompt projectors + parsing (D13)** _(Fable for 1st pattern + injection wrapping; Opus for rest)_
  - [ ] Typed projector per contract (intake-reply, concept×3, foundation-fill, character-build, outline-10, beat-write, judge, repair, extraction, publish-package)
  - [ ] Explicit version + content hash; delimiter-wrap user content; zod `.strict()`; parse-repair path
  - [ ] Judge → publicMessageCode (+internalRationale restricted)
  - [ ] Tests: contract fixtures per projector, `proposal-operation-hash`, `prompt-injection-guard`
- [ ] **W4.4 Model policy (D14)** _(Fable — security/governance decision)_
  - [ ] `packages/ai/model-policy.ts` + `docs/model-policy.md`; restricted packet → allowlist only, else config error
  - [ ] Test: `model-policy-allowlist`
  - [ ] **Gate:** final no-training/no-retention provider list reviewed & signed by owner
- [ ] **W4.5 Real adapters** _(Opus)_ — OpenRouter + Gemini (normalized errors, timeout, usage); env-gated; first used staging M7
- [ ] **W4.6 Wire product workflows** _(Opus)_
  - [ ] Intake reply (free fair-use D4, no card); signal extraction → sufficiency indicator
  - [ ] Concept-gen (3) → pick → foundation draft (`concept-accept` full)
  - [ ] Foundation-fill, character-build, outline-10 → proposals (Accept/Edit/Reject), not direct canon
  - [ ] Beat-write: writer→judge in one plan; 1–3 candidates → GeneratedCandidate
  - [ ] Repair: sanitized directives → new version+proposal; full re-extraction
  - [ ] Publish-package → ArtifactProposal
  - [ ] Integration tests per workflow (success, parse-fail→repair, total-fail→zero-charge)
- **Exit gate M4**
  - [ ] From UI (dev, mock): chat reply; 3 concepts; foundation filled; outline 10; scene with 1–3 candidates; repair; publish package
  - [ ] `command-no-ai`, `model-policy-allowlist`, `prompt-injection-guard`, parse contracts — green
  - [ ] Model policy doc approved

---

## M5 — Proposal accept, working draft, validation binding

- [ ] **W5.1 Working draft & versions** _(Opus, CAS pattern from M2/M3)_
  - [ ] `ProseWorkingDraft` per (user, beat) unique; autosave CAS revision; conflict → DTO
  - [ ] Snapshot → immutable `ProseVersion` (revision + content hash); pick candidate = seed draft
  - [ ] Test: `working-draft`
- [ ] **W5.2 Validation & repair binding** _(Fable/Opus)_
  - [ ] `ValidationReport` bound (proseVersionId, proseContentHash, policyVersion); deterministic validator + AI judge (merge-findings)
  - [ ] Edit draft → hash change → report stale (`validation-hash`)
  - [ ] Override only server-allowlisted findings + reason (`override-allowlist`)
  - [ ] Safe Repair orchestration: stop conditions, before/after, result = new ProseVersion + Proposal, never auto-accept
- [ ] **W5.3 Full atomic accept (S4.4)** _(Fable, no compromise)_
  - [ ] Lock proposal+group+project → ownership → status guard → stale decision → supersede pre-check → eligibility → CAS ops → bump revisions → canon +1 once → accept + supersede siblings → audit/outbox
  - [ ] CAS fail → new tx conditional `WHERE status='pending'` → stale
  - [ ] User-edited prose → Proposal `source=user` + re-extraction
  - [ ] Publish artifact accept without canon bump
  - [ ] Tests: `accept-proposal`, `accept-cas-stale`, `accept-supersede`, `proposal-unrelated-version-bump`, `user-proposal`, `publish-artifact`, `prose-accept-order` (integration), `proposal-dto` (contract)
- [ ] **W5.4 Close Chapter & PublicProposalView** _(Opus)_
  - [ ] Read model sanitized diff + server-derived `availableActions`; high-risk → second confirm
  - [ ] "Terapkan & jadikan resmi" = accept chapter change set
- [ ] **W5.5 Final progress reducer + intake sufficiency** _(Opus)_
  - [ ] Reducer covers all stages to publish; nextAction per page; sidebar badges
  - [ ] Deterministic intake sufficiency → CTA "Susun 3 Konsep"
- **Exit gate M5**
  - [ ] Full mock flow: intake → concept → foundation lock → outline → write → check → repair → accept → manuscript → publish — from UI, no manual DB
  - [ ] All S2/S4/S7/S9 invariants (proposal/canon/draft/validation) green

---

## M6 — Full UI, design system, a11y, e2e

- [ ] **W6.1 Design system** _(Opus)_ — _may start early (from M3)_
  - [ ] Tailwind v4 theme from design.md §25 tokens (semantic); lint rule bans raw hex/pink
  - [ ] Plus Jakarta Sans variable (self-host woff2) + Lora; type scale §10.3
  - [ ] Core components (shadcn-adapted): Button×4, Input/Textarea autosize, Card, Chip/Badge, Dialog (focus trap + confirm checkbox), BottomSheet, Toast, Skeleton, Banner, Tabs, ProgressChecklist, Stepper, EmptyState, `CreditQuoteCard`, `JobPhasePanel`, `ProposalCard`, `FindingCard`, ChatBubble + QuickReplies
  - [ ] Storybook-lite OR `/dev/komponen` (dev only)
- [ ] **W6.2 Page-by-page** _(Opus)_ — every §2.3–§2.17 state, final copy from prototype → message codes
  - [ ] Landing final + privacy FAQ + Privasi/Ketentuan pages
  - [ ] Dashboard (5 states) · Create Project (5 paths, draft disabled)
  - [ ] Chat Narra (5 states; subtle fair-use indicator)
  - [ ] Concept (3) · Foundation (draft/locked + readiness + lock dialog) · Character · Fact
  - [ ] Outline (hierarchy + beat detail + locked downstream + approve/lock dialogs) · Secret Schedule (timeline + Advanced inspector)
  - [ ] Write Room (11 states + editor 4 states + Advanced safe-material panel) · Manuscript
  - [ ] Check Story (5) · Close Chapter (2) · Publish (2)
  - [ ] Credit (2) · Settings (profile, mode, tier, sessions, delete account)
  - [ ] Mobile: bottom nav 5 tabs, sticky primary, sheet, tap target ≥44px — all pages
- [ ] **W6.3 Accessibility & motion** _(Fable pass at end for leak audit)_
  - [ ] AA contrast, 3px focus ring, keyboard path, live regions (job/autosave), reduced-motion, motion durations §14
  - [ ] design.md §26 checklist per page → `docs/review/`
- [ ] **W6.4 Full e2e** _(Opus)_
  - [ ] `vertical-slice` (desktop) + `vertical-slice-mobile` (375px): register→verify→login → project → intake → concept → foundation lock → outline → beat write (mock) → candidate → check → accept → manuscript → publish → credit consistent
  - [ ] `foundation-lock`, `job-recovery`, `credit-summary`, `no-internal-strings` (DOM scan), `idor`
- **Exit gate M6**
  - [ ] Every §2 row satisfied (row-by-row audit, recorded)
  - [ ] Vertical slice desktop + mobile green in CI
  - [ ] a11y & brand §26 checklist passes for all main-flow pages

---

## M7 — Staging hardening

- [ ] **W7.1 Staging infra** _(Opus)_ — _may start early (from M6)_
  - [ ] VPS Ubuntu LTS: non-root deploy user, UFW, fail2ban, unattended-upgrades; Postgres 16 least-priv web/worker/outbox users; nginx + TLS + HTTP/2; PM2 2 procs + startup
  - [ ] Release structure `releases/<checksum>/` + `current` symlink; deploy script (upload→verify checksum→drain→migrate(lock)→symlink→reload→readiness+smoke)
  - [ ] Deploy-tests: `migration-runner-lock`, `readiness-migration-version`, `deploy-checksum`, `migrate-upgrade`
- [ ] **W7.2 Production email** _(Opus)_ — Resend domain SPF/DKIM/DMARC; final verify+reset templates; inbox placement (Gmail/Yahoo)
- [ ] **W7.3 Real AI (sandbox)** _(Opus infra / Fable calibration)_
  - [ ] OpenRouter + Gemini staging keys; model policy enforced; run all workflows with real models; prompt tuning (version+hash bump)
  - [ ] **Price calibration (D6):** measure real cost → price snapshots → set `MICRO_IDR_PER_CREDIT` + initial grant → validate quote ≥ actual in ≥95%
- [ ] **W7.4 Security** _(Fable)_
  - [ ] Security headers (CSP nonce, HSTS, frame-ancestors none, referrer-policy), cookie flags, `pnpm audit` + lockfile review, secret scanning, manual IDOR & rate-limit on staging, internal-only health/readiness
  - [ ] Log review: zero service_restricted/security in logs (sampling + auto grep)
- [ ] **W7.5 Backup, restore, observability (D15/D16)** _(Fable for encryption correctness)_
  - [ ] Nightly pg_dump + artifacts → off-VPS encrypted object storage; 30-day retention; auto size/checksum verify
  - [ ] **Documented restore drill** from offsite → empty VPS → readiness green (RPO/RTO proof)
  - [ ] 5-min alert sweeper (job dead, closing >6h, outbox dead/uncertain >1h) + daily ledger reconcile → ops email; fault-injection test each alert
  - [ ] `docs/runbook.md`: deploy, rollback, credit/job/outbox incident, secret rotation, restore
- [ ] **W7.6 Light load & stability** _(Opus)_
  - [ ] k6: 50 users browsing + 10 parallel jobs; no 5xx, p95 < 1.5s, no lease stealing
  - [ ] 24h soak with periodic jobs; zero reservation/lease leak
- **Exit gate M7**
  - [ ] Full vertical slice on STAGING with real AI + real email — green
  - [ ] Offsite restore drill succeeds & documented; all alerts fire-tested
  - [ ] Credit calibration signed by owner (per-action price + initial grant)
  - [ ] W7.4 security checklist complete

---

## M8 — Production deploy & launch

- [ ] Provision production VPS (same spec; separate secrets; new peppers), DNS+TLS, deploy the SAME staging-passed artifact (identical checksum) _(Opus; Fable sign-off)_
- [ ] Production smoke: readiness, register+verify+login real, 1 internal project end-to-end (then purge — tests purge path)
- [ ] Seed: new-user credit grant; fair-use config; verify production model policy
- [ ] Final legal pages (Privasi/Ketentuan) reviewed & published
- [ ] Day-1 monitoring: alerts active, manual ledger reconcile day 1, daily error-budget review week 1
- [ ] **DoD sign-off (PRD §11):** whole verification matrix green; immutable artifact + checksum; runbook + env docs + migration metadata + restore drill available; **§2 functional-map audit: no unmet row**
- **Exit gate M8 (= Rilis 1 done)**
  - [ ] All PRD §11 DoD items checked with evidence (CI run links, drill docs, §2 audit)

---

## Cross-cutting gates (don't forget)

- [ ] **§2 functional map** — the CLOSED scope contract: every prototype page/state → mechanism → milestone. Audited row-by-row at M6 and M8.
- [ ] **verification-matrix.md** — every invariant → test → CI job. Keep it the single source; add a row before implementing a new invariant.
- [ ] **No internal strings in UI** (`no-internal-strings`, `proposal-dto`) — enforced continuously.
- [ ] **Model discipline** — remind Opus/Fable before each workstream (see the milestone table above).

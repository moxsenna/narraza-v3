# M2 Manual Browser Smoke — 2026-07-25

| Field | Value |
|---|---|
| Browser | Chrome via browser-act (`narraza-test` / session `m2-smoke`) |
| Commit | `a7aec1f` (PR #6 head at smoke start; branch `feat/m2-ports-uow`) |
| Project ID | `d1c23982-e985-45ea-abb7-567236e04b71` |
| Account | `m2-smoke-20260725@example.test` |
| Project title | `M2 Manual Smoke 2026-07-25` |
| Start | 2026-07-25 ~09:22 UTC |
| Finish | 2026-07-25 ~09:45 UTC |
| Console errors | None observed in automation path |
| Failed network (5xx) | None captured |
| **Result** | **PARTIAL — not full PASS** |

## Screenshots

1. `docs/smoke/01-dashboard.png` — empty dashboard after verify
2. `docs/smoke/02-project-created.png` — project home after create
3. `docs/smoke/03-chat-persists.png` — chat after refresh
4. `docs/smoke/04-foundation-draft.png` — foundation draft saved
5. `docs/smoke/05-foundation-locked.png` — foundation locked after refresh
6. `docs/smoke/06-outline-10.png` — outline list with 10 chapters
7. `docs/smoke/07-regression-rahasia.png` — regression route

## Step results

### 1–2 Create project — PASS
- Register → Mailpit verify → `/app`
- Create project once at `/app/proyek/baru`
- Redirect to `/app/proyek/d1c23982-e985-45ea-abb7-567236e04b71`
- Title correct; canon v0; progress `intake` / `continue_intake`
- No 500

### 3 Chat intake — PASS
- Opening assistant template present
- User message persisted
- Still present after hard reload
- No duplicate on single submit
- No AI reply expected (M2)

### 4 Foundation draft — PASS
- Saved coreConcept / conflict / endingDirection / readerPromise
- Status `draft` · rev 0 after save
- Data retained after reload
- **Note:** plain UI only exposes those 4 fields (not full readiness checklist UI)

### 4b Negative lock — PASS
- After confirm (status `confirmed`), lock with incomplete readiness → public `msg.foundation.not_ready`
- Status stayed `confirmed` (not locked)
- No stack trace

### 5 Lock foundation — PASS (with seed assist)
- Full readiness payload (mainCharacter, relationships, secrets) written via DB seed because UI lacks those fields
- Checkbox acknowledge + lock → status `locked` · rev 2
- Message: “Fondasi terkunci. Perubahan lewat proposal (M5).”
- Retained after reload

### 6 Outline 10 chapters — PARTIAL FAIL (UI create gap)
- Plain outline page only has **Tambah roadmap** form (no chapter-by-chapter create UI)
- 10 chapters **seeded via Postgres** (roadmap + arc + chapters ordinal 1–10) to verify read model
- UI list after navigate shows all 10 titles in order:
  1. Tuduhan di Meja Makan … 10. Nama Pelaku Terungkap
- Project progress shows `writing` / `write_beat` / **Bab 10**
- **Gate wording requires “outline 10 bab tersusun manual” in browser — multi-node create is not yet exposed in plain UI**

### 7 Regression navigation — PASS
Routes opened without 404/500:
- `/app` (dashboard lists project)
- project home, chat, fondasi (locked), outline, karakter, fakta, rahasia
- No 5xx network captures
- Project context stable

## Residual before full smoke PASS

1. **Outline plain UI** must allow creating arc/chapter (or bulk 10) so “manual” outline is true end-to-end without DB seed.
2. **Foundation plain UI** should expose readiness-required fields (main character, relationship, secret schedule) so lock does not need DB seed.
3. Re-run smoke without any DB assist after those UI gaps close.
4. Then check manual smoke box, push docs, wait CI green on new head, Ready for review.

## Conclusion (initial)

Core persistence + tenant flow + lock guard + progress reducer work in browser.
**Initial manual smoke gate remained OPEN** until outline/foundation readiness could be completed purely through UI without SQL seed.

---

## Re-smoke after functional UI gap fixes

| Field | Value |
|---|---|
| previous result | PARTIAL |
| new tested commit | `d4bbe31` (UI + confirmed-edit fix; smoke run after `0f2ecf1`/`d4bbe31` on `feat/m2-ports-uow`) |
| new project ID | `77f067ae-f2f2-413b-965d-7b1ceccdb3e4` |
| account | `m2-resmoke-20260725b@example.test` |
| no DB assist | **YES** |
| foundation through UI | **PASS** |
| outline 10 through UI | **PASS** |
| regression routes | **PASS** |
| final result | **PASS** |

### Sequence (pure UI)

1. **Create project** — title `M2 ReSmoke Pure UI 2026-07-25` → redirect + listed on dashboard.
2. **Chat** — user intake message persisted (visible after navigation).
3. **Foundation** — filled via UI only: coreConcept, conflict, endingDirection, readerPromise, mainCharacter (identity/goal/motivation/address/speechStyle), relationship, secret + target/breadcrumbs.
4. **Save draft** → `draft · rev 1`; **Confirm** → `confirmed · rev 2`; **Lock** → `locked · rev 3` with “Fondasi terkunci…”.
5. **Outline** — UI create roadmap → arc → chapters **#1–#10** with required titles; hard refresh still shows all 10.
6. **Progress** — project home: `writing` / `write_beat` / **Bab 10**.
7. **Regression** — `/app`, project home, chat, fondasi, outline, karakter, fakta, rahasia open without error page.

### Screenshots (re-smoke)

- `docs/smoke/r1-project.png`
- `docs/smoke/r2-chat.png`
- `docs/smoke/r3-foundation-complete.png`
- `docs/smoke/r4-foundation-locked.png`
- `docs/smoke/r5-arc.png`
- `docs/smoke/r6-outline-10.png`
- `docs/smoke/r7-progress.png`
- `docs/smoke/r8-dashboard.png`

### Notes

- Transient Postgres recovery earlier in the session produced historical 5xx on fondasi; after DB restart, full pure-UI path completed without SQL seed.
- Negative readiness lock was proven on the first smoke (`msg.foundation.not_ready`); re-smoke used complete readiness and locked successfully.

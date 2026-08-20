# Narraza Frontend Foundation — Visual Reference Inventory (PR1)

**Branch:** `feat/frontend-foundation`  
**Head SHA:** `1b1d4d0e8c53a09cf55d3498c25013a5708000ec`  
**Evidence root:** `docs/review/frontend/pr1/screenshots/`

## Coverage Summary

| Category | Screens | Viewports | Total Images |
|----------|---------|-----------|--------------|
| Landing page | `/` | 375, 768, 1280, 1440 | 4 |
| Auth entry | `/masuk` | 375, 768, 1280, 1440 | 4 |
| Global shell (dashboard) | `/app` | 375, 768, 1280, 1440 | 4 |
| Project shell | `/app/proyek/{id}` | 375, 768, 1280, 1440 | 4 |
| **Total** | | | **16** |

All images are full-page PNGs; dimensions match viewports; contact sheet and four full project-shell images were visually inspected; UUID/raw project ID absent from body content and screenshots; evidence removed after inspection per Task 8 instructions.

## File Naming Convention

`{category}-{width}.png`

Examples:
- `landing-375.png`
- `auth-1280.png`
- `global-shell-768.png`
- `project-shell-1440.png`

## Route Semantics (PR1 only)

### Public Routes

- `/` — Landing page dengan canonical order: masalah → cara kerja → fitur → untuk siapa → kredit → kepercayaan → CTA → footer
- `/masuk` — Auth card (login form + resend verification link leaf)
- `/daftar` — Auth card (registration form)
- `/legal/kebijakan-privasi` — Legal placeholder (presentational)
- `/legal/syarat-ketentuan` — Legal placeholder (presentational)

### Authenticated Routes (PR1 scope)

- `/app` — Global shell, dashboard state; no project shell/sidebar/menu proyek buttons
- `/app/proyek/baru` — Create project Server Action boundary (UI-only); no fabrications
- `/app/proyek/{projectId}` — Project shell present exactly one of: sidebar (desktop ≥1280), drawer (tablet 768–1279 bottom nav + dialog), or sheet (mobile 375 bottom nav + Lainnya dialog)
- `/app/proyek/{projectId}/chat` — Chat Narra (shell present, capability PRESENTATION)
- `/app/proyek/{projectId}/outline` — Rencana Cerita (shell present, capability PRESENTATION)

### Disabled / Deferred Capabilities (NOT WIR ed in Nav as actionable)

Presentational capabilities rendered disabled/unavailable via `CapabilityNotice`:
- Project: `concept`, `foundation.manage`, `manuscript.view`, `publish.view`, `characters.read`, `secrets.read`, `facts.read`
- Chapter: `write.compose`, `check.run`, `complete.run`, `manuscript.view`, `publish.build`
- App: `credit.view`, `settings.view`, `project.import`

Disabled items appear in navigation containers with `aria-disabled="true"` on the container and zero nested links; reasons visible without hover. No modal dialogs gate these; they are read-only presentational shells.

## Navigation IA by Responsive Breakpoint

### Desktop (≥1280px)

Permanent sidebar groups:
- PERSIAPAN: Beranda, Chat Narra, Fondasi, Karakter
- PERENCANAAN: Rencana Cerita, Jadwal Rahasia, Fakta
- PENULISAN: Naskah, Tulis
- PEMERIKSAAN: Cek Cerita
- PUBLIKASI: Paket Publish
- LAINNYA: Kredit & Penggunaan, Pengaturan

Konsep/Selesaikan Bab/Tutup Bab excluded from permanent nav.

### Tablet (768–1279px)

Bottom nav: Beranda, Rencana, Naskah, Cek, Lainnya + native `<dialog>` side drawer with description + Escape/focus restoration.

### Mobile (375px)

Bottom nav: Beranda, Rencana, Tulis, Cek, Lainnya + native `<dialog>` sheet with Escape/focus restoration.

## State Axes Observed

Capability (REAL/PRESENTATION/DISABLED), view (loading/ready/empty/error/stale), mutation (idle/saving/saved/blocked/error), validation (not-run/running/ready/stale), presentation (editor/comparison/preview). No effective permissions fabricated; PRESENTATION/DISABLED always UNAVAILABLE.

---

*This inventory is generated directly from HEAD source; it does not claim behavior beyond PR1 boundaries.*

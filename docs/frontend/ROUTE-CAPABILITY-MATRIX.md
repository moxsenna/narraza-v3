# Narraza Frontend Foundation — Route/Capability Matrix (PR1)

**Branch:** `feat/frontend-foundation`  
**Head SHA:** `1b1d4d0e8c53a09cf55d3498c25013a5708000ec`

## Legend

| Column | Values |
|--------|--------|
| Capability Mode | `REAL` = fully available, `PRESENTATION` = preview only, `DISABLED` = unavailable |
| Action Policy | `STATIC_AVAILABLE` = public static entry, `SERVER_DERIVED` = tenant/ownership sensitive, `UNAVAILABLE` = never enabled |
| Auth | Required for authenticated routes; `anonymous` for public |
| Shell | `global` = dashboard only, `project` = project context, `none` = public |

## Public Routes (auth = anonymous)

| Route | Purpose | Capability Key | Mode | Policy | Shell |
|-------|---------|----------------|------|--------|-------|
| `/` | Landing | `landing.view` | REAL | STATIC_AVAILABLE | none |
| `/masuk` | Login | `auth.login` | REAL | STATIC_AVAILABLE | none |
| `/daftar` | Register | `auth.register` | REAL | STATIC_AVAILABLE | none |
| `/legal/kebijakan-privasi` | Privacy | `legal.privacy` | REAL | STATIC_AVAILABLE | none |
| `/legal/syarat-ketentuan` | Terms | `legal.terms` | REAL | STATIC_AVAILABLE | none |

## Authenticated Routes (auth = required)

| Route | Purpose | Capability Key | Mode | Policy | Shell | Notes |
|-------|---------|----------------|------|--------|-------|-------|
| `/app` | Dashboard | `app.dashboard.view` | REAL | SERVER_DERIVED | global | Shows empty or user projects; no project shell/sidebar |
| `/app/proyek/baru` | Create project | `app.project.create` | REAL | SERVER_DERIVED | global → project | Server Action boundary; title stable "Proyek Demo Frontend" in tests |
| `/app/proyek/{id}` | Home | `project.home.view` | REAL | SERVER_DERIVED | project | Redirects not mocked; 404 on missing |
| `/app/proyek/{id}/chat` | Chat Narra | `project.chat.user-message` | PRESENTATION | SERVER_DERIVED | project | `ai-reply` DISABLED; reason visible without hover |
| `/app/proyek/{id}/outline` | Rencana Cerita | `project.outline.create` | PRESENTATION | SERVER_DERIVED | project | Presentational copy: "Pratinjau fitur" |
| `/app/proyek/{id}/karakter` | Karakter | `project.characters.read` | REAL | SERVER_DERIVED | project | READ capability real; creation DISABLED |
| `/app/proyek/{id}/fondasi` | Fondasi | `project.foundation.manage` | SERVER_DERIVED | SERVER_DERIVED | project | Requires foundation lock before proceeding |
| `/rahasia` | Jadwal Rahasia | `project.secrets.read` | PRESENTATION | SERVER_DERIVED | project | Preview |
| `/app/proyek/{id}/fakta` | Fakta | `project.facts.read` | PRESENTATION | SERVER_DERIVED | project | Preview |
| `/app/proyek/{id}/naskah` | Naskah | `project.manuscript.view` | PRESENTATION | SERVER_DERIVED | project | Disabled with `aria-disabled="true"`; zero links inside dialog |
| `/app/proyek/{id}/tulis` | **Deferred** | `chapter.write.compose` | PRESENTATION | SERVER_DERIVED | project | Route does NOT exist in PR1 |
| `/app/proyek/{id}/bab/{chId}/tulis` | **Deferred** | `chapter.write.compose` | PRESENTATION | SERVER_DERIVED | project | Route does NOT exist in PR1 |
| `/cek-cerita` | Cek Cerita | `chapter.check.run` | PRESENTATION | SERVER_DERIVED | project | Preview |
| `/app/proyek/{id}/selesaikan-bab` | Selesaikan Bab | `chapter.complete.run` | PRESENTATION | SERVER_DERIVED | project | Deferred route not in PR1 |
| `/app/proyek/{id}/naskah/view` | Naskah View | `chapter.manuscript.view` | PRESENTATION | SERVER_DERIVED | project | Deferred |
| `/app/proyek/{id}/paket-publish` | Paket Publish | `project.publish.view` / `chapter.publish.build` | PRESENTATION | SERVER_DERIVED | project | Preview |
| `/kredit` | Kredit & Penggunaan | `app.credit.view` | PRESENTATION | UNAVAILABLE | global | Feature disabled |
| `/app/pengaturan` | Pengaturan | `app.settings.view` | PRESENTATION | UNAVAILABLE | global | Feature disabled |

## Capability Declarations Summary (Selected Keys)

| Key | Label | Mode | Reason | Policy | Primary Action Enabled? |
|-----|-------|------|--------|--------|------------------------|
| `landing.view` | Mulai dari ide | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `auth.login` | Masuk | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `auth.register` | Buat akun | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `app.dashboard.view` | Buat proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `app.project.create` | Buat proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `app.credit.view` | Lihat penggunaan | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `app.settings.view` | Buka pengaturan | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.chat.user-message` | Kirim pesan | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.chat.ai-reply` | Minta balasan Narra | DISABLED | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.concept.choose` | Pilih konsep | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.foundation.manage` | Simpan fondasi | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.characters.read` | Lihat karakter | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.outline.create` | Buat rencana | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.secrets.read` | Lihat jadwal | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.facts.read` | Lihat fakta | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.write.resume` | Lanjut menulis | PRESENTATION | CHAPTER_CONTEXT_REQUIRED | UNAVAILABLE | false |
| `project.manuscript.view` | Lihat naskah | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `project.publish.view` | Lihat paket publish | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `chapter.write.compose` | Tulis bab | PRESENTATION | VALIDATION_REQUIRED | UNAVAILABLE | false |
| `chapter.check.run` | Cek cerita | PRESENTATION | VALIDATION_REQUIRED | UNAVAILABLE | false |
| `chapter.complete.run` | Selesaikan bab | PRESENTATION | VALIDATION_REQUIRED | UNAVAILABLE | false |
| `chapter.manuscript.view` | Baca naskah | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `chapter.publish.build` | Siapkan paket publish | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `shell.logout` | Keluar | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `shell.project-navigation` | Buka proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `shell.mobile-more` | Lainnya | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |

## Shell Behavior by Context

### Global Shell (`/app`)

- Header: AppHeader with `useClient`, logout via Server Action `<form action={logoutAction}>`, email + initial display
- No sidebar, no drawer, no "Menu proyek" button
- Content: dashboard (empty state or list of owned projects)
- Guarded by `getCurrentUser()` redirect to `/masuk` if absent

### Project Shell (project routes)

- Desktop: fixed left sidebar with groups and links
- Tablet: bottom nav + native `<dialog>` drawer with `aria-describedby` description + Escape/focus restoration
- Mobile: bottom nav + native `<dialog>` sheet (Lainnya) + Escape/focus restoration
- Title displays `project.title` from view-model
- All navigation items use `RouteAwareNavLink` with same-tab activation guard (no `preventDefault` call)

---

*Matrix reflects actual HEAD source; deferred authoring routes intentionally omitted.*

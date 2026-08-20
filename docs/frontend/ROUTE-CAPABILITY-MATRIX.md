# Narraza Frontend Foundation — Route/Capability Matrix (PR1)

**Branch:** `fix/pr1-post-merge-audit`  

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
| `/` | Landing and trust | `landing.view` | REAL | STATIC_AVAILABLE | none |
| `/masuk` | Login email+password | `auth.login` | REAL | STATIC_AVAILABLE | none |
| `/daftar` | Register email+password | `auth.register` | REAL | STATIC_AVAILABLE | none |
| `/privasi` | Privacy policy | `legal.privacy` | REAL | STATIC_AVAILABLE | none |
| `/ketentuan` | Terms of service | `legal.terms` | REAL | STATIC_AVAILABLE | none |

## Authenticated Routes (auth = required)

| Route | Purpose | Capability Key | Mode | Policy | Shell | Notes |
|-------|---------|----------------|------|--------|-------|-------|
| `/app` | Dashboard all projects | `app.dashboard.view` | REAL | SERVER_DERIVED | global | Shows empty or user projects; no project shell/sidebar |
| `/app/proyek/baru` | Create project | `app.project.create` | REAL | SERVER_DERIVED | global → project | Server Action boundary; title stable "Proyek Demo Frontend" in tests |
| `/app/kredit` | Credit summary | `app.credit.view` | PRESENTATION | UNAVAILABLE | global | Feature disabled |
| `/app/pengaturan` | Settings profile | `app.settings.view` | PRESENTATION | UNAVAILABLE | global | Feature disabled |
| `/app/proyek/{id}` | Project home | `project.home.view` | REAL | SERVER_DERIVED | project | Redirects not mocked; 404 on missing |
| `/app/proyek/{id}/chat` | Chat Narra | `project.chat.user-message` | REAL | SERVER_DERIVED | project | User message persist REAL; AI reply DISABLED until M4 |
| `/app/proyek/{id}/konsep` | Choose concept | `project.concept.choose` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/fondasi` | Foundation story | `project.foundation.manage` | REAL | SERVER_DERIVED | project | Draft, confirm, readiness, lock operations |
| `/app/proyek/{id}/karakter` | Characters | `project.characters.read` | REAL | SERVER_DERIVED | project | READ capability real; create/edit/delete DISABLED |
| `/app/proyek/{id}/outline` | Story plan | `project.outline.create` | REAL | SERVER_DERIVED | project | Create roadmap/arc/chapter REAL; edit/delete/reorder DISABLED |
| `/app/proyek/{id}/rahasia` | Secret schedule | `project.secrets.read` | REAL | SERVER_DERIVED | project | Read sequence timeline REAL; mutation DISABLED |
| `/app/proyek/{id}/fakta` | Locked facts | `project.facts.read` | REAL | SERVER_DERIVED | project | Read lifecycle REAL; mutation DISABLED |
| `/app/proyek/{id}/tulis` | Continue writing | `project.write.resume` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/naskah` | Project manuscript | `project.manuscript.view` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/publish` | Publish package | `project.publish.view` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/bab/{chId}/tulis` | Write chapter | `chapter.write.compose` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/bab/{chId}/cek` | Check story | `chapter.check.run` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/bab/{chId}/selesaikan` | Complete chapter | `chapter.complete.run` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/bab/{chId}/naskah` | Chapter manuscript | `chapter.manuscript.view` | PRESENTATION | UNAVAILABLE | project | Feature disabled |
| `/app/proyek/{id}/bab/{chId}/publish` | Chapter publish | `chapter.publish.build` | PRESENTATION | UNAVAILABLE | project | Feature disabled |

## Deferred Routes (Not in PR1 Scope)

These routes are intentionally not implemented yet but documented for future IA:

| Route | Purpose | Capability Key | Mode | Reason |
|-------|---------|----------------|------|--------|
| `/app/proyek/impor` | Import draft intent | `app.project.import` | DISABLED | IMPORT_OUT_OF_SCOPE |

---

## Capability Declarations Summary (Selected Keys)

| Key | Label | Mode | Reason | Policy | Primary Action Enabled? |
|-----|-------|------|--------|--------|------------------------|
| `landing.view` | Mulai dari ide | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `auth.login` | Masuk | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `auth.register` | Buat akun | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `legal.privacy` | Kebijakan Privasi | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `legal.terms` | Ketentuan Layanan | REAL | AVAILABLE | STATIC_AVAILABLE | true |
| `app.dashboard.view` | Dashboard proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `app.project.create` | Buat proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `app.credit.view` | Lihat penggunaan | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `app.settings.view` | Buka pengaturan | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.home.view` | Beranda proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.chat.user-message` | Kirim pesan | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.chat.ai-reply` | Minta balasan Narra | DISABLED | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.concept.choose` | Pilih konsep | PRESENTATION | BACKEND_NOT_AVAILABLE | UNAVAILABLE | false |
| `project.foundation.manage` | Simpan fondasi | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.characters.read` | Lihat karakter | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.outline.create` | Buat rencana | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.secrets.read` | Lihat jadwal rahasia | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.facts.read` | Lihat fakta yang dikunci | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `project.write.resume` | Lanjut menulis | PRESENTATION | CHAPTER_CONTEXT_REQUIRED | UNAVAILABLE | false |
| `project.manuscript.view` | Baca naskah proyek | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `project.publish.view` | Siapkan paket publikasi | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `chapter.write.compose` | Tulis bab | PRESENTATION | VALIDATION_REQUIRED | UNAVAILABLE | false |
| `chapter.check.run` | Cek cerita | PRESENTATION | VALIDATION_REQUIRED | UNAVAILABLE | false |
| `chapter.complete.run` | Selesaikan bab | PRESENTATION | VALIDATION_REQUIRED | UNAVAILABLE | false |
| `chapter.manuscript.view` | Baca naskah bab | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `chapter.publish.build` | Siapkan paket publikasi bab | PRESENTATION | ACCEPTED_PROSE_REQUIRED | UNAVAILABLE | false |
| `shell.logout` | Keluar | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `shell.project-navigation` | Navigasi proyek | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |
| `shell.mobile-more` | Menu lainnya | REAL | PREREQUISITE_MISSING | SERVER_DERIVED | server-derived |

---

## Shell Behavior by Context

### Global Shell (`/app`, `/app/kredit`, `/app/pengaturan`)

- Header: AppHeader with `useClient`, logout via Server Action `<form action={logoutAction}>`, email + initial display
- No sidebar, no drawer, no "Menu proyek" button
- Content: dashboard (empty state or list of owned projects)
- Guarded by `getCurrentUser()` redirect to `/masuk` if absent

### Project Shell (all `/app/proyek/{id}/**` routes)

- Desktop: fixed left sidebar with groups and links
- Tablet: bottom nav + native `<dialog>` drawer with `aria-describedby` description + Escape/focus restoration
- Mobile: bottom nav + native `<dialog>` sheet (Lainnya) + Escape/focus restoration
- Title displays `project.title` from view-model
- All navigation items use `RouteAwareNavLink` with same-tab activation guard (no `preventDefault` call)

---

*Matrix reconciled to canonical IA from design spec section 7.1-7.3 (2026-08-11-narraza-frontend-design-parity-design.md). Mode column corrected to use only REAL | PRESENTATION | DISABLED. Fondasi mode changed from SERVER_DERIVED to REAL per capability semantics.*

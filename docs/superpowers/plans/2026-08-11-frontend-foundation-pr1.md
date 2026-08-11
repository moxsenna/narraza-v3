# Narraza Frontend Foundation PR1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun foundation frontend PR1 yang typed, accessible, responsive, dan setara referensi untuk landing, auth, global shell, serta project shell tanpa mengubah capability backend atau perilaku M2.

**Architecture:** Tailwind v4 CSS-first di `globals.css` menjadi runtime source token. Server Component tetap default; client boundary hanya hook native `<dialog>`, kontrol mobile `Lainnya`, tablet project navigation drawer, dan leaf pathname navigation untuk `aria-current`. Root authenticated layout menjaga satu auth guard serta direct logout; nested project layout memakai existing owner-scoped `getMyProject(projectId)` untuk identity dan `notFound()`.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.7, TypeScript 5.9.3 strict, Tailwind CSS 4.3.3 CSS-first, `next/font/google`, native HTML `<dialog>`, Vitest 4.1.10, Playwright 1.61.1, ESLint 10.7.0, Prettier 3.9.6, dependency-cruiser 18.1.0, pnpm 11.9.0.

## Global Constraints

- Kerja hanya di `D:\Coding\Narraza Fix\Narraza v3\.worktrees\feat-frontend-foundation`. Primary checkout tidak disentuh. Satu-satunya command terhadap primary pada final gate adalah read-only `git status --short` dan `git hash-object` untuk membuktikan dirty baseline tetap identik.
- PR1 saja: tokens/fonts, primitive yang dipakai PR1, composite landing/auth/shell, capability metadata, exact orthogonal state types, small serializable ViewModel, landing/auth parity, distinct shells, responsive checks, evidence.
- Tidak menambah package atau component framework. `package.json`, `pnpm-lock.yaml`, dan `playwright.config.ts` tidak berubah.
- Gunakan variable font `Plus_Jakarta_Sans` (`400–800`) dan `Lora` (supported variable range `400–700`) melalui `next/font/google`; jangan gunakan static weight arrays. Bila focused build membuktikan network unavailable, hentikan task dan laporkan blocker; jangan membuat fallback architecture.
- `globals.css` runtime token source. TypeScript inventory hanya nama/kategori, tanpa values.
- Primitive PR1: `Button`, `IconButton`, `LinkButton`, `Input`, `Field`, `Badge`, `Chip`, `Card`, `Surface`, `Stack`, `Cluster`, `Container`, `VisuallyHidden`, `Divider`. `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Progress` ditunda karena tidak dikonsumsi landing/auth/shell PR1.
- `ConfirmationDialog` dan `BottomSheet` memakai native `<dialog>`. PR1 tidak memasang confirmation pada logout. `ConfirmationDialog` hanya source/API contract sampai high-risk flow nyata membutuhkannya. Browser behavior hook dibuktikan melalui reachable `MobileMoreSheet`.
- `apps/web/src/components/BrandMark.tsx` tetap compatibility re-export.
- Pertahankan direct `<form action={logoutAction}>` dan button `Keluar`. Tidak ada logout confirmation atau interaction drift.
- Pertahankan tepat satu `getCurrentUser()` di `apps/web/src/app/app/layout.tsx`, `redirect('/masuk')`, dan `logoutAction`.
- Project shell memakai nested `apps/web/src/app/app/proyek/[projectId]/layout.tsx`, existing `getMyProject(projectId)`, lalu `notFound()` jika null. Existing project page boleh mengulang read sampai PR3; jangan membuat resolver/cache abstraction PR1.
- Shell membungkus existing children. Jangan visually refactor dashboard, project baru, project home, chat, fondasi, outline, karakter, fakta, atau rahasia pada PR1.
- Pertahankan auth Server Actions, `useActionState`, redirects, pending guard, anti-enumeration, dan selectors: `Alamat email`, `Kata sandi`, `Ulangi kata sandi`, `Buat akun`, `Verifikasi & masuk`, `Masuk`, `Lupa kata sandi?`, `Kata sandi baru`, `Ulangi kata sandi baru`, `Simpan kata sandi baru`.
- Jangan ubah `apps/web/src/server/auth/**`, server/domain queries/actions, packages, Prisma, DB, schema, migrations, workers, jobs, ledger, atau AI.
- Pertahankan behavior M2 dan IDOR. Foreign/random project tetap branded not-found identik.
- PR1 tidak membuat `/app/proyek/[projectId]/tulis`; route milik PR3. PR1 tidak membuat `/app/proyek/[projectId]/bab/[chapterId]/tulis`; full composition milik PR4. Jangan membuat chapter route, import, credit, settings, preview, Panduan Uji Coba, atau beat route.
- Static registry hanya declaration metadata. Effective action state terpisah dan server-derived untuk capability tenant/prerequisite-sensitive; tidak adanya effective state harus fail closed. Metadata boleh mendeskripsikan canonical IA tanpa membuat route/href. PRESENTATION/DISABLED selalu `enabled: false`.
- Analytics di luar PR1–PR4.
- Existing Playwright projects tetap 375 dan 1280. Test PR1 memakai bounded `page.setViewportSize()` untuk 768 dan 1440.
- Evidence: `docs/frontend/VISUAL-REFERENCE-INVENTORY.md`, `docs/frontend/ROUTE-CAPABILITY-MATRIX.md`, `docs/review/frontend/pr1/**`. `docs/frontend/DESIGN-PARITY-REPORT.md` milik PR4.
- Root `pnpm lint`, `pnpm format:check`, dan `pnpm typecheck` dijalankan dari isolated worktree. Catat exit aktual. Approved baseline menyebut primary-checkout lint dapat gagal karena nested worktrees dan `ambiguous tsconfigRootDir`; jangan rerun primary checkout dan jangan mengklaim global baseline clean. Scoped PR1 ESLint wajib hijau.
- Jangan ubah exact CI names: `Lint & Typecheck`, `Unit Tests`, `Integration Tests`, `Architecture Boundaries`, `Migration (empty + drift)`, `Security Smoke`, `Contract Tests`, `E2E (Playwright)`.

---

## File Map Terkunci

- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx` — runtime tokens dan fonts.
- Create: `apps/web/src/components/foundation/token-inventory.ts`, `.test.ts`.
- Create: `apps/web/src/components/primitives/*.tsx`, `index.ts`, `primitives.contract.test.ts` — 14 primitive PR1.
- Create: `apps/web/src/components/composites/use-native-dialog.ts`, `ConfirmationDialog.tsx`, `BottomSheet.tsx`, `dialog.contract.test.ts`.
- Create: `apps/web/src/lib/frontend/capabilities.ts`, `capabilities.test.ts`, `view-state.ts`, `view-state.test.ts`, `view-model.ts`, `view-model.test.ts`.
- Create: `apps/web/src/app/frontend-foundation.contract.test.ts` pada Task 4; semua task berikut mengubah file yang sudah ada.
- Create: `apps/web/src/components/composites/BrandMark.tsx`, `PublicHeader.tsx`, `PublicMobileMenu.tsx`, `CapabilityNotice.tsx`, `AppHeader.tsx`, `GlobalAppShell.tsx`, `ProjectAppShell.tsx`, `ProjectSidebar.tsx`, `ProjectNavigationDrawer.tsx`, `MobileBottomNav.tsx`, `MobileMoreControl.tsx`, `MobileMoreSheet.tsx`, `RouteAwareNavLink.tsx`.
- Modify: `apps/web/src/components/BrandMark.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/messages/app-id.ts`, `apps/web/src/components/auth/AuthCard.tsx`, `apps/web/src/components/auth/fields.tsx`, `apps/web/src/components/auth/ResendVerificationForm.tsx`.
- Modify: `apps/web/src/app/app/layout.tsx`, `apps/web/src/app/app/page.tsx`, `apps/web/src/app/app/proyek/baru/page.tsx`, `apps/web/src/app/m0-w05.test.ts`.
- Create: `apps/web/src/app/app/proyek/[projectId]/layout.tsx`.
- Create: `tests/e2e/support/auth-session.ts`, `tests/e2e/frontend-foundation.spec.ts`.
- Create: `docs/frontend/VISUAL-REFERENCE-INVENTORY.md`, `docs/frontend/ROUTE-CAPABILITY-MATRIX.md`, `docs/review/frontend/pr1/**`.

### Task 1: Semantic Tokens dan Fonts

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/components/foundation/token-inventory.ts`
- Create: `apps/web/src/components/foundation/token-inventory.test.ts`

**Interfaces:**
- Consumes: `Plus_Jakarta_Sans`, `Lora` dari `next/font/google`.
- Produces: CSS utilities `bg-canvas`, `bg-surface`, `bg-surface-soft`, `bg-brand-soft`, `text-primary`, `text-secondary`, `text-muted`, `border-default`, `border-active`, `bg-action-primary`, `bg-action-primary-hover`, status utilities, font utilities, container utilities, motion/focus/disabled custom properties; `TOKEN_CATEGORIES` names-only.

- [ ] **Step 1: Tulis failing token test**

```ts
import { describe, expect, test } from 'vitest';
import { TOKEN_CATEGORIES } from './token-inventory';

describe('frontend token inventory', () => {
  test('locks implemented categories without runtime values', () => {
    expect(TOKEN_CATEGORIES.map((item) => item.category)).toEqual([
      'color-foundation', 'color-semantic', 'typography', 'spacing', 'container',
      'radius', 'elevation', 'motion', 'breakpoint', 'z-index', 'focus', 'disabled',
    ]);
    expect(JSON.stringify(TOKEN_CATEGORIES)).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|\d+px/i);
  });
});
```

- [ ] **Step 2: Run red**

Run: `pnpm --dir apps/web exec vitest run src/components/foundation/token-inventory.test.ts`

Expected: FAIL, module belum ada.

- [ ] **Step 3: Buat exact names-only inventory**

```ts
export type TokenCategory = Readonly<{ category: 'color-foundation'|'color-semantic'|'typography'|'spacing'|'container'|'radius'|'elevation'|'motion'|'breakpoint'|'z-index'|'focus'|'disabled'; names: readonly string[] }>;
export const TOKEN_CATEGORIES = [
  { category: 'color-foundation', names: ['brand-50','brand-100','brand-200','brand-300','brand-400','brand-500','brand-600','brand-700','brand-800','brand-900','ink-950','ink-800','ink-700','ink-500','ink-300','line-200','line-100','surface','canvas','surface-soft','success-700','success-50','warning-700','warning-50','danger-700','danger-50','info-700','info-50','amber-500','plum-600'] },
  { category: 'color-semantic', names: ['brand-soft','brand-strong','brand-ink','text-primary','text-secondary','text-muted','border-default','border-active','action-primary','action-primary-hover','action-primary-active','status-success','status-success-soft','status-warning','status-warning-soft','status-danger','status-danger-soft','status-info','status-info-soft'] },
  { category: 'typography', names: ['sans','serif'] },
  { category: 'spacing', names: ['space-1','space-2','space-3','space-4','space-5','space-6','space-8','space-10','space-12','space-16','space-20','space-24'] },
  { category: 'container', names: ['marketing','product','form','prose','panel'] },
  { category: 'radius', names: ['sm','md','lg','xl','pill'] },
  { category: 'elevation', names: ['sm','md','lg'] },
  { category: 'motion', names: ['micro','panel','modal','ease-in','ease-out'] },
  { category: 'breakpoint', names: ['sm','md','lg','xl','2xl'] },
  { category: 'z-index', names: ['header','overlay','dialog'] },
  { category: 'focus', names: ['ring-color','ring-width','ring-offset'] },
  { category: 'disabled', names: ['opacity'] },
] as const satisfies readonly TokenCategory[];
```

- [ ] **Step 4: Replace `globals.css` dengan exact CSS-first definitions**

Gunakan seluruh block berikut. Values palette/radius/shadow/breakpoint berasal dari `docs/design.md`; spacing memakai scale 4/8-based yang disetujui.

```css
@import 'tailwindcss';
@theme {
  --font-sans: var(--font-plus-jakarta-sans), ui-sans-serif, system-ui, sans-serif;
  --font-serif: var(--font-lora), Georgia, 'Times New Roman', serif;
  --color-brand-50:#fff5f8; --color-brand-100:#fce6ee; --color-brand-200:#f7c6d6; --color-brand-300:#ef91af; --color-brand-400:#e35f88; --color-brand-500:#d34875; --color-brand-600:#c13f6b; --color-brand-700:#a62f59; --color-brand-800:#842644; --color-brand-900:#641e35;
  --color-ink-950:#24171e; --color-ink-800:#3a2931; --color-ink-700:#4a3a42; --color-ink-500:#76656d; --color-ink-300:#a9979f;
  --color-line-200:#e8dce1; --color-line-100:#f1e8ec; --color-surface:#fff; --color-canvas:#fff9f6; --color-surface-soft:#f8f1f4;
  --color-success-700:#267455; --color-success-50:#edf8f3; --color-warning-700:#a55e18; --color-warning-50:#fff5e8; --color-danger-700:#b83a4b; --color-danger-50:#fff0f2; --color-info-700:#3d6fb4; --color-info-50:#eff5fd; --color-amber-500:#d98b3f; --color-plum-600:#6f4b68;
  --color-brand-soft:var(--color-brand-50); --color-brand-strong:var(--color-brand-800); --color-brand-ink:var(--color-brand-900); --color-text-primary:var(--color-ink-950); --color-text-secondary:var(--color-ink-700); --color-text-muted:var(--color-ink-500); --color-border-default:var(--color-line-200); --color-border-active:var(--color-brand-300); --color-action-primary:var(--color-brand-600); --color-action-primary-hover:var(--color-brand-700); --color-action-primary-active:var(--color-brand-800);
  --color-status-success:var(--color-success-700); --color-status-success-soft:var(--color-success-50); --color-status-warning:var(--color-warning-700); --color-status-warning-soft:var(--color-warning-50); --color-status-danger:var(--color-danger-700); --color-status-danger-soft:var(--color-danger-50); --color-status-info:var(--color-info-700); --color-status-info-soft:var(--color-info-50);
  --spacing-1:4px; --spacing-2:8px; --spacing-3:12px; --spacing-4:16px; --spacing-5:20px; --spacing-6:24px; --spacing-8:32px; --spacing-10:40px; --spacing-12:48px; --spacing-16:64px; --spacing-20:80px; --spacing-24:96px;
  --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:24px; --radius-pill:999px;
  --shadow-sm:0 1px 2px rgba(36,23,30,.06); --shadow-md:0 8px 24px rgba(36,23,30,.08); --shadow-lg:0 18px 48px rgba(36,23,30,.12);
  --breakpoint-sm:40rem; --breakpoint-md:48rem; --breakpoint-lg:64rem; --breakpoint-xl:80rem; --breakpoint-2xl:90rem;
}
:root { --container-marketing:1280px; --container-product:1200px; --container-form:720px; --container-prose:760px; --container-panel:360px; --motion-micro:140ms; --motion-panel:200ms; --motion-modal:250ms; --ease-enter:ease-out; --ease-exit:ease-in; --z-header:40; --z-overlay:50; --z-dialog:60; --focus-ring-color:var(--color-brand-700); --focus-ring-width:3px; --focus-ring-offset:2px; --disabled-opacity:.6; }
html { min-height:100%; scroll-behavior:smooth; }
body { min-height:100%; overflow-x:hidden; background:var(--color-canvas); color:var(--color-text-primary); }
:focus-visible { outline:var(--focus-ring-width) solid var(--focus-ring-color); outline-offset:var(--focus-ring-offset); }
:disabled,[aria-disabled='true'] { opacity:var(--disabled-opacity); }
button,a { -webkit-tap-highlight-color:transparent; }
dialog::backdrop { background:rgba(36,23,30,.48); }
@media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } *,*::before,*::after { scroll-behavior:auto!important; transition-duration:.01ms!important; animation-duration:.01ms!important; animation-iteration-count:1!important; } }
```

Tailwind v4 utility names dari theme variables: `bg-canvas`, `bg-surface`, `bg-brand-soft`, `text-brand-strong`, `text-brand-ink`, `text-primary`, `text-secondary`, `text-muted`, `border-default`, `border-active`, `bg-action-primary`, `hover:bg-action-primary-hover`, `text-status-danger`, `bg-status-danger-soft`. Replace every planned `text-brand-strong`, `text-brand-strong`, `text-brand-ink`, dan `bg-brand-ink` usage in PR1 snippets with `text-brand-strong`, `text-brand-ink`, dan `bg-brand-ink` respectively; foundation palette utilities stay confined to token definition.

- [ ] **Step 5: Muat fonts pada root layout**

```tsx
import { Lora, Plus_Jakarta_Sans } from 'next/font/google';
const plusJakartaSans = Plus_Jakarta_Sans({ subsets:['latin'], variable:'--font-plus-jakarta-sans', weight:'variable', display:'swap' });
const lora = Lora({ subsets:['latin'], variable:'--font-lora', weight:'variable', display:'swap' });
// `weight:'variable'` memuat axis Plus Jakarta Sans 400–800 dan Lora 400–700; jangan ganti dengan array static. Ganti body existing menjadi:
<body className={`${plusJakartaSans.variable} ${lora.variable} font-sans antialiased`}>{children}</body>
```

- [ ] **Step 6: Green gate dan commit**

Run: `pnpm --dir apps/web exec vitest run src/components/foundation/token-inventory.test.ts && pnpm --filter @narraza/web typecheck && pnpm --filter @narraza/web build`

Expected: PASS/exit 0.

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/components/foundation/token-inventory.ts apps/web/src/components/foundation/token-inventory.test.ts
git commit -m "feat(web): establish semantic frontend foundations"
```

### Task 2: PR1 Primitive Layer

**Files:** Create `apps/web/src/components/primitives/{Button,IconButton,LinkButton,Input,Field,Badge,Chip,Card,Surface,Stack,Cluster,Container,VisuallyHidden,Divider}.tsx`, `index.ts`, `primitives.contract.test.ts`.

**Interfaces:** Consumes semantic utilities Task 1. Produces server-safe primitive functions below.

- [ ] **Step 1: Tulis red source contract**

```ts
import { readFileSync } from 'node:fs'; import { resolve } from 'node:path'; import { describe,expect,test } from 'vitest';
const read=(name:string)=>readFileSync(resolve(import.meta.dirname,name),'utf8');
test('primitives stay server-safe and semantic',()=>{ for(const file of ['Button.tsx','IconButton.tsx','LinkButton.tsx','Input.tsx','Field.tsx','Badge.tsx','Chip.tsx','Card.tsx','Surface.tsx','Stack.tsx','Cluster.tsx','Container.tsx','VisuallyHidden.tsx','Divider.tsx']) { const text=read(file); expect(text).not.toContain("'use client'"); expect(text).not.toMatch(/@narraza\/(application|core|db)|server\//); expect(text).not.toMatch(/#[0-9a-f]{3,8}|\b(?:pink|gray|neutral|red)-\d+/i); } });
test('Badge is status and Chip is action',()=>{ expect(read('Badge.tsx')).not.toContain('<button'); expect(read('Chip.tsx')).toContain('<button'); expect(read('IconButton.tsx')).toContain("'aria-label': string"); });
```

Run: `pnpm --dir apps/web exec vitest run src/components/primitives/primitives.contract.test.ts`

Expected: FAIL, files belum ada.

- [ ] **Step 2: Buat action primitive files dengan exact code**

```tsx
// Button.tsx
import type { ButtonHTMLAttributes } from 'react';
export type ButtonVariant='primary'|'secondary'|'tertiary'|'destructive';
const styles:Record<ButtonVariant,string>={primary:'bg-action-primary text-white hover:bg-action-primary-hover active:bg-action-primary-active',secondary:'border border-default bg-surface text-primary hover:border-active hover:bg-brand-soft',tertiary:'bg-transparent text-brand-strong hover:bg-brand-soft',destructive:'bg-status-danger text-white hover:opacity-90'};
export type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:ButtonVariant};
export function Button({variant='primary',className='',type='button',...props}:ButtonProps){return <button type={type} className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-bold disabled:cursor-not-allowed ${styles[variant]} ${className}`} {...props}/>;}

// IconButton.tsx
import type { ButtonHTMLAttributes } from 'react';
export type IconButtonProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'aria-label'>&{'aria-label':string};
export function IconButton({className='',type='button',...props}:IconButtonProps){return <button type={type} className={`inline-flex size-11 items-center justify-center rounded-md border border-default bg-surface text-primary disabled:cursor-not-allowed ${className}`} {...props}/>;}

// LinkButton.tsx
import Link from 'next/link'; import type { ComponentProps } from 'react'; import type { ButtonVariant } from './Button';
const styles:Record<Exclude<ButtonVariant,'destructive'>,string>={primary:'bg-action-primary text-white hover:bg-action-primary-hover',secondary:'border border-default bg-surface text-primary hover:border-active hover:bg-brand-soft',tertiary:'text-brand-strong hover:bg-brand-soft'};
export type LinkButtonProps=ComponentProps<typeof Link>&{variant?:Exclude<ButtonVariant,'destructive'>};
export function LinkButton({variant='primary',className='',...props}:LinkButtonProps){return <Link className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-bold ${styles[variant]} ${className}`} {...props}/>;}
```

- [ ] **Step 3: Buat form/status primitive files dengan exact code**

```tsx
// Input.tsx
import { forwardRef,type InputHTMLAttributes } from 'react';
export const Input=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>>(function Input({className='',...props},ref){return <input ref={ref} className={`min-h-11 w-full rounded-md border border-default bg-surface px-3 text-base text-primary placeholder:text-muted focus:border-active aria-invalid:border-status-danger ${className}`} {...props}/>;});

// Field.tsx
import type { ReactNode } from 'react';
export function Field({id,label,help,error,children}:{id:string;label:string;help?:string;error?:string;children:(metadata:{describedBy:string|undefined;invalid:boolean})=>ReactNode}){const helpId=help?`${id}-help`:undefined;const errorId=error?`${id}-error`:undefined;const describedBy=[helpId,errorId].filter(Boolean).join(' ')||undefined;return <div className="flex flex-col gap-2"><label htmlFor={id} className="text-sm font-semibold text-primary">{label}</label>{children({describedBy,invalid:Boolean(error)})}{help?<p id={helpId} className="text-sm text-muted">{help}</p>:null}{error?<p id={errorId} role="alert" className="text-sm text-status-danger">{error}</p>:null}</div>;}

// Badge.tsx
import type { ReactNode } from 'react';
const tones={neutral:'bg-surface-soft text-secondary',brand:'bg-brand-soft text-brand-strong',success:'bg-status-success-soft text-status-success',warning:'bg-status-warning-soft text-status-warning',danger:'bg-status-danger-soft text-status-danger',info:'bg-status-info-soft text-status-info'} as const;
export function Badge({tone='neutral',children}:{tone?:keyof typeof tones;children:ReactNode}){return <span className={`inline-flex rounded-pill px-3 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;}

// Chip.tsx
import type { ButtonHTMLAttributes } from 'react';
export function Chip({selected,className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{selected:boolean}){return <button type={type} aria-pressed={selected} className={`min-h-11 rounded-pill border px-4 text-sm font-semibold ${selected?'border-active bg-brand-soft text-brand-strong':'border-default bg-surface text-secondary'} ${className}`} {...props}/>;}
```

Auth concrete usage:

```tsx
<Field id={id} label={props.label}>{({describedBy,invalid})=><Input id={id} name={props.name} type={props.type??'text'} autoComplete={props.autoComplete} required={props.required} defaultValue={props.defaultValue} aria-describedby={describedBy} aria-invalid={invalid||undefined}/>}</Field>
```

- [ ] **Step 4: Buat layout primitive files dengan exact code**

```tsx
// Card.tsx
import type { HTMLAttributes } from 'react'; export function Card({className='',...props}:HTMLAttributes<HTMLElement>){return <article className={`rounded-lg border border-default bg-surface p-6 ${className}`} {...props}/>;}
// Surface.tsx
import type { HTMLAttributes } from 'react'; export function Surface({className='',...props}:HTMLAttributes<HTMLDivElement>){return <div className={`bg-surface ${className}`} {...props}/>;}
// Stack.tsx
import type { HTMLAttributes } from 'react'; const gaps={2:'gap-2',3:'gap-3',4:'gap-4',6:'gap-6',8:'gap-8',10:'gap-10',12:'gap-12'} as const; export function Stack({gap=4,className='',...props}:HTMLAttributes<HTMLDivElement>&{gap?:keyof typeof gaps}){return <div className={`flex flex-col ${gaps[gap]} ${className}`} {...props}/>;}
// Cluster.tsx
import type { HTMLAttributes } from 'react'; const gaps={2:'gap-2',3:'gap-3',4:'gap-4',6:'gap-6'} as const; export function Cluster({gap=3,className='',...props}:HTMLAttributes<HTMLDivElement>&{gap?:keyof typeof gaps}){return <div className={`flex flex-wrap items-center ${gaps[gap]} ${className}`} {...props}/>;}
// Container.tsx
import type { HTMLAttributes } from 'react'; const sizes={marketing:'max-w-[var(--container-marketing)]',product:'max-w-[var(--container-product)]',form:'max-w-[var(--container-form)]',prose:'max-w-[var(--container-prose)]'} as const; export function Container({size='product',className='',...props}:HTMLAttributes<HTMLDivElement>&{size?:keyof typeof sizes}){return <div className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${sizes[size]} ${className}`} {...props}/>;}
// VisuallyHidden.tsx
import type { ReactNode } from 'react'; export function VisuallyHidden({as='span',children}:{as?:'span'|'p';children:ReactNode}){const Tag=as;return <Tag className="sr-only">{children}</Tag>;}
// Divider.tsx
import type { HTMLAttributes } from 'react'; export function Divider({className='',...props}:HTMLAttributes<HTMLHRElement>){return <hr aria-hidden="true" className={`border-0 border-t border-default ${className}`} {...props}/>;}
```

`index.ts` export semua 14 symbols/types. Jangan membuat deferred primitive files.

- [ ] **Step 5: Green gate dan commit**

Run: `pnpm --dir apps/web exec vitest run src/components/primitives/primitives.contract.test.ts && pnpm --filter @narraza/web typecheck && pnpm exec eslint apps/web/src/components/primitives --no-error-on-unmatched-pattern`

Expected: PASS/exit 0.

```bash
git add apps/web/src/components/primitives
git commit -m "feat(web): add accessible PR1 primitives"
```

### Task 3: Native Dialog Composites

**Files:** Create `apps/web/src/components/composites/use-native-dialog.ts`, `ConfirmationDialog.tsx`, `BottomSheet.tsx`, `dialog.contract.test.ts`.

**Interfaces:** Produces controlled `useNativeDialog`, `ConfirmationDialog`, `BottomSheet`. Confirmation tidak dihubungkan ke logout.

- [ ] **Step 1: Tulis red source contracts**

```ts
import {readFileSync} from 'node:fs';import{resolve}from'node:path';import{expect,test}from'vitest';const read=(n:string)=>readFileSync(resolve(import.meta.dirname,n),'utf8');
test('native hook controls close without close-event recursion',()=>{const hook=read('use-native-dialog.ts');expect(hook).toContain('openRef.current');expect(hook).toContain('previouslyFocused.current?.focus()');expect(hook).toContain("event.preventDefault()");expect(hook).toContain('.showModal()');expect(hook).toContain('.close()');});
test('dialog composites have names and close controls',()=>{for(const file of ['ConfirmationDialog.tsx','BottomSheet.tsx']){const text=read(file);expect(text).toContain('<dialog');expect(text).toContain('aria-labelledby');expect(text).toContain('aria-describedby');expect(text).toContain('aria-label="Tutup"');}});
```

Run: `pnpm --dir apps/web exec vitest run src/components/composites/dialog.contract.test.ts`

Expected: FAIL.

- [ ] **Step 2: Buat recursion-safe native hook dengan exact code**

```ts
'use client';
import {useEffect,useRef,type RefObject} from 'react';
export function useNativeDialog({open,onOpenChange,initialFocusRef}:{open:boolean;onOpenChange(open:boolean):void;initialFocusRef?:RefObject<HTMLElement|null>}):RefObject<HTMLDialogElement|null>{
  const dialogRef=useRef<HTMLDialogElement>(null);const openRef=useRef(open);const previouslyFocused=useRef<HTMLElement|null>(null);openRef.current=open;
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open){previouslyFocused.current=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.showModal();queueMicrotask(()=>{(initialFocusRef?.current??dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')??dialog).focus();});}else if(!open&&dialog.open){dialog.close();}},[open,initialFocusRef]);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;const onCancel=(event:Event)=>{event.preventDefault();if(openRef.current)onOpenChange(false);};const onClose=()=>{if(openRef.current)onOpenChange(false);previouslyFocused.current?.focus();previouslyFocused.current=null;};dialog.addEventListener('cancel',onCancel);dialog.addEventListener('close',onClose);return()=>{dialog.removeEventListener('cancel',onCancel);dialog.removeEventListener('close',onClose);};},[onOpenChange]);
  return dialogRef;
}
```

Programmatic close terjadi setelah `openRef.current` sudah false, sehingga `close` event tidak memanggil setter kedua kali. Semua close paths mengembalikan focus melalui native `close` event.

- [ ] **Step 3: Buat complete composites**

```tsx
// ConfirmationDialog.tsx
'use client';
import {useId,useRef}from'react';import{Button,IconButton}from'../primitives';import{useNativeDialog}from'./use-native-dialog';
export function ConfirmationDialog({open,onOpenChange,title,description,confirmLabel,cancelLabel='Batal',destructive=false,onConfirm}:{open:boolean;onOpenChange(open:boolean):void;title:string;description:string;confirmLabel:string;cancelLabel?:string;destructive?:boolean;onConfirm():void}){const titleId=useId(),descriptionId=useId(),cancelRef=useRef<HTMLButtonElement>(null);const ref=useNativeDialog({open,onOpenChange,initialFocusRef:cancelRef});return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className="m-auto w-[min(560px,calc(100%-32px))] rounded-xl bg-surface p-0 text-primary shadow-lg"><div className="p-6"><div className="flex justify-between gap-4"><h2 id={titleId} className="text-xl font-bold">{title}</h2><IconButton aria-label="Tutup" onClick={()=>onOpenChange(false)}>×</IconButton></div><p id={descriptionId} className="mt-3 text-secondary">{description}</p><div className="mt-6 flex justify-end gap-3"><Button ref={cancelRef} variant="secondary" onClick={()=>onOpenChange(false)}>{cancelLabel}</Button><Button variant={destructive?'destructive':'primary'} onClick={()=>{onConfirm();onOpenChange(false);}}>{confirmLabel}</Button></div></div></dialog>;}

// BottomSheet.tsx
'use client';
import{useId}from'react';import{IconButton}from'../primitives';import{useNativeDialog}from'./use-native-dialog';
export function BottomSheet({open,onOpenChange,title,description,children}:{open:boolean;onOpenChange(open:boolean):void;title:string;description:string;children:React.ReactNode}){const titleId=useId(),descriptionId=useId();const ref=useNativeDialog({open,onOpenChange});return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className="mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-xl bg-surface p-0 text-primary shadow-lg md:m-auto md:w-[min(560px,calc(100%-32px))] md:rounded-xl"><div className="flex max-h-[85dvh] flex-col pb-[env(safe-area-inset-bottom)]"><header className="flex shrink-0 items-start justify-between gap-4 border-b border-default p-4"><div><h2 id={titleId} className="text-lg font-bold">{title}</h2><p id={descriptionId} className="mt-1 text-sm text-secondary">{description}</p></div><IconButton aria-label="Tutup" data-dialog-initial-focus onClick={()=>onOpenChange(false)}>×</IconButton></header><div className="overflow-y-auto p-4">{children}</div></div></dialog>;}
```

TypeScript issue: `Button` must support refs. Mechanically change `Button.tsx` to `forwardRef<HTMLButtonElement,ButtonProps>` and set function name `Button`; update primitive test/typecheck in same task.

- [ ] **Step 4: Green gate dan commit**

Run: `pnpm --dir apps/web exec vitest run src/components/composites/dialog.contract.test.ts src/components/primitives/primitives.contract.test.ts && pnpm --filter @narraza/web typecheck`

Expected: PASS.

```bash
git add apps/web/src/components/primitives/Button.tsx apps/web/src/components/composites/use-native-dialog.ts apps/web/src/components/composites/ConfirmationDialog.tsx apps/web/src/components/composites/BottomSheet.tsx apps/web/src/components/composites/dialog.contract.test.ts
git commit -m "feat(web): add native dialog and sheet behavior"
```

### Task 4: Capability, State, ViewModel, dan Shared Contract Test

**Files:** Create `apps/web/src/lib/frontend/{capabilities,capabilities.test,view-state,view-state.test,view-model,view-model.test}.ts`, `apps/web/src/components/composites/CapabilityNotice.tsx`, `apps/web/src/app/frontend-foundation.contract.test.ts`.

**Interfaces:** Produces exact types/registry below dan source helper `source(relativePath)`.

- [ ] **Step 1: Tulis red capability tests**

```ts
import { expect, test } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  CAPABILITY_REASON_MESSAGES,
  deriveEffectiveCapability,
} from './capabilities';

test('locks complete typed canonical action keys and reason catalog', () => {
  expect(Object.keys(CAPABILITIES)).toEqual(CAPABILITY_KEYS);
  expect(CAPABILITY_KEYS).toHaveLength(32);
  expect(Object.keys(CAPABILITY_REASON_MESSAGES)).toHaveLength(16);
});

test('keeps protected declarations separate from server-derived effective state', () => {
  const declaration = CAPABILITIES['project.foundation.manage'];
  expect(declaration.actionPolicy).toBe('SERVER_DERIVED');
  expect(declaration.primaryAction).not.toHaveProperty('enabled');
  expect(
    deriveEffectiveCapability(declaration, {
      allowed: false,
      reasonCode: 'FOUNDATION_NOT_LOCKED',
    }).primaryAction.enabled,
  ).toBe(false);
  expect(() =>
    deriveEffectiveCapability(CAPABILITIES['project.chat.ai-reply'], {
      allowed: true,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Only REAL capability can derive an enabled primary action');
  expect(() =>
    deriveEffectiveCapability(declaration, {
      allowed: false,
      reasonCode: 'AVAILABLE',
    }),
  ).toThrow('Disabled primary action requires an unavailable reason');
});
```

Run: `pnpm --dir apps/web exec vitest run src/lib/frontend/capabilities.test.ts`

Expected: FAIL.

- [ ] **Step 2: Buat exact declaration types, effective-state boundary, reason copy, dan complete keyed registry**

```ts
export const CAPABILITY_KEYS = [
  'landing.view', 'auth.login', 'auth.register', 'auth.password-reset', 'auth.verification', 'legal.privacy', 'legal.terms', 'app.dashboard.view',
  'app.project.create', 'app.project.import', 'app.credit.view', 'app.settings.view', 'project.home.view', 'project.chat.user-message', 'project.chat.ai-reply',
  'project.concept.choose', 'project.foundation.manage', 'project.characters.read', 'project.outline.create', 'project.secrets.read', 'project.facts.read',
  'project.write.resume', 'project.manuscript.view', 'project.publish.view', 'chapter.write.compose', 'chapter.check.run', 'chapter.complete.run',
  'chapter.manuscript.view', 'chapter.publish.build', 'shell.logout', 'shell.project-navigation', 'shell.mobile-more',
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type CapabilityMode = 'REAL' | 'PRESENTATION' | 'DISABLED';
export type CapabilityReasonCode = 'AVAILABLE' | 'BACKEND_NOT_AVAILABLE' | 'PREREQUISITE_MISSING' | 'IMPORT_OUT_OF_SCOPE' | 'PROJECT_CONTEXT_REQUIRED' | 'CHAPTER_CONTEXT_REQUIRED' | 'PROJECT_NOT_FOUND' | 'CHAPTER_NOT_FOUND' | 'CHAPTER_NOT_IN_PROJECT' | 'NOT_AUTHENTICATED' | 'NOT_AUTHORIZED' | 'FOUNDATION_NOT_LOCKED' | 'ACCEPTED_PROSE_REQUIRED' | 'VALIDATION_REQUIRED' | 'JOB_ACTIVE' | 'PREVIEW_DISABLED';
export type CapabilityDeclaration = Readonly<{ key: CapabilityKey; mode: CapabilityMode; reasonCode: CapabilityReasonCode; actionPolicy: 'STATIC_AVAILABLE' | 'SERVER_DERIVED' | 'UNAVAILABLE'; primaryAction: Readonly<{ label: string }> }>;
export type ServerCapabilityDecision = Readonly<{ allowed: boolean; reasonCode: CapabilityReasonCode }>;
export type EffectiveCapability = Readonly<{ key: CapabilityKey; mode: CapabilityMode; reasonCode: CapabilityReasonCode; primaryAction: Readonly<{ label: string; enabled: boolean }> }>;
export const CAPABILITY_REASON_MESSAGES: Record<CapabilityReasonCode, string> = { AVAILABLE:'Tersedia.', BACKEND_NOT_AVAILABLE:'Kemampuan ini belum tersedia.', PREREQUISITE_MISSING:'Selesaikan langkah sebelumnya dahulu.', IMPORT_OUT_OF_SCOPE:'Impor draft belum tersedia pada rilis ini.', PROJECT_CONTEXT_REQUIRED:'Pilih proyek untuk melanjutkan.', CHAPTER_CONTEXT_REQUIRED:'Pilih bab yang valid untuk melanjutkan.', PROJECT_NOT_FOUND:'Proyek tidak ditemukan.', CHAPTER_NOT_FOUND:'Bab tidak ditemukan.', CHAPTER_NOT_IN_PROJECT:'Bab tidak ditemukan pada proyek ini.', NOT_AUTHENTICATED:'Masuk untuk melanjutkan.', NOT_AUTHORIZED:'Halaman tidak ditemukan.', FOUNDATION_NOT_LOCKED:'Kunci fondasi sebelum melanjutkan.', ACCEPTED_PROSE_REQUIRED:'Terima versi tulisan sebelum melanjutkan.', VALIDATION_REQUIRED:'Jalankan cek cerita sebelum melanjutkan.', JOB_ACTIVE:'Proses sebelumnya masih berjalan.', PREVIEW_DISABLED:'Preview tidak tersedia.' };
const declare = (key: CapabilityKey, label: string, mode: CapabilityMode, reasonCode: CapabilityReasonCode, actionPolicy: CapabilityDeclaration['actionPolicy']): CapabilityDeclaration => Object.freeze({ key, mode, reasonCode, actionPolicy, primaryAction: Object.freeze({ label }) });
const staticAvailable = (key: CapabilityKey, label: string) => declare(key, label, 'REAL', 'AVAILABLE', 'STATIC_AVAILABLE');
const serverDerived = (key: CapabilityKey, label: string) => declare(key, label, 'REAL', 'PREREQUISITE_MISSING', 'SERVER_DERIVED');
const presentation = (key: CapabilityKey, label: string, reasonCode: CapabilityReasonCode = 'BACKEND_NOT_AVAILABLE') => declare(key, label, 'PRESENTATION', reasonCode, 'UNAVAILABLE');
const disabled = (key: CapabilityKey, label: string, reasonCode: CapabilityReasonCode) => declare(key, label, 'DISABLED', reasonCode, 'UNAVAILABLE');
export function deriveEffectiveCapability(declaration: CapabilityDeclaration, decision: ServerCapabilityDecision): EffectiveCapability { const enabled = decision.allowed; if (enabled && declaration.mode !== 'REAL') throw new Error('Only REAL capability can derive an enabled primary action'); if (enabled && decision.reasonCode !== 'AVAILABLE') throw new Error('Enabled primary action requires AVAILABLE reason'); if (!enabled && decision.reasonCode === 'AVAILABLE') throw new Error('Disabled primary action requires an unavailable reason'); return Object.freeze({ key: declaration.key, mode: declaration.mode, reasonCode: decision.reasonCode, primaryAction: Object.freeze({ label: declaration.primaryAction.label, enabled }) }); }
export const CAPABILITIES = {
  'landing.view':staticAvailable('landing.view','Mulai dari ide'), 'auth.login':staticAvailable('auth.login','Masuk'), 'auth.register':staticAvailable('auth.register','Buat akun'), 'auth.password-reset':staticAvailable('auth.password-reset','Simpan kata sandi baru'), 'auth.verification':staticAvailable('auth.verification','Verifikasi & masuk'), 'legal.privacy':staticAvailable('legal.privacy','Baca Kebijakan Privasi'), 'legal.terms':staticAvailable('legal.terms','Baca Ketentuan Layanan'),
  'app.dashboard.view':serverDerived('app.dashboard.view','Buat proyek'), 'app.project.create':serverDerived('app.project.create','Buat proyek'), 'app.project.import':disabled('app.project.import','Impor draft','IMPORT_OUT_OF_SCOPE'), 'app.credit.view':presentation('app.credit.view','Lihat penggunaan'), 'app.settings.view':presentation('app.settings.view','Buka pengaturan'),
  'project.home.view':serverDerived('project.home.view','Lihat proyek'), 'project.chat.user-message':serverDerived('project.chat.user-message','Kirim pesan'), 'project.chat.ai-reply':disabled('project.chat.ai-reply','Minta balasan Narra','BACKEND_NOT_AVAILABLE'), 'project.concept.choose':presentation('project.concept.choose','Pilih konsep'), 'project.foundation.manage':serverDerived('project.foundation.manage','Simpan fondasi'), 'project.characters.read':serverDerived('project.characters.read','Lihat karakter'), 'project.outline.create':serverDerived('project.outline.create','Buat rencana'), 'project.secrets.read':serverDerived('project.secrets.read','Lihat jadwal'), 'project.facts.read':serverDerived('project.facts.read','Lihat fakta'), 'project.write.resume':presentation('project.write.resume','Lanjut menulis','CHAPTER_CONTEXT_REQUIRED'), 'project.manuscript.view':presentation('project.manuscript.view','Lihat naskah'), 'project.publish.view':presentation('project.publish.view','Lihat paket publish'),
  'chapter.write.compose':presentation('chapter.write.compose','Tulis bab'), 'chapter.check.run':presentation('chapter.check.run','Cek cerita','VALIDATION_REQUIRED'), 'chapter.complete.run':presentation('chapter.complete.run','Selesaikan bab','VALIDATION_REQUIRED'), 'chapter.manuscript.view':presentation('chapter.manuscript.view','Baca naskah','ACCEPTED_PROSE_REQUIRED'), 'chapter.publish.build':presentation('chapter.publish.build','Siapkan paket publish','ACCEPTED_PROSE_REQUIRED'), 'shell.logout':serverDerived('shell.logout','Keluar'), 'shell.project-navigation':serverDerived('shell.project-navigation','Buka proyek'), 'shell.mobile-more':serverDerived('shell.mobile-more','Lainnya'),
} as const satisfies Record<CapabilityKey, CapabilityDeclaration>;
```

`CAPABILITIES` adalah declaration registry, bukan effective permission registry. `STATIC_AVAILABLE` terbatas pada public/static entry yang tidak tenant-sensitive. Semua authenticated, tenant, ownership, mutation, dan prerequisite-sensitive declarations memakai `SERVER_DERIVED`; declaration tidak memiliki `enabled`. `deriveEffectiveCapability` hanya menerima keputusan eksplisit dari existing server read/action boundary saat consumer nyata membutuhkannya. PR1 tidak menambah mapper backend/domain, tidak memanggil resolver ini untuk mengarang permission, dan tidak membuat fallback decision. PRESENTATION/DISABLED tetap `UNAVAILABLE` dan tidak boleh mendapat decision `allowed: true`.

Registry metadata-only untuk deferred routes; tidak ada href atau route creation.

- [ ] **Step 3: Buat exact orthogonal state module dan test**

```ts
// view-state.ts
import type{CapabilityMode}from'./capabilities';
export const STATE_AXIS_VALUES={capability:['REAL','PRESENTATION','DISABLED'],view:['loading','ready','empty','error','stale'],mutation:['idle','saving','saved','blocked','error'],quote:['unavailable','quoted','expired'],job:['none','queued','running','succeeded','failed','dead','cancelled'],artifact:['none','candidate','accepted'],draft:['clean','saving','saved','conflict','stale'],validation:['not-run','running','ready','stale'],presentation:['editor','comparison','preview']}as const;
export type ViewState=typeof STATE_AXIS_VALUES.view[number];export type MutationState=typeof STATE_AXIS_VALUES.mutation[number];export type QuoteState=typeof STATE_AXIS_VALUES.quote[number];export type JobState=typeof STATE_AXIS_VALUES.job[number];export type ArtifactState=typeof STATE_AXIS_VALUES.artifact[number];export type DraftState=typeof STATE_AXIS_VALUES.draft[number];export type ValidationState=typeof STATE_AXIS_VALUES.validation[number];export type PresentationState=typeof STATE_AXIS_VALUES.presentation[number];
export type Recoverability=Readonly<{recoverable:boolean;retryKind?:'same-read'|'new-job'|'request-new-quote'|'manual-resolution'}>;
export type OrthogonalViewState=Readonly<{capability:CapabilityMode;view:ViewState;mutation:MutationState;quote:QuoteState;job:JobState;artifact:ArtifactState;draft:DraftState;validation:ValidationState;presentation:PresentationState}>;

// view-state.test.ts
import{expect,test}from'vitest';import{STATE_AXIS_VALUES}from'./view-state';test('locks exact independent axes',()=>{expect(STATE_AXIS_VALUES).toEqual({capability:['REAL','PRESENTATION','DISABLED'],view:['loading','ready','empty','error','stale'],mutation:['idle','saving','saved','blocked','error'],quote:['unavailable','quoted','expired'],job:['none','queued','running','succeeded','failed','dead','cancelled'],artifact:['none','candidate','accepted'],draft:['clean','saving','saved','conflict','stale'],validation:['not-run','running','ready','stale'],presentation:['editor','comparison','preview']});});
```

- [ ] **Step 4: Buat compile-time-only ViewModels dan concrete tests**

```ts
// view-model.ts
import type{CapabilityKey,CapabilityReasonCode}from'./capabilities';
export type ShellAccountViewModel=Readonly<{email:string;initial:string}>;export type ProjectIdentityViewModel=Readonly<{projectId:string;title:string}>;export type CapabilityNoticeViewModel=Readonly<{capabilityKey:CapabilityKey;reasonCode:Exclude<CapabilityReasonCode,'AVAILABLE'>;nextAction?:Readonly<{label:string;href:string}>}>;
export function makeShellAccountViewModel(email:string):ShellAccountViewModel{return Object.freeze({email,initial:email.trim().charAt(0).toLocaleUpperCase('id-ID')||'?'});}
export function makeProjectIdentityViewModel(projectId:string,title:string):ProjectIdentityViewModel{return Object.freeze({projectId,title});}

// view-model.test.ts
import{expect,test}from'vitest';import{makeProjectIdentityViewModel,makeShellAccountViewModel}from'./view-model';test('maps least-data shell models',()=>{expect(makeShellAccountViewModel('a@example.test')).toEqual({email:'a@example.test',initial:'A'});expect(makeProjectIdentityViewModel('p1','Judul')).toEqual({projectId:'p1',title:'Judul'});});
```

Jangan buat runtime security validator yang berpura-pura menjamin data classification. Source contract Task 8 melarang restricted key names pada public types.

- [ ] **Step 5: Buat shared source test file dan CapabilityNotice**

```ts
// frontend-foundation.contract.test.ts
import{readFileSync}from'node:fs';import{resolve}from'node:path';import{describe,expect,test}from'vitest';
const srcRoot=resolve(import.meta.dirname,'..');export function source(relativePath:string):string{try{return readFileSync(resolve(srcRoot,relativePath),'utf8');}catch{return'';}}
describe('frontend foundation contracts',()=>{test('deferred authoring routes do not exist in PR1',()=>{expect(source('app/app/proyek/[projectId]/tulis/page.tsx')).toBe('');expect(source('app/app/proyek/[projectId]/bab/[chapterId]/tulis/page.tsx')).toBe('');});});

// CapabilityNotice.tsx
import{Badge,LinkButton,Surface}from'../primitives';import{CAPABILITIES,CAPABILITY_REASON_MESSAGES}from'../../lib/frontend/capabilities';import type{CapabilityNoticeViewModel}from'../../lib/frontend/view-model';
export function CapabilityNotice({notice}:{notice:CapabilityNoticeViewModel}){const capability=CAPABILITIES[notice.capabilityKey];if(capability.mode==='REAL')return null;const label=capability.mode==='PRESENTATION'?'Pratinjau fitur':'Segera tersedia';return <Surface className="rounded-lg border border-default p-4"><Badge tone="warning">{label}</Badge><p className="mt-2 text-sm text-secondary">{CAPABILITY_REASON_MESSAGES[notice.reasonCode]}</p>{notice.nextAction?<LinkButton aria-label={`${capability.primaryAction.label}: ${notice.nextAction.label}`} className="mt-3" variant="secondary" href={notice.nextAction.href}>{notice.nextAction.label}</LinkButton>:null}</Surface>;}
```

Tambah source assertion pada `frontend-foundation.contract.test.ts` agar UI notice tidak membocorkan enum implementasi:

```ts
test('capability notice uses user-facing status copy',()=>{const notice=source('components/composites/CapabilityNotice.tsx');expect(notice).toContain('Pratinjau fitur');expect(notice).toContain('Segera tersedia');expect(notice).not.toMatch(/>\{capability\.mode\}</);});
```

- [ ] **Step 6: Green gate dan commit**

Run: `pnpm --dir apps/web exec vitest run src/lib/frontend/capabilities.test.ts src/lib/frontend/view-state.test.ts src/lib/frontend/view-model.test.ts src/app/frontend-foundation.contract.test.ts && pnpm --filter @narraza/web typecheck`

Expected: PASS.

```bash
git add apps/web/src/lib/frontend apps/web/src/components/composites/CapabilityNotice.tsx apps/web/src/app/frontend-foundation.contract.test.ts
git commit -m "feat(web): add capability and presentation contracts"
```

### Task 5: Landing Parity dan Public Composites

**Files:** Create `apps/web/src/components/composites/BrandMark.tsx`, `PublicHeader.tsx`, `PublicMobileMenu.tsx`; modify compatibility `BrandMark.tsx`, `app/page.tsx`, `messages/app-id.ts`, `m0-w05.test.ts`.

**Interfaces:** Produces desktop anchors `Cara kerja`, `Fitur`, `Untuk siapa`, `Kredit`, accessible mobile menu, dan canonical section order `masalah` → `cara-kerja` → `fitur` → `untuk-siapa` → `kredit` → final CTA → footer. Komposisi reference wajib tetap: exact 3 problem cards, 6 workflow steps dalam urutan canonical, 6 feature cards, 4 persona cards termasuk `Penulis berpengalaman`, serta 3 credit tier cards dengan `Seimbang` emphasized, badge `Disarankan`, dan disclosure. Trust/FAQ boleh additive setelah `kredit` dan sebelum final CTA; existing hero/workflow/legal contracts remain.

- [ ] **Step 1: Tambah red landing assertions ke existing `m0-w05.test.ts`**

```ts
function between(sourceText:string,start:string,end:string):string{const from=sourceText.indexOf(start);const to=sourceText.indexOf(end,from+start.length);expect(from).toBeGreaterThanOrEqual(0);expect(to).toBeGreaterThan(from);return sourceText.slice(from,to);}
function expectCardArray(block:string,labels:readonly string[]){expect(block.match(/\{\s*title:/g)).toHaveLength(labels.length);for(const label of labels)expect(block).toContain(`title: '${label}'`);}
test('landing preserves exact reference composition in canonical sections',()=>{const page=source('app/page.tsx');const catalog=source('messages/app-id.ts');const header=source('components/composites/PublicHeader.tsx');const mobileMenu=source('components/composites/PublicMobileMenu.tsx');const ids=['masalah','cara-kerja','fitur','untuk-siapa','kredit','cta-final'];for(const id of ids)expect(page).toContain(`id="${id}"`);for(let index=1;index<ids.length;index+=1)expect(page.indexOf(`id="${ids[index-1]}"`)).toBeLessThan(page.indexOf(`id="${ids[index]}"`));expect(page.indexOf('id="cta-final"')).toBeLessThan(page.indexOf('<footer'));for(const [label,href] of [['Cara kerja','#cara-kerja'],['Fitur','#fitur'],['Untuk siapa','#untuk-siapa'],['Kredit','#kredit']] as const)expect(header).toContain(`['${label}', '${href}']`);expect(header).toContain('<PublicMobileMenu links={links} />');expect(mobileMenu).toContain('links.map(([label, href])');expect(mobileMenu).toContain('href={href}');expect(mobileMenu).toContain('{label}</a>');
  const problems=between(catalog,'problemCards: [','featureCards: [');const features=between(catalog,'featureCards: [','personaCards: [');const personas=between(catalog,'personaCards: [','creditTierCards: [');const credits=between(catalog,'creditTierCards: [','trust:');
  expectCardArray(problems,['“Ideku berantakan.”','“AI selalu lupa cerita sebelumnya.”','“Rahasia Bab 25 bocor di Bab 3.”']);expectCardArray(features,['Fondasi Cerita','Fakta yang Dikunci','Jadwal Rahasia','Ruang Tulis','Cek Otomatis','Paket Publish']);expectCardArray(personas,['Belum pernah menulis','Punya ide kasar','Sudah punya draft','Penulis berpengalaman']);expectCardArray(credits,['Hemat','Seimbang','Terbaik']);expect(credits).toContain("badge: 'Disarankan'");expect(credits).toContain('emphasized: true');expect(catalog).toContain("creditDisclosure: 'Harga paket kredit akan diumumkan menjelang rilis.'");
  const workflowCatalog=between(catalog,'workflow: {','finalCta: {');expect(workflowCatalog.match(/number: '[1-6]'/g)).toHaveLength(6);for(const title of ['Ngobrol','Fondasi','Rencana','Tulis','Cek','Publish'])expect(workflowCatalog).toContain(`title: '${title}'`);
  const problemSection=between(page,'id="masalah"','id="cara-kerja"');const workflowSection=between(page,'id="cara-kerja"','id="fitur"');const featureSection=between(page,'id="fitur"','id="untuk-siapa"');const personaSection=between(page,'id="untuk-siapa"','id="kredit"');const creditSection=between(page,'id="kredit"','id="cta-final"');expect(problemSection).toContain('copy.problemCards.map');expect(workflowSection).toContain('copy.workflow.steps.map');expect(featureSection).toContain('copy.featureCards.map');expect(personaSection).toContain('copy.personaCards.map');expect(creditSection).toContain('copy.creditTierCards.map');for(const [section,identifier] of [[problemSection,'copy.problemCards.map'],[workflowSection,'copy.workflow.steps.map'],[featureSection,'copy.featureCards.map'],[personaSection,'copy.personaCards.map'],[creditSection,'copy.creditTierCards.map']] as const)expect(section.match(new RegExp(identifier.replaceAll('.','\\.'),'g'))).toHaveLength(1);expect(page).not.toContain('/app/proyek/impor');expect(`${page}\n${catalog}`).not.toContain('PR1 tidak menampilkan angka kredit');});
test('public mobile menu exposes dialog semantics and accessible close behavior',()=>{const menu=source('components/composites/PublicMobileMenu.tsx');expect(menu).toContain("'use client'");expect(menu).toContain('aria-haspopup="dialog"');expect(menu).toContain('aria-expanded={open}');expect(menu).toContain('<dialog');expect(menu).toContain('aria-label="Navigasi utama mobile"');expect(menu).toContain('aria-label="Tutup menu"');expect(menu).toMatch(/event\.key\s*===\s*'Escape'/);expect(menu).toContain('previouslyFocused.current?.focus()');});
```

Run: `pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts -t "landing preserves exact reference|public mobile menu"`

Expected: FAIL.

- [ ] **Step 2: Buat BrandMark dan PublicHeader concrete files**

Pindahkan existing `BrandMark` implementation ke composite, ganti raw palette dengan `bg-action-primary text-brand-ink`, export `BrandMarkProps`, dan pertahankan exact prop behavior. Compatibility file menjadi:

```tsx
export{BrandMark}from'./composites/BrandMark';export type{BrandMarkProps}from'./composites/BrandMark';
```

```tsx
// PublicHeader.tsx
import{BrandMark}from'./BrandMark';import{PublicMobileMenu}from'./PublicMobileMenu';import{LinkButton}from'../primitives';
const links=[['Cara kerja','#cara-kerja'],['Fitur','#fitur'],['Untuk siapa','#untuk-siapa'],['Kredit','#kredit']]as const;
export function PublicHeader(){return <header className="sticky top-0 z-[var(--z-header)] border-b border-default bg-canvas/95 backdrop-blur"><div className="mx-auto flex min-h-[68px] max-w-[var(--container-marketing)] items-center gap-3 px-4 sm:px-6 lg:px-8"><BrandMark href="/"/><nav aria-label="Navigasi utama" className="ml-auto hidden items-center gap-1 lg:flex">{links.map(([label,href])=><a key={href} href={href} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-secondary">{label}</a>)}<LinkButton href="/masuk" variant="secondary">Masuk</LinkButton><LinkButton href="/daftar">Mulai gratis</LinkButton></nav><div className="ml-auto lg:hidden"><PublicMobileMenu links={links}/></div></div></header>;}

// PublicMobileMenu.tsx
'use client';
import{useEffect,useRef,useState}from'react';import{IconButton,LinkButton}from'../primitives';
export function PublicMobileMenu({links}:{links:readonly (readonly [label:string,href:string])[]}){const[open,setOpen]=useState(false);const dialogRef=useRef<HTMLDialogElement>(null);const triggerRef=useRef<HTMLButtonElement>(null);const previouslyFocused=useRef<HTMLElement|null>(null);useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open){previouslyFocused.current=document.activeElement instanceof HTMLElement?document.activeElement:triggerRef.current;dialog.showModal();dialog.querySelector<HTMLElement>('a')?.focus();}else if(!open&&dialog.open)dialog.close();},[open]);useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;const cancel=(event:Event)=>{event.preventDefault();setOpen(false);};const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};const close=()=>{previouslyFocused.current?.focus();previouslyFocused.current=null;};dialog.addEventListener('cancel',cancel);dialog.addEventListener('keydown',keydown);dialog.addEventListener('close',close);return()=>{dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('keydown',keydown);dialog.removeEventListener('close',close);};},[]);return <><button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} className="min-h-11 rounded-md border border-default px-3 font-semibold" onClick={()=>setOpen(true)}>Menu</button><dialog ref={dialogRef} aria-label="Navigasi utama mobile" className="m-0 ml-auto min-h-dvh w-[min(320px,calc(100%-48px))] max-w-none bg-surface p-0 text-primary backdrop:bg-brand-ink/40"><div className="flex justify-end border-b border-default p-3"><IconButton aria-label="Tutup menu" onClick={()=>setOpen(false)}>×</IconButton></div><nav aria-label="Navigasi utama mobile" className="flex flex-col gap-2 p-4">{links.map(([label,href])=><a key={href} href={href} className="flex min-h-11 items-center rounded-md px-3 font-semibold" onClick={()=>setOpen(false)}>{label}</a>)}<LinkButton href="/masuk" variant="secondary">Masuk</LinkButton><LinkButton href="/daftar">Mulai gratis</LinkButton></nav></dialog></>;}
```

Native modal `<dialog>` memberi scrim dan focus containment. Explicit close, `Escape`, close-on-link, focus awal, dan focus restoration wajib dipertahankan; mobile menu bukan pengganti empat anchor desktop.

- [ ] **Step 3: Tambah exact catalog data**

```ts
problemSection:{title:'Menulis panjang itu berat bukan karena idemu jelek',description:'Tiga masalah yang paling sering menghentikan serial di tengah jalan.'},
problemCards:[{title:'“Ideku berantakan.”',description:'Narra mengubah percakapan santai menjadi fondasi cerita yang rapi: tokoh, konflik, janji pembaca, dan arah ending — tanpa istilah teknis.'},{title:'“AI selalu lupa cerita sebelumnya.”',description:'Fakta, relasi, dan rahasia disimpan sebagai catatan cerita yang dijaga. Setiap adegan baru ditulis dari catatan itu, bukan dari ingatan kosong.'},{title:'“Rahasia Bab 25 bocor di Bab 3.”',description:'Jadwal Rahasia menjaga kapan petunjuk boleh muncul dan kapan jawaban boleh terbuka. Cek Otomatis memperingatkan sebelum terlambat.'}],
featureSection:{title:'Yang dijaga Narraza untukmu'},
featureCards:[{title:'Fondasi Cerita',description:'Tokoh, konflik, janji pembaca, dan arah ending tersimpan rapi. Dikunci saat kamu siap — bukan sebelum itu.'},{title:'Fakta yang Dikunci',description:'Fakta penting buatan AI selalu berupa usulan dulu. Kamu yang menerima, mengubah, atau menolak.'},{title:'Jadwal Rahasia',description:'Atur kapan petunjuk muncul dan kapan jawaban terbuka. Rahasiamu tidak bocor sebelum waktunya.'},{title:'Ruang Tulis',description:'Editor per adegan dengan arahan, versi yang bisa dibandingkan, dan perbaikan terarah — bukan textarea kosong.'},{title:'Cek Otomatis',description:'Cerita nyambung, pengetahuan tokoh sesuai, ending bab cukup kuat — diperiksa sebelum kamu menerima versi.'},{title:'Paket Publish',description:'Teaser, sinopsis, caption promosi, dan preview HP dari bab yang sudah kamu setujui.'}],
personaSection:{title:'Mulai dari titik manapun kamu berada'},
personaCards:[{title:'Belum pernah menulis',description:'Tidak perlu tahu istilah premis atau plot. Jawab pertanyaan ringan Narra, dan lihat ceritamu terbentuk.'},{title:'Punya ide kasar',description:'Satu kalimat konflik cukup. Narraza membantu mengubahnya menjadi konsep, karakter, dan rencana bab.'},{title:'Sudah punya draft',description:'Bawa draftmu. Narraza membacanya, menemukan tokoh dan fakta, lalu membantu melanjutkan dengan konsisten.'},{title:'Penulis berpengalaman',description:'Kontrol penuh atas fondasi, fakta, reveal, outline, dan setiap perubahan cerita resmi.'}],
creditSection:{title:'Bayar sesuai yang kamu pakai, tanpa kejutan',description:'Narraza memakai kredit. Sebelum setiap adegan dibuat, kamu melihat perkiraan biayanya lebih dulu. Kalau proses gagal, kreditmu dikembalikan.'},
creditTierCards:[{title:'Hemat',description:'Untuk draft cepat dan eksperimen ide. Biaya per adegan paling rendah.'},{title:'Seimbang',description:'Kualitas dan biaya seimbang untuk penulisan serial rutin.',badge:'Disarankan',emphasized:true},{title:'Terbaik',description:'Untuk bab penting: reveal besar, ending arc, adegan emosional kunci.'}],
creditDisclosure:'Harga paket kredit akan diumumkan menjelang rilis.',
trust:{title:'Cerita tetap milikmu',description:'Narraza membantu menyusun dan memeriksa. Keputusan kreatif tetap ada di tanganmu.',faq:[{question:'Siapa yang bisa membaca ceritaku?',answer:'Akses cerita mengikuti akun dan proyekmu. Informasi hukum lengkap tetap mengikuti Kebijakan Privasi.'},{question:'Apakah Narraza menjamin cerita selalu benar?',answer:'Tidak. Narraza membantu menjaga konsistensi, tetapi hasil tetap perlu kamu tinjau.'},{question:'Apa yang dikirim ke penyedia AI?',answer:'Hanya konteks yang diperlukan untuk proses yang kamu jalankan. Rincian final mengikuti Kebijakan Privasi dan kebijakan penyedia yang disetujui.'}]},
```

Copy tidak mengklaim no-training, export, permanent deletion, atau provider guarantee sebelum legal/model-policy gate final.

- [ ] **Step 4: Mekanically refactor `app/page.tsx`**

1. Replace header lines 20–41 dengan `<PublicHeader />`.
2. Pertahankan hero h1, user-facing copy, `/daftar`, `#cara-kerja`, preview, exact six workflow steps dalam urutan `Ngobrol`, `Fondasi`, `Rencana`, `Tulis`, `Cek`, `Publish`, final CTA, dan footer legal links.
3. Setelah hero render `<section id="masalah">` yang maps dedicated `copy.problemCards` menjadi exact 3 `<Card>` pada `lg`; jangan pakai replacement labels.
4. Setelah masalah render existing six-step workflow sebagai `<section id="cara-kerja">`.
5. Setelah workflow render `<section id="fitur">` yang maps dedicated `copy.featureCards` menjadi exact 6 `<Card>`.
6. Setelah fitur render `<section id="untuk-siapa">` yang maps dedicated `copy.personaCards` menjadi exact 4 `<Card>`, termasuk `Penulis berpengalaman`; section hanya copy, tanpa fabricated route.
7. Setelah persona render `<section id="kredit">` dengan `copy.creditSection`, lalu map dedicated `copy.creditTierCards` menjadi exact 3 tier cards. `Seimbang` memakai emphasized border/treatment dan visible badge `Disarankan`; render `copy.creditDisclosure` setelah grid.
8. Trust/FAQ bersifat additive: bila dipertahankan, render `<section id="kepercayaan">` setelah `#kredit` dan sebelum final CTA, dengan trust description dan `<dl>`; setiap FAQ menjadi `<div><dt>{question}</dt><dd>{answer}</dd></div>`. Copy tambahan tetap tunduk pada approved security/legal constraints dan tidak boleh mengklaim backend guarantee.
9. Beri existing final CTA `id="cta-final"`, lalu footer tetap setelahnya. Urutan canonical yang diuji harus `#masalah` → `#cara-kerja` → `#fitur` → `#untuk-siapa` → `#kredit` → optional `#kepercayaan` → `#cta-final` → footer.
10. Replace raw colors hanya pada landing file dengan semantic utilities Task 1. Jangan mengubah route behavior atau menampilkan copy milestone internal seperti `PR1 tidak menampilkan angka kredit...`.

Render strategy exact untuk setiap list:

```tsx
<div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{copy.problemCards.map((item)=><Card key={item.title}><h3 className="text-lg font-bold">{item.title}</h3><p className="mt-2 text-secondary">{item.description}</p></Card>)}</div>
```

Gunakan identifier map dedicated yang sama untuk section lain: `copy.featureCards.map`, `copy.personaCards.map`, dan `copy.creditTierCards.map`. Ini membuat source test mengikat count/label ke section yang benar, bukan lolos karena label kebetulan muncul pada catalog atau section lain.

- [ ] **Step 5: Green gate dan commit**

Run: `pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts && pnpm --filter @narraza/web typecheck && pnpm --filter @narraza/web build`

Expected: PASS.

```bash
git add apps/web/src/app/page.tsx apps/web/src/messages/app-id.ts apps/web/src/app/m0-w05.test.ts apps/web/src/components/BrandMark.tsx apps/web/src/components/composites/BrandMark.tsx apps/web/src/components/composites/PublicHeader.tsx apps/web/src/components/composites/PublicMobileMenu.tsx
git commit -m "feat(web): align landing with approved reference"
```

### Task 6: Auth Visual Parity Tanpa Behavior Drift

**Files:** Modify `AuthCard.tsx`, `fields.tsx`, `ResendVerificationForm.tsx`, `frontend-foundation.contract.test.ts`.

**Interfaces:** Existing `TextField`, `SubmitButton`, `FormError`, `FormNotice` APIs remain. Existing form files/actions remain unchanged except `ResendVerificationForm` consumes `Input`/`Button` while preserving `resendVerificationAction`.

- [ ] **Step 1: Tambah existing-auth characterization lock ke existing Task 4 contract file dan buktikan green**

```ts
test('existing auth behavior preserves action identifiers labels and current pending guard',()=>{const files=['LoginForm.tsx','RegisterForm.tsx','ForgotPasswordForm.tsx','NewPasswordForm.tsx','ConfirmVerificationForm.tsx','ResendVerificationForm.tsx'].map((file)=>source(`components/auth/${file}`)).join('\n');for(const label of ['Alamat email','Kata sandi','Ulangi kata sandi','Buat akun','Verifikasi & masuk','Masuk','Lupa kata sandi?','Kata sandi baru','Ulangi kata sandi baru','Simpan kata sandi baru'])expect(files).toContain(label);for(const action of ['loginAction','registerAction','requestPasswordResetAction','completeResetAction','completeVerificationAction','resendVerificationAction'])expect(files).toContain(action);expect(files).toContain('useActionState');const fields=source('components/auth/fields.tsx');expect(fields).toContain('useFormStatus');expect(fields).toContain('disabled={pending}');});
```

Run: `pnpm --dir apps/web exec vitest run src/app/frontend-foundation.contract.test.ts -t "existing auth behavior"`

Expected: PASS before visual edit. Ini characterization gate hanya untuk behavior yang sudah ada; jangan memasukkan atau mengklaim guard resend baru di gate ini.

- [ ] **Step 2: Tambah separate resend pending guard test dan buktikan red sebelum implementation**

```ts
test('resend verification prevents duplicate submit while pending',()=>{const resend=source('components/auth/ResendVerificationForm.tsx');expect(resend).toContain("import { useFormStatus } from 'react-dom'");expect(resend).toContain('const { pending } = useFormStatus()');expect(resend).toContain('disabled={pending}');expect(resend).toContain("pending ? 'Mengirim…' : 'Kirim ulang'");});
```

Run: `pnpm --dir apps/web exec vitest run src/app/frontend-foundation.contract.test.ts -t "resend verification prevents"`

Expected: FAIL pada current code karena `ResendVerificationForm.tsx` belum memakai `useFormStatus`; kegagalan ini menjadi red guard terpisah.

- [ ] **Step 3: Replace AuthCard implementation dengan concrete composition**

```tsx
import type{ReactNode}from'react';import{BrandMark}from'../BrandMark';import{Card,Container,Stack}from'../primitives';
export function AuthCard({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}){return <main className="flex min-h-screen items-center bg-canvas py-12"><Container size="form"><Stack gap={6}><BrandMark href="/"/><Card className="mx-auto w-full max-w-md"><h1 className="font-serif text-3xl font-bold text-primary">{title}</h1>{subtitle?<p className="mt-2 mb-6 text-secondary">{subtitle}</p>:<div className="mb-6"/>}{children}</Card></Stack></Container></main>;}
```

- [ ] **Step 4: Replace fields implementation dengan concrete primitive usage**

```tsx
'use client';import{useFormStatus}from'react-dom';import{Button,Field,Input}from'../primitives';
export function TextField(props:{label:string;name:string;type?:string;autoComplete?:string;required?:boolean;defaultValue?:string}){const id=`f-${props.name}`;return <Field id={id} label={props.label}>{({describedBy,invalid})=><Input id={id} name={props.name} type={props.type??'text'} autoComplete={props.autoComplete} required={props.required} defaultValue={props.defaultValue} aria-describedby={describedBy} aria-invalid={invalid||undefined}/>}</Field>;}
export function SubmitButton({children}:{children:string}){const{pending}=useFormStatus();return <Button type="submit" disabled={pending}>{pending?'Memproses…':children}</Button>;}
export function FormError({message}:{message?:string}){return message?<p role="alert" className="rounded-sm bg-status-danger-soft px-3 py-2 text-sm text-status-danger">{message}</p>:null;}
export function FormNotice({message}:{message:string}){return <p className="rounded-sm bg-status-info-soft px-3 py-2 text-sm text-status-info">{message}</p>;}
```

- [ ] **Step 5: Mechanically edit ResendVerificationForm styling dan implement pending guard**

Keep `'use client'`, `useActionState(resendVerificationAction, initialFormState)`, success branch, form action, error branch, action identity, dan payload. Add `import { useFormStatus } from 'react-dom';` serta `import { Button, Input } from '../primitives';`. Tambah leaf submit di file sama agar status membaca parent form action tanpa state kedua:

```tsx
function ResendSubmitButton(){const { pending } = useFormStatus();return <Button type="submit" variant="secondary" className="min-h-10" disabled={pending}>{pending ? 'Mengirim…' : 'Kirim ulang'}</Button>;}
```

Replace existing input element with `<Input name="email" type="email" required placeholder="Email untuk kirim ulang" className="min-h-10 flex-1" />` dan existing submit element dengan `<ResendSubmitButton />`. Set form class to `flex flex-col gap-2 rounded-sm bg-surface-soft p-3`; set explanatory paragraph class to `text-sm text-secondary`; keep wrapping `<div className="flex gap-2">`. `useFormStatus().pending` menjadi single duplicate-submit guard; jangan tambah local pending state, debounce, perubahan Server Action, atau perubahan success/error semantics.

- [ ] **Step 6: Green characterization plus resend guard, auth E2E, commit**

Run: `pnpm --dir apps/web exec vitest run src/app/frontend-foundation.contract.test.ts src/app/m0-w05.test.ts && pnpm --filter @narraza/web typecheck`

Expected: PASS.

Run with services: `pnpm exec playwright test tests/e2e/auth.smoke.spec.ts --project=desktop`

Expected: PASS real auth flow.

```bash
git add apps/web/src/components/auth/AuthCard.tsx apps/web/src/components/auth/fields.tsx apps/web/src/components/auth/ResendVerificationForm.tsx apps/web/src/app/frontend-foundation.contract.test.ts
git commit -m "feat(web): align auth visuals without semantic changes"
```

### Task 7: Distinct Global dan Project Shells

**Files:** Create shell composites including `ProjectNavigationDrawer.tsx` and nested project layout; modify root app layout/global pages/messages/tests.

**Interfaces:** `AppHeader({account,logoutAction})` remains Server Component-compatible; `RouteAwareNavLink` menjadi narrow pathname client leaf dan satu-satunya authority active route; `MobileMoreControl` tetap client owner untuk mobile `Lainnya` state saja; `ProjectNavigationDrawer` menjadi distinct tablet side drawer at `768–1279`; `buildProjectNavigation(projectId)` menjadi shared typed `CapabilityKey` source untuk desktop sidebar dan tablet drawer.

- [ ] **Step 1: Tambah red shell contracts dan migrasikan broad M0 W0.5 assertions tanpa mengecilkan coverage**

```ts
// frontend-foundation.contract.test.ts
test('shell preserves guard logout typed IA and route-authoritative active state',()=>{const layout=source('app/app/layout.tsx');expect(layout.match(/getCurrentUser\(\)/g)).toHaveLength(1);expect(layout).toContain("redirect('/masuk')");expect(layout).toContain('logoutAction');const nav=[source('components/composites/ProjectSidebar.tsx'),source('components/composites/ProjectNavigationDrawer.tsx'),source('components/composites/MobileBottomNav.tsx'),source('components/composites/MobileMoreSheet.tsx')].join('\n');expect(nav).toContain('CapabilityKey');expect(nav).toContain('CAPABILITIES');expect(nav).toContain('CAPABILITY_REASON_MESSAGES');expect(nav).toContain('CAPABILITY_REASON_MESSAGES[capability.reasonCode]');const active=source('components/composites/RouteAwareNavLink.tsx');expect(active).toContain("'use client'");expect(active).toContain('usePathname');expect(active).toContain("aria-current={active?'page':undefined}");expect(active).not.toContain('useState');});
test('project layout resolves identity owner scoped',()=>{const layout=source('app/app/proyek/[projectId]/layout.tsx');expect(layout).toContain('getMyProject(projectId)');expect(layout).toContain('if (!project) notFound()');});

// Replace only old `authenticated layout guards once and renders exact disabled navigation`
// body in m0-w05.test.ts. Keep all other landing/dashboard/legal tests byte-for-byte.
test('authenticated layout guards once and renders exact canonical navigation', () => {
  const layout = source('app/app/layout.tsx');
  const nav = [
    source('components/composites/ProjectSidebar.tsx'),
    source('components/composites/ProjectNavigationDrawer.tsx'),
    source('components/composites/MobileBottomNav.tsx'),
    source('components/composites/MobileMoreSheet.tsx'),
  ].join('\n');
  expect(layout.match(/getCurrentUser\(\)/g)).toHaveLength(1);
  expect(layout).toContain("redirect('/masuk')");
  expect(`${layout}\n${source('components/composites/AppHeader.tsx')}`).toContain('action={logoutAction}');
  expect(nav).toContain('aria-disabled="true"');
  expect(nav).not.toMatch(/<a[^>]+aria-disabled="true"/);
  expect(nav).toContain('CAPABILITY_REASON_MESSAGES[capability.reasonCode]');
  expect(nav).toMatch(/aria-disabled="true"[\s\S]{0,500}\{reason\}/);
  expect(`${layout}\n${source('messages/app-id.ts')}`).toContain('Kredit — segera hadir');
  const groups = ['PERSIAPAN', 'PERENCANAAN', 'PENULISAN', 'PEMERIKSAAN', 'PUBLIKASI', 'LAINNYA'];
  const items = ['Beranda', 'Chat Narra', 'Fondasi', 'Karakter', 'Rencana Cerita', 'Jadwal Rahasia', 'Fakta', 'Naskah', 'Tulis', 'Cek Cerita', 'Paket Publish', 'Kredit & Penggunaan', 'Pengaturan'];
  for (const label of [...groups, ...items]) expect(nav).toContain(label);
  expect(nav).not.toContain('Tutup Bab');
});
```

Migration wajib mempertahankan seluruh broad assertions lama: auth guard count, redirect, logout action, disabled non-anchor semantics, visible disabled reason, credit copy, semua enam group, dan setiap canonical item. Broad migration test hanya membaca rendered navigation sources (`ProjectSidebar.tsx`, `ProjectNavigationDrawer.tsx`, `MobileBottomNav.tsx`, `MobileMoreSheet.tsx`); jangan memasukkan `capabilities.ts` karena registry metadata dapat membuat label lolos tanpa dirender. Registry tetap diuji terpisah oleh `capabilities.test.ts`. Hanya label lama yang berubah ke IA approved. `Tutup Bab` harus asserted absent karena `Selesaikan Bab` adalah CTA kontekstual chapter, bukan sidebar/mobile item. Jangan mengganti broad test dengan subset contract test.

Run: `pnpm --dir apps/web exec vitest run src/app/frontend-foundation.contract.test.ts -t "shell|project layout"`

Expected: FAIL.

- [ ] **Step 2: Add exact shell message/navigation data**

```ts
shell:{desktopGroups:['PERSIAPAN','PERENCANAAN','PENULISAN','PEMERIKSAAN','PUBLIKASI','LAINNYA'],mobileTabs:['Beranda','Rencana','Tulis','Cek','Lainnya'],creditSoon:'Kredit — segera hadir',avatarLabel:'Akun',logout:'Keluar',navigationLabel:'Navigasi aplikasi'}
```

Reason copy tidak disalin ke catalog shell. Navigation, disabled reasons, notices, dan tests memakai typed `CapabilityKey` lalu membaca `CAPABILITIES[key]` dan `CAPABILITY_REASON_MESSAGES[reasonCode]`. Replace old shell groups only after broad source assertions migrate ke exact builder below; labels preserved.

- [ ] **Step 3: Buat exact project navigation builder in `ProjectSidebar.tsx`**

```tsx
import{CAPABILITIES,CAPABILITY_REASON_MESSAGES}from'../../lib/frontend/capabilities';import type{CapabilityKey}from'../../lib/frontend/capabilities';import{RouteAwareNavLink}from'./RouteAwareNavLink';
export type ProjectNavigationItem=Readonly<{label:string;capabilityKey:CapabilityKey;href?:string}>;export type ProjectNavigationGroup=Readonly<{label:string;items:readonly ProjectNavigationItem[]}>;
export function buildProjectNavigation(projectId:string):readonly ProjectNavigationGroup[]{const base=`/app/proyek/${encodeURIComponent(projectId)}`;return[
{label:'PERSIAPAN',items:[{label:'Beranda',capabilityKey:'project.home.view',href:base},{label:'Chat Narra',capabilityKey:'project.chat.user-message',href:`${base}/chat`},{label:'Fondasi',capabilityKey:'project.foundation.manage',href:`${base}/fondasi`},{label:'Karakter',capabilityKey:'project.characters.read',href:`${base}/karakter`}]},
{label:'PERENCANAAN',items:[{label:'Rencana Cerita',capabilityKey:'project.outline.create',href:`${base}/outline`},{label:'Jadwal Rahasia',capabilityKey:'project.secrets.read',href:`${base}/rahasia`},{label:'Fakta',capabilityKey:'project.facts.read',href:`${base}/fakta`}]},
{label:'PENULISAN',items:[{label:'Naskah',capabilityKey:'project.manuscript.view'},{label:'Tulis',capabilityKey:'project.write.resume'}]},
{label:'PEMERIKSAAN',items:[{label:'Cek Cerita',capabilityKey:'chapter.check.run'}]},
{label:'PUBLIKASI',items:[{label:'Paket Publish',capabilityKey:'project.publish.view'}]},
{label:'LAINNYA',items:[{label:'Kredit & Penggunaan',capabilityKey:'app.credit.view'},{label:'Pengaturan',capabilityKey:'app.settings.view'}]},]as const;}
export function ProjectNavigation({projectId,labelledBy,idPrefix}:{projectId:string;labelledBy?:string;idPrefix:string}){return <nav aria-label={labelledBy?undefined:'Navigasi proyek'} aria-labelledby={labelledBy} className="p-4">{buildProjectNavigation(projectId).map((group)=>{const headingId=`${idPrefix}-${group.label.toLocaleLowerCase('id-ID')}`;return <section key={group.label} aria-labelledby={headingId} className="mb-6"><h2 id={headingId} className="px-3 text-xs font-bold text-muted">{group.label}</h2><ul className="mt-2 space-y-1">{group.items.map((item)=>{const capability=CAPABILITIES[item.capabilityKey];const reason=CAPABILITY_REASON_MESSAGES[capability.reasonCode];return <li key={item.capabilityKey}>{item.href?<RouteAwareNavLink href={item.href} className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-secondary hover:bg-brand-soft" activeClassName="bg-brand-soft text-primary">{item.label}</RouteAwareNavLink>:<div aria-disabled="true" className="rounded-md px-3 py-2 text-muted"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs">{reason}</span></div>}</li>;})}</ul></section>;})}</nav>;}export function ProjectSidebar({projectId}:{projectId:string}){return <aside data-testid="project-sidebar" className="hidden w-64 shrink-0 border-r border-default bg-surface xl:block"><div className="sticky top-[68px] max-h-[calc(100vh-68px)] overflow-y-auto"><ProjectNavigation projectId={projectId} idPrefix="sidebar-nav"/></div></aside>;}
```

`href` hanya ada untuk existing PR1/M2 routes. Registry declaration tidak membuat href. Item protected yang sudah punya existing route tetap navigable setelah owner-scoped project layout lolos; action enablement di halaman tetap server-authoritative dan bukan hasil registry. Disabled reason wajib tampak sebagai caption non-hover; `title` dan `sr-only` saja tidak cukup.

- [ ] **Step 4: Buat distinct tablet project navigation drawer**

`ProjectNavigationDrawer.tsx` harus memakai shared `ProjectNavigation`, bukan menduplikasi data. Drawer aktif hanya `md` sampai sebelum `xl` (`768–1279`), berbeda dari mobile `Lainnya` bottom sheet. Native modal `<dialog>` memberi focus trap dan scrim; `useNativeDialog` memberi `Escape`, close, dan focus restoration ke trigger.

```tsx
'use client';
import{useState}from'react';import{IconButton}from'../primitives';import{ProjectNavigation}from'./ProjectSidebar';import{useNativeDialog}from'./use-native-dialog';
export function ProjectNavigationDrawer({projectId}:{projectId:string}){const[open,setOpen]=useState(false);const dialogRef=useNativeDialog({open,onOpenChange:setOpen});return <div className="hidden md:block xl:hidden"><button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="project-navigation-drawer" className="m-3 min-h-11 rounded-md border border-default px-3 font-semibold" onClick={()=>setOpen(true)}><span aria-hidden="true">☰</span> Menu proyek</button><dialog id="project-navigation-drawer" ref={dialogRef} aria-labelledby="project-navigation-drawer-title" className="m-0 h-dvh w-[min(360px,calc(100%-64px))] max-w-none bg-surface p-0 text-primary shadow-lg backdrop:bg-brand-ink/40"><div className="flex min-h-11 items-center justify-between border-b border-default p-3"><h2 id="project-navigation-drawer-title" className="font-bold">Navigasi proyek</h2><IconButton data-dialog-initial-focus aria-label="Tutup navigasi proyek" onClick={()=>setOpen(false)}>×</IconButton></div><div className="h-[calc(100dvh-68px)] overflow-y-auto"><ProjectNavigation projectId={projectId} labelledBy="project-navigation-drawer-title" idPrefix="drawer-nav"/></div></dialog></div>;}
```

Tambah source contract:

```ts
test('tablet project navigation is a distinct accessible drawer',()=>{const drawer=source('components/composites/ProjectNavigationDrawer.tsx');expect(drawer).toContain("'use client'");expect(drawer).toContain('md:block xl:hidden');expect(drawer).toContain('aria-haspopup="dialog"');expect(drawer).toContain('aria-expanded={open}');expect(drawer).toContain('<dialog');expect(drawer).toContain('backdrop:bg-brand-ink/40');expect(drawer).toContain('useNativeDialog');expect(drawer).toContain('<ProjectNavigation');expect(drawer).not.toContain('BottomSheet');});
```

- [ ] **Step 5: Buat direct-logout server-compatible AppHeader**

```tsx
import type{ShellAccountViewModel}from'../../lib/frontend/view-model';import{BrandMark}from'./BrandMark';import{Button}from'../primitives';
export function AppHeader({account,logoutAction}:{account:ShellAccountViewModel;logoutAction:()=>Promise<void>}){return <header className="sticky top-0 z-[var(--z-header)] border-b border-default bg-surface"><div className="flex min-h-[68px] items-center gap-3 px-3 sm:px-6"><BrandMark href="/app"/><span className="ml-auto hidden min-h-11 items-center rounded-pill border border-default bg-canvas px-4 text-sm text-secondary sm:inline-flex">Kredit — segera hadir</span><span aria-label={`Akun: ${account.email}`} title={account.email} className="flex size-11 items-center justify-center rounded-pill bg-brand-ink text-sm font-bold text-white">{account.initial}</span><form action={logoutAction}><Button type="submit" variant="secondary">Keluar</Button></form></div></header>;}
```

No `'use client'`; no dialog; direct interaction unchanged.

- [ ] **Step 6: Buat GlobalAppShell dan ProjectAppShell**

```tsx
// GlobalAppShell.tsx
import type{ReactNode}from'react';import{MobileBottomNav}from'./MobileBottomNav';export function GlobalAppShell({children}:{children:ReactNode}){return <div className="min-w-0 pb-20 xl:pb-0"><div data-testid="global-shell">{children}</div><MobileBottomNav context={{kind:'global'}}/></div>;}
// ProjectAppShell.tsx
import type{ReactNode}from'react';import type{ProjectIdentityViewModel}from'../../lib/frontend/view-model';import{MobileBottomNav}from'./MobileBottomNav';import{ProjectNavigationDrawer}from'./ProjectNavigationDrawer';import{ProjectSidebar}from'./ProjectSidebar';export function ProjectAppShell({project,children}:{project:ProjectIdentityViewModel;children:ReactNode}){return <div data-testid="project-shell" className="mx-auto flex w-full max-w-[1600px]"><ProjectSidebar projectId={project.projectId}/><div className="min-w-0 flex-1 pb-20 xl:pb-0"><div className="border-b border-default bg-surface px-4 py-3 sm:px-6"><ProjectNavigationDrawer projectId={project.projectId}/><p className="text-xs font-semibold text-muted">PROYEK</p><p className="truncate font-bold text-primary">{project.title}</p></div>{children}</div><MobileBottomNav context={{kind:'project',projectId:project.projectId}}/></div>;}
```

- [ ] **Step 7: Buat narrow pathname boundary serta reachable mobile control/sheet dengan exact nav semantics**

`RouteAwareNavLink.tsx` adalah leaf client boundary. Tidak ada selected state; `usePathname()` menjadi satu-satunya route authority. Exact match dipakai untuk project home, prefix match hanya saat `match="prefix"` diberikan oleh caller untuk section yang memang mencakup descendants.

```tsx
// RouteAwareNavLink.tsx
'use client';import Link from'next/link';import{usePathname}from'next/navigation';import type{ReactNode}from'react';
export function RouteAwareNavLink({href,children,className,activeClassName,match='exact'}:{href:string;children:ReactNode;className:string;activeClassName:string;match?:'exact'|'prefix'}){const pathname=usePathname();const active=pathname===href||(match==='prefix'&&pathname.startsWith(`${href}/`));return <Link href={href} aria-current={active?'page':undefined} className={`${className}${active?` ${activeClassName}`:''}`}>{children}</Link>;}

```

```tsx
// MobileMoreSheet.tsx
'use client';import{logoutAction}from'../../server/auth/actions';import{CAPABILITIES,CAPABILITY_REASON_MESSAGES}from'../../lib/frontend/capabilities';import type{CapabilityKey}from'../../lib/frontend/capabilities';import{BottomSheet}from'./BottomSheet';import{RouteAwareNavLink}from'./RouteAwareNavLink';import{Button}from'../primitives';
type Context={kind:'global'}|{kind:'project';projectId:string};type SheetItem=Readonly<{label:string;capabilityKey:CapabilityKey;href?:string}>;
export function MobileMoreSheet({open,onOpenChange,context}:{open:boolean;onOpenChange(open:boolean):void;context:Context}){const base=context.kind==='project'?`/app/proyek/${encodeURIComponent(context.projectId)}`:null;const items:readonly SheetItem[]=base?[{label:'Chat Narra',capabilityKey:'project.chat.user-message',href:`${base}/chat`},{label:'Fondasi',capabilityKey:'project.foundation.manage',href:`${base}/fondasi`},{label:'Karakter',capabilityKey:'project.characters.read',href:`${base}/karakter`},{label:'Jadwal Rahasia',capabilityKey:'project.secrets.read',href:`${base}/rahasia`},{label:'Fakta',capabilityKey:'project.facts.read',href:`${base}/fakta`},{label:'Naskah',capabilityKey:'project.manuscript.view'},{label:'Paket Publish',capabilityKey:'project.publish.view'},{label:'Kredit & Penggunaan',capabilityKey:'app.credit.view'},{label:'Pengaturan',capabilityKey:'app.settings.view'}]:[];return <BottomSheet open={open} onOpenChange={onOpenChange} title="Lainnya" description="Navigasi dan akun"><nav aria-label="Navigasi lainnya"><ul className="space-y-1">{items.map((item)=>{const capability=CAPABILITIES[item.capabilityKey];const reason=CAPABILITY_REASON_MESSAGES[capability.reasonCode];return <li key={item.capabilityKey}>{item.href?<RouteAwareNavLink className="flex min-h-11 items-center rounded-md px-3 font-semibold text-secondary" activeClassName="bg-brand-soft text-primary" href={item.href}>{item.label}</RouteAwareNavLink>:<div aria-disabled="true" className="rounded-md px-3 py-2 text-muted"><span className="block font-semibold">{item.label}</span><span className="mt-1 block text-xs">{reason}</span></div>}</li>;})}</ul></nav><form action={logoutAction} className="mt-4 border-t border-default pt-4"><Button type="submit" variant="secondary" className="w-full">Keluar</Button></form></BottomSheet>;}

// MobileMoreControl.tsx
'use client';import{useState}from'react';import{MobileMoreSheet}from'./MobileMoreSheet';export function MobileMoreControl({context}:{context:{kind:'global'}|{kind:'project';projectId:string}}){const[open,setOpen]=useState(false);return <><button type="button" className="min-h-11 min-w-11 px-2 text-xs font-semibold" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>Lainnya</button><MobileMoreSheet open={open} onOpenChange={setOpen} context={context}/></>;}
```

`MobileBottomNav.tsx` remains server component; pathname knowledge stays inside each `RouteAwareNavLink` leaf:

```tsx
import{CAPABILITIES,CAPABILITY_REASON_MESSAGES}from'../../lib/frontend/capabilities';import type{CapabilityKey}from'../../lib/frontend/capabilities';import{MobileMoreControl}from'./MobileMoreControl';import{RouteAwareNavLink}from'./RouteAwareNavLink';type Context={kind:'global'}|{kind:'project';projectId:string};type MobileItem=Readonly<{label:string;capabilityKey:CapabilityKey;href?:string}>;
export function MobileBottomNav({context}:{context:Context}){const base=context.kind==='project'?`/app/proyek/${encodeURIComponent(context.projectId)}`:null;const items:readonly MobileItem[]=[{label:'Beranda',capabilityKey:base?'project.home.view':'app.dashboard.view',href:base??'/app'},{label:'Rencana',capabilityKey:'project.outline.create',href:base?`${base}/outline`:undefined},{label:'Tulis',capabilityKey:'project.write.resume'},{label:'Cek',capabilityKey:'chapter.check.run'}];return <nav aria-label="Navigasi aplikasi mobile" className="fixed inset-x-0 bottom-0 z-[var(--z-header)] grid grid-cols-5 border-t border-default bg-surface pb-[env(safe-area-inset-bottom)] xl:hidden">{items.map((item)=>{const capability=CAPABILITIES[item.capabilityKey];const reason=base?CAPABILITY_REASON_MESSAGES[capability.reasonCode]:CAPABILITY_REASON_MESSAGES.PROJECT_CONTEXT_REQUIRED;return item.href?<RouteAwareNavLink key={item.capabilityKey} className="flex min-h-11 items-center justify-center px-2 text-xs font-semibold" activeClassName="bg-brand-soft text-primary" href={item.href}>{item.label}</RouteAwareNavLink>:<span key={item.capabilityKey} aria-disabled="true" className="flex min-h-11 flex-col items-center justify-center px-1 text-muted"><span className="text-xs">{item.label}</span><span className="text-[10px] leading-tight">{reason}</span></span>;})}<MobileMoreControl context={context}/></nav>;}
```

`MobileMoreControl` button tidak mendapat `aria-current`; open sheet state bukan selected navigation state. Disabled reasons selalu visible caption/treatment pada sidebar, drawer, bottom nav, dan sheet; `title` atau `sr-only` tidak boleh menjadi satu-satunya penjelasan. E2E Task 8 wajib membuka project home, outline, dan satu nested existing route lalu assert tepat link route aktif memiliki `aria-current="page"`, termasuk update setelah client navigation. Pada width 768, lakukan assertions melalui tablet drawer, bukan `Lainnya` bottom sheet.

`MobileMoreSheet` imports existing module-level Server Action exactly as current client auth forms import actions. Both header and sheet keep direct form submission; no action prop is serialized through unrelated layouts.

- [ ] **Step 8: Refactor layouts/pages with exact mechanical edits**

`app/app/layout.tsx`: retain imports/session guard; replace rendered shell with skip link, `<AppHeader account={makeShellAccountViewModel(user.email)} logoutAction={logoutAction}/>` and `<div id="app-main-content">{children}</div>`. Exactly one `getCurrentUser()` remains.

`app/app/page.tsx`: add `import { GlobalAppShell } from '../../components/composites/GlobalAppShell';`. Keep `const projects = await listMyProjects();` and every line of current `<main>` node unchanged. Insert `<GlobalAppShell>` immediately after `return (` and `</GlobalAppShell>` immediately before matching `);`.

`app/app/proyek/baru/page.tsx`: add `GlobalAppShell` import from `../../../../components/composites/GlobalAppShell`. Keep existing Server Action, form JSX, names, values, and selectors unchanged. Insert `<GlobalAppShell>` as sole parent immediately inside page return and close it immediately after current top-level node.

Nested layout exact code:

```tsx
import{notFound}from'next/navigation';import type{ReactNode}from'react';import{ProjectAppShell}from'../../../../components/composites/ProjectAppShell';import{makeProjectIdentityViewModel}from'../../../../lib/frontend/view-model';import{getMyProject}from'../../../../server/domain/queries';
export default async function ProjectLayout({children,params}:{children:ReactNode;params:Promise<{projectId:string}>}){const{projectId}=await params;const project=await getMyProject(projectId);if(!project)notFound();return <ProjectAppShell project={makeProjectIdentityViewModel(project.id,project.title)}>{children}</ProjectAppShell>;}
```

- [ ] **Step 9: Green source/type/IDOR gate dan commit**

Run: `pnpm --dir apps/web exec vitest run src/app/m0-w05.test.ts src/app/frontend-foundation.contract.test.ts && pnpm --filter @narraza/web typecheck && pnpm arch`

Expected: PASS.

Run with services: `pnpm exec playwright test tests/e2e/idor.spec.ts --project=desktop`

Expected: PASS.

```bash
git add apps/web/src/components/composites/AppHeader.tsx apps/web/src/components/composites/GlobalAppShell.tsx apps/web/src/components/composites/ProjectAppShell.tsx apps/web/src/components/composites/ProjectSidebar.tsx apps/web/src/components/composites/ProjectNavigationDrawer.tsx apps/web/src/components/composites/MobileBottomNav.tsx apps/web/src/components/composites/MobileMoreControl.tsx apps/web/src/components/composites/MobileMoreSheet.tsx apps/web/src/components/composites/RouteAwareNavLink.tsx apps/web/src/app/app/layout.tsx apps/web/src/app/app/page.tsx apps/web/src/app/app/proyek/baru/page.tsx apps/web/src/app/app/proyek/'[projectId]'/layout.tsx apps/web/src/app/m0-w05.test.ts apps/web/src/app/frontend-foundation.contract.test.ts apps/web/src/messages/app-id.ts
git commit -m "feat(web): add distinct global and project shells"
```

### Task 8: Source, Architecture, Responsive E2E, dan Exact Screenshot Capture

**Files:** Modify `frontend-foundation.contract.test.ts`; create `tests/e2e/support/auth-session.ts`, `tests/e2e/frontend-foundation.spec.ts`.

**Interfaces:** E2E helper produces unique verified session/project. Test optionally writes exact evidence when `CAPTURE_PR1_EVIDENCE=1`.

- [ ] **Step 1: Tambah complete source contracts**

```ts
test('server boundaries and authored files avoid restricted contracts',()=>{for(const file of ['components/composites/GlobalAppShell.tsx','components/composites/ProjectAppShell.tsx','lib/frontend/capabilities.ts','lib/frontend/view-state.ts','lib/frontend/view-model.ts'])expect(source(file)).not.toContain("'use client'");const files=['components/primitives/Button.tsx','components/primitives/Input.tsx','components/composites/AppHeader.tsx','components/composites/ProjectSidebar.tsx','lib/frontend/view-model.ts'].map(source).join('\n');expect(files).not.toMatch(/#[0-9a-f]{3,8}|\b(?:pink|gray|neutral|red)-\d+/i);expect(source('lib/frontend/view-model.ts')).not.toMatch(/token|password|rawPayload|serviceRestricted|securityDetails|internalRationale|actionsEnabled/);expect(source('lib/frontend/capabilities.ts')).not.toMatch(/actionsEnabled|realData\s*\?\?|NEXT_PUBLIC/);});
test('logout remains direct form action',()=>{const header=source('components/composites/AppHeader.tsx');expect(header).toContain('<form action={logoutAction}>');expect(header).toContain('Keluar');expect(header).not.toContain('ConfirmationDialog');});
```

Run: `pnpm --dir apps/web exec vitest run src/app/frontend-foundation.contract.test.ts`

Expected: PASS after fixing only PR1 violations.

- [ ] **Step 2: Create exact reusable E2E helper**

```ts
// tests/e2e/support/auth-session.ts
import{randomUUID}from'node:crypto';import{expect,type Page,type TestInfo}from'@playwright/test';import{clearMailpit,waitForMailLink}from'../mailpit';
const mailpitApiUrl=process.env.MAILPIT_API_URL??'http://localhost:8026';const verifySubject='Verifikasi email Narraza-mu';const password='Narraza!Foundation123';
export async function createVerifiedSession(page:Page,testInfo:TestInfo):Promise<{email:string}>{const email=`foundation-${testInfo.project.name}-${randomUUID()}@example.test`;await clearMailpit(mailpitApiUrl);await page.goto('/daftar');await page.getByLabel('Alamat email').fill(email);await page.getByLabel('Kata sandi',{exact:true}).fill(password);await page.getByLabel('Ulangi kata sandi').fill(password);await page.getByRole('button',{name:'Buat akun'}).click();const link=await waitForMailLink({apiBaseUrl:mailpitApiUrl,recipient:email,subject:verifySubject});await page.goto(link);await page.getByRole('button',{name:'Verifikasi & masuk'}).click();await expect(page).toHaveURL(/\/app$/);return{email};}
export async function createOwnedProject(page:Page):Promise<{projectId:string;title:string}>{const title=`Project Foundation ${randomUUID()}`;await page.goto('/app/proyek/baru');await page.locator('input[name="title"]').fill(title);await page.locator('input[name="jalur"][value="rough_idea"]').check();await page.getByRole('button',{name:/Buat proyek/i}).click();await expect(page).toHaveURL(/\/app\/proyek\/(?!baru(?:\/|$))[^/?#]+$/);const match=page.url().match(/\/app\/proyek\/([^/?#]+)/);if(!match)throw new Error(`project id missing from URL: ${page.url()}`);return{projectId:match[1]!,title};}
```

Unique `randomUUID()` avoids account/title collisions; workers remain existing `1`.

- [ ] **Step 3: Create complete bounded E2E spec with exact capture function**

```ts
import{mkdir}from'node:fs/promises';import{resolve}from'node:path';import{expect,test,type Page}from'@playwright/test';import{createOwnedProject,createVerifiedSession}from'./support/auth-session';
const capture=process.env.CAPTURE_PR1_EVIDENCE==='1';const evidenceRoot=resolve(process.cwd(),'docs/review/frontend/pr1/screenshots');
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
async function shot(page:Page,name:string,width:number){if(!capture)return;await mkdir(evidenceRoot,{recursive:true});await page.screenshot({path:resolve(evidenceRoot,`${name}-${width}.png`),fullPage:true});}
async function set(page:Page,width:number){await page.setViewportSize({width,height:width<=768?900:1000});}
test('landing and auth responsive evidence',async({page},testInfo)=>{const widths=testInfo.project.name==='mobile'?[375,768]:[1280,1440];for(const width of widths){await set(page,width);await page.goto('/');await expect(page.getByRole('heading',{name:'Tulis serial panjang tanpa kehilangan arah.'})).toBeVisible();if(width<1024){const trigger=page.getByRole('button',{name:'Menu',exact:true});await expect(trigger).toBeVisible();await trigger.focus();await trigger.click();const dialog=page.getByRole('dialog',{name:'Navigasi utama mobile'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('link',{name:'Masuk',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();}else{await expect(page.getByRole('link',{name:'Masuk',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Menu',exact:true})).toBeHidden();}await noOverflow(page);await shot(page,'landing',width);await page.goto('/masuk');await expect(page.getByRole('heading',{name:'Masuk'})).toBeVisible();await expect(page.getByLabel('Alamat email')).toBeVisible();await noOverflow(page);await shot(page,'auth',width);}});
test('global and project shells plus distinct mobile sheet and tablet drawer',async({page},testInfo)=>{
  await createVerifiedSession(page,testInfo);const widths=testInfo.project.name==='mobile'?[375,768]:[1280,1440];
  for(const width of widths){await set(page,width);await page.goto('/app');await expect(page.getByTestId('global-shell')).toBeVisible();await noOverflow(page);await shot(page,'global-shell',width);}
  const project=await createOwnedProject(page);
  for(const width of widths){
    await set(page,width);await page.goto(`/app/proyek/${project.projectId}`);await expect(page.getByTestId('project-shell')).toContainText(project.title);
    if(width===375){
      await expect(page.getByRole('link',{name:'Beranda',exact:true})).toHaveAttribute('aria-current','page');await page.getByRole('link',{name:'Rencana',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/app/proyek/${project.projectId}/outline$`));await expect(page.getByRole('link',{name:'Rencana',exact:true})).toHaveAttribute('aria-current','page');
      const trigger=page.getByRole('button',{name:'Lainnya'});await trigger.focus();await trigger.click();const dialog=page.getByRole('dialog',{name:'Lainnya'});await expect(dialog).toBeVisible();await expect(page.getByRole('button',{name:'Tutup'})).toBeFocused();await expect(dialog.getByText('Naskah')).toBeVisible();await expect(dialog.getByText('Naskah')).not.toHaveAttribute('href');await expect(dialog.getByText('Kemampuan ini belum tersedia.').first()).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
    }else if(width===768){
      const trigger=page.getByRole('button',{name:'Menu proyek'});await expect(trigger).toBeVisible();await trigger.focus();await trigger.click();const drawer=page.getByRole('dialog',{name:'Navigasi proyek'});await expect(drawer).toBeVisible();await expect(page.getByRole('button',{name:'Tutup navigasi proyek'})).toBeFocused();await expect(drawer.getByRole('link',{name:'Beranda',exact:true})).toHaveAttribute('aria-current','page');await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.activeElement?.closest('dialog')?.id)).toBe('project-navigation-drawer');await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.closest('dialog')?.id)).toBe('project-navigation-drawer');await drawer.getByRole('link',{name:'Rencana Cerita',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/app/proyek/${project.projectId}/outline$`));await expect(drawer.getByRole('link',{name:'Rencana Cerita',exact:true})).toHaveAttribute('aria-current','page');await expect(drawer.getByText('Kemampuan ini belum tersedia.').first()).toBeVisible();await page.keyboard.press('Escape');await expect(drawer).toBeHidden();await expect(trigger).toBeFocused();await expect(page.getByRole('button',{name:'Lainnya'})).toBeVisible();
    }else{
      for(const group of ['PERSIAPAN','PERENCANAAN','PENULISAN','PEMERIKSAAN','PUBLIKASI','LAINNYA'])await expect(page.getByText(group,{exact:true})).toBeVisible();await page.getByRole('link',{name:'Chat Narra',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/app/proyek/${project.projectId}/chat$`));await expect(page.getByRole('link',{name:'Chat Narra',exact:true})).toHaveAttribute('aria-current','page');
    }
    await noOverflow(page);await shot(page,'project-shell',width);
  }
});
test('sheet remains usable with reduced motion',async({page},testInfo)=>{await page.emulateMedia({reducedMotion:'reduce'});await createVerifiedSession(page,testInfo);await set(page,375);await page.getByRole('button',{name:'Lainnya'}).click();await expect(page.getByRole('dialog',{name:'Lainnya'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Lainnya'})).toBeHidden();});
```

`ConfirmationDialog` tidak dites behavior karena tidak reachable. Source/API contract Task 3 cukup sampai high-risk consumer nyata.

- [ ] **Step 4: Run focused gates**

Run: `pnpm --dir apps/web exec vitest run src/components/foundation/token-inventory.test.ts src/components/primitives/primitives.contract.test.ts src/components/composites/dialog.contract.test.ts src/lib/frontend/capabilities.test.ts src/lib/frontend/view-state.test.ts src/lib/frontend/view-model.test.ts src/app/m0-w05.test.ts src/app/frontend-foundation.contract.test.ts`

Expected: PASS.

Run: `pnpm exec eslint apps/web/src tests/e2e/frontend-foundation.spec.ts tests/e2e/support/auth-session.ts --no-error-on-unmatched-pattern && pnpm --filter @narraza/web typecheck && pnpm arch`

Expected: exit 0.

Run with services: `pnpm exec playwright test tests/e2e/frontend-foundation.spec.ts`

Expected: PASS existing 375/1280 projects plus internal 768/1440 checks.

- [ ] **Step 5: Commit tests**

```bash
git add apps/web/src/app/frontend-foundation.contract.test.ts tests/e2e/support/auth-session.ts tests/e2e/frontend-foundation.spec.ts
git commit -m "test(web): enforce frontend foundation boundaries"
```

### Task 9: Evidence dan Final Pre-Push Gate

**Files:** Create evidence docs/screenshots/test outputs only.

**Interfaces:** Consumes actual HEAD/results. Produces reviewer evidence, bukan implementation claims.

- [ ] **Step 1: Create exact evidence docs**

`VISUAL-REFERENCE-INVENTORY.md` table columns `Surface | Reference | Classification | PR1 scope | Evidence`: landing REFERENCE FOUND; auth/global/project shell ADAPTED; capability notice/dialog/sheet NEW SYSTEM-ONLY COMPONENT; import/Panduan/beat INTENTIONAL DEVIATION. State dashboard/new-project/project M2 visual parity PR2; project `/tulis` PR3; chapter `/bab/[chapterId]/tulis` PR4.

`ROUTE-CAPABILITY-MATRIX.md` columns `Route pattern | Capability key | Primary action | Mode | Reason | Navigable in PR1 | Owner scope | PR dependency`; transcribe all 32 registry entries. Deferred metadata rows say `Navigable in PR1: no`.

`docs/review/frontend/pr1/README.md` records branch, capture HEAD, date, commands, local test data, viewport, redaction, classification, root-check disposition. Artifact status remains `pending capture` until file exists.

- [ ] **Step 2: Capture exact screenshot paths through dedicated E2E mode**

Run: `CAPTURE_PR1_EVIDENCE=1 pnpm exec playwright test tests/e2e/frontend-foundation.spec.ts`

Expected: PASS and exact 16 files:

```text
docs/review/frontend/pr1/screenshots/landing-{375,768,1280,1440}.png
docs/review/frontend/pr1/screenshots/auth-{375,768,1280,1440}.png
docs/review/frontend/pr1/screenshots/global-shell-{375,768,1280,1440}.png
docs/review/frontend/pr1/screenshots/project-shell-{375,768,1280,1440}.png
```

Inspect files for correct content, dimensions, no real email/story/secrets. Then update manifest to `captured at <HEAD SHA>`.

- [ ] **Step 3: Save focused outputs**

```bash
mkdir -p docs/review/frontend/pr1/test-output
pnpm --dir apps/web test > docs/review/frontend/pr1/test-output/web-unit.txt 2>&1
pnpm exec eslint apps/web/src tests/e2e/frontend-foundation.spec.ts tests/e2e/support/auth-session.ts --no-error-on-unmatched-pattern > docs/review/frontend/pr1/test-output/scoped-eslint.txt 2>&1
pnpm --filter @narraza/web typecheck > docs/review/frontend/pr1/test-output/typecheck.txt 2>&1
pnpm arch > docs/review/frontend/pr1/test-output/architecture.txt 2>&1
pnpm exec playwright test tests/e2e/auth.smoke.spec.ts > docs/review/frontend/pr1/test-output/auth-smoke.txt 2>&1
pnpm exec playwright test tests/e2e/idor.spec.ts > docs/review/frontend/pr1/test-output/idor.txt 2>&1
pnpm exec playwright test tests/e2e/frontend-foundation.spec.ts > docs/review/frontend/pr1/test-output/frontend-foundation.txt 2>&1
pnpm lint > docs/review/frontend/pr1/test-output/root-lint.txt 2>&1
pnpm format:check > docs/review/frontend/pr1/test-output/root-format-check.txt 2>&1
pnpm typecheck > docs/review/frontend/pr1/test-output/root-typecheck.txt 2>&1
```

Expected: record actual exit/result. Isolated worktree has no nested `.worktrees` siblings, so root checks may pass. If a command fails, preserve output, classify baseline versus PR1 regression, fix only PR1 regression, rerun. Never run primary checkout.

- [ ] **Step 4: Run full final pre-push gate**

```bash
pnpm format:check
pnpm --filter @narraza/web typecheck
pnpm typecheck
pnpm --dir apps/web test
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:tooling
pnpm arch
pnpm migration:expand-only
pnpm migration:empty
pnpm migration:upgrade
pnpm migration:drift
pnpm build
pnpm security:env-boundary
pnpm security:client-bundle
pnpm e2e
pnpm exec eslint apps/web/src tests/e2e/frontend-foundation.spec.ts tests/e2e/support/auth-session.ts --no-error-on-unmatched-pattern
pnpm lint
```

Expected: PR1 scoped checks PASS. Record actual root dispositions. Map results to exact eight CI names. `security:client-bundle` runs after build.

- [ ] **Step 5: Audit exact approved-base diff and forbidden scope**

```bash
git status --short
git diff --name-only c5912631f2e3244894705dc30f36f8de4d0f982d...HEAD
git diff --check c5912631f2e3244894705dc30f36f8de4d0f982d...HEAD
find apps/web/src/app/app/proyek/'[projectId]'/tulis apps/web/src/app/app/proyek/'[projectId]'/bab/'[chapterId]'/tulis -type f 2>/dev/null
```

Expected: final `find` no files; no package/lock, auth/server/domain, packages, Prisma/migration, worker/job/ledger/AI, workflow/config, Playwright config, or final parity report changes. Diff contains spec commit, plan commit, then implementation commits; do not assume `HEAD~N`.

Scan authored files:

```bash
python - <<'PY'
from pathlib import Path
needles=['/'+'* ','TO'+'DO','TB'+'D','similar'+' to','existing'+'DashboardMain','existing'+'CreateProjectMain','reuse'+' real','copy'+' helper','actions'+'Enabled','realData'+' ??','NEXT'+'_PUBLIC']
roots=[Path('apps/web/src'),Path('tests/e2e/frontend-foundation.spec.ts'),Path('tests/e2e/support/auth-session.ts'),Path('docs/frontend'),Path('docs/review/frontend/pr1')]
found=[]
for root in roots:
    files=root.rglob('*') if root.is_dir() else [root]
    for file in files:
        if file.is_file() and file.suffix in {'.ts','.tsx','.md'}:
            text=file.read_text(encoding='utf-8')
            found.extend((str(file),needle) for needle in needles if needle in text)
if found: raise SystemExit('\n'.join(f'{file}: {needle}' for file,needle in found))
PY
```

Expected: exit 0; no implementation placeholders/forbidden fixture patterns. Existing explanatory comments outside authored PR1 paths are not scanned.

- [ ] **Step 6: Commit evidence**

```bash
git add docs/frontend/VISUAL-REFERENCE-INVENTORY.md docs/frontend/ROUTE-CAPABILITY-MATRIX.md docs/review/frontend/pr1/README.md docs/review/frontend/pr1/screenshots docs/review/frontend/pr1/test-output
git commit -m "docs(web): record PR1 frontend evidence"
```

- [ ] **Step 7: Final log/tree check**

Run: `git status --short && git log --oneline c5912631f2e3244894705dc30f36f8de4d0f982d..HEAD`

Expected: clean tree. Log includes plan commit made before execution plus nine implementation boundaries from Tasks 1–9. Spec commit `c591263` is range base, not counted as implementation. Do not push before review accepts evidence/root dispositions.

- [ ] **Step 8: Prove primary checkout dirty baseline remained byte-identical**

Jalankan read-only commands dari worktree; jangan `cd` ke primary, jangan menjalankan lint/build/test di primary, dan jangan menulis file primary:

```bash
PRIMARY='D:/Coding/Narraza Fix/Narraza v3'
EXPECTED_STATUS=$(cat <<'EOF'
 M packages/core/package.json
 M packages/core/tsconfig.json
 M pnpm-lock.yaml
?? docs/PROGRESS-CHECKLIST.local-backup.md
EOF
)
ACTUAL_STATUS=$(git -C "$PRIMARY" status --short)
printf '%s\n' "$ACTUAL_STATUS"
test "$ACTUAL_STATUS" = "$EXPECTED_STATUS"
test "$(git -C "$PRIMARY" hash-object packages/core/package.json)" = b1da2d362e03c479072429127dd87a9e4a05e878
test "$(git -C "$PRIMARY" hash-object packages/core/tsconfig.json)" = 4b4b1bbe1ea8708d592a9e1027f4bdd2e0dfb2fd
test "$(git -C "$PRIMARY" hash-object pnpm-lock.yaml)" = f799ac600f5f1a1131abeb378e785e182021cf60
test "$(git -C "$PRIMARY" hash-object docs/PROGRESS-CHECKLIST.local-backup.md)" = a97dd58ccacd519f7da941709f6412bff47d9275
```

Expected: printed status exactly matches four recorded dirty paths and every `test` exits 0. Any mismatch means stop and report primary baseline changed; do not repair, reset, checkout, clean, stash, or otherwise alter primary.

## PR1 Definition of Done

- [ ] Runtime tokens defined exactly; TypeScript inventory names-only; font build passes.
- [ ] Only PR1-consumed primitives exist; deferred primitives remain absent.
- [ ] Badge status and Chip action semantics differ.
- [ ] Native hook avoids close recursion and restores focus; reachable MobileMoreSheet passes focus/Escape/reduced-motion browser checks.
- [ ] ConfirmationDialog has source/API accessibility contract and is not wired to logout.
- [ ] Logout remains direct server form/button interaction.
- [ ] Complete 32-entry capability declaration registry is keyed by `CapabilityKey`; protected actions require separate server-derived effective state, fail closed without it, `allowed:false + AVAILABLE` throws, and deferred metadata creates no routes/hrefs.
- [ ] Capability notices render `Pratinjau fitur`/`Segera tersedia`, never implementation enum values `PRESENTATION`/`DISABLED`.
- [ ] Exact state axes and recoverability compile; no combined client state machine.
- [ ] ViewModels are small compile-time contracts; source contracts reject restricted field names in public types.
- [ ] Landing desktop header renders four anchors (`Cara kerja`, `Fitur`, `Untuk siapa`, `Kredit`); below 1024 mobile `Menu` dialog exposes `Masuk`, closes with `Escape`, becomes hidden, and restores focus; canonical sections render exact 3 problem cards → 6 workflow steps → 6 feature cards → 4 persona cards → 3 credit tiers plus disclosure → final CTA → footer, `Seimbang` is emphasized with `Disarankan`, additive trust/FAQ stays between credit and final CTA, and no internal milestone copy appears.
- [ ] Auth actions/selectors/`useActionState`/pending/redirect semantics remain; existing characterization passes before edits, separate resend guard fails before and passes after `useFormStatus`; real auth smoke passes.
- [ ] Exactly one app-layout `getCurrentUser()`, `redirect('/masuk')`, direct `logoutAction` remain.
- [ ] Global/project shells differ; project identity uses owner-scoped existing query and `notFound()`.
- [ ] Desktop exact six groups, tablet 768 distinct project drawer, dan mobile exact five tabs render; unavailable items have no href/no-op handler and show visible reason captions.
- [ ] Existing M2 pages are wrapped, not visually refactored; IDOR passes.
- [ ] Project `/tulis` remains absent for PR3; chapter `/bab/[chapterId]/tulis` remains absent for PR4.
- [ ] Source/unit/contract/architecture/E2E checks pass without weakened tests or root contract suite changes.
- [ ] Exact 375/768/1280/1440 visual evidence exists for landing/auth/global/project shell.
- [ ] Evidence docs complete; final `DESIGN-PARITY-REPORT.md` remains PR4.
- [ ] Root/scoped check outcomes reported honestly from isolated worktree; primary checkout exact four dirty paths and recorded `git hash-object` values remain unchanged.
- [ ] No package, route fabrication, fake success/progress/credit/autosave, fixture fallback, analytics, server/domain/DB/worker/AI change.

## Plan Self-Review Appendix

| PR1 spec acceptance | Implementing task | Verification | Gap |
|---|---:|---|---|
| Token categories and dependency direction tested | 1, 2, 8 | token tests, primitive source test, `pnpm arch` | None |
| Server Component default; client boundaries narrow | 2, 3, 7, 8 | source contracts; dialog, mobile open-state control, and pathname link leaf only | None |
| Static declarations cannot enable protected actions; effective state is server-derived | 4 | declaration/effective separation tests, invalid `allowed:false + AVAILABLE` test; 32 typed keys | None |
| Typed capability keys drive navigation, visible reasons, user-facing notices, and tests | 4, 7, 8 | exhaustive registry test plus rendered-navigation-only source contracts | None |
| Landing parity preserves exact source assertions | 5 | four desktop anchors, accessible mobile menu, ordered section source test, Playwright four widths | None |
| Auth visual parity preserves semantics/selectors and resend duplicate guard | 6, 8 | existing characterization green, separate resend guard red then green with `useFormStatus`, real auth smoke | None |
| Exactly one app auth guard and redirect | 7, 8 | source assertion | None |
| Direct real logout preserved | 7, 8 | source assertion and existing auth smoke | None |
| Global/project shells semantically distinct | 7, 8 | test IDs, nested owner read, E2E | None |
| Desktop six groups/tablet drawer/mobile five tabs; `Tutup Bab` stays contextual and absent | 7, 8 | broad rendered-source-only `m0-w05` assertions and browser checks | None |
| Active navigation is pathname-authoritative with `aria-current` | 7, 8 | narrow `RouteAwareNavLink` source contract and 768 drawer navigation E2E | None |
| Dialog/sheet/drawer accessibility | 3, 7, 8 | source/API contract; reachable sheet and 768 drawer focus/Escape/restoration browser behavior | None; confirmation behavior intentionally waits for real consumer |
| Exact orthogonal state types | 4 | exact equality test | None |
| Small serializable ViewModel contracts | 4, 8 | readonly scalar models and restricted-name source contract | None |
| M2 and IDOR unchanged | 7, 8 | wrapper-only edits, existing IDOR E2E | None |
| 375/768/1280/1440 responsive coverage | 8, 9 | bounded Playwright and exact screenshot output | None |
| Source/unit/contract/architecture/E2E checks | 8, 9 | focused and full gates | None |
| Visual evidence exact paths | 8, 9 | `CAPTURE_PR1_EVIDENCE=1` writer | None |
| Project `/tulis` deferred PR3 and chapter write deferred PR4 | 4, 8, 9 | absence source contract and approved-base diff | None |
| Root lint baseline not hidden or fixed | 9 | isolated-worktree output, README disposition, exact primary status and four hash comparisons | None |
| Final parity report deferred PR4 | 9 | forbidden-scope audit | None |

Self-review execution before implementation handoff:

```bash
PLAN=docs/superpowers/plans/2026-08-11-frontend-foundation-pr1.md
python - "$PLAN" <<'PY'
from pathlib import Path
import sys
text=Path(sys.argv[1]).read_text(encoding='utf-8')
needles=['/'+'* ','TO'+'DO','TB'+'D','similar'+' to','existing'+'DashboardMain','existing'+'CreateProjectMain','reuse'+' real','copy'+' helper']
found=[needle for needle in needles if needle in text]
if found: raise SystemExit('\n'.join(found))
PY
rg -n 'completeVerificationAction|completeResetAction|resendVerificationAction|logoutAction|ProjectIdentityViewModel|ShellAccountViewModel|CapabilityNoticeViewModel' "$PLAN"
pnpm exec prettier --check "$PLAN"
git diff --check -- "$PLAN"
```

Expected: placeholder scan exits 0; symbol scan shows consistent definitions/usages; Prettier and diff checks pass. Coverage table gaps all `None`.

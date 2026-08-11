export const CAPABILITY_KEYS = [
  'landing.view',
  'auth.login',
  'auth.register',
  'auth.password-reset',
  'auth.verification',
  'legal.privacy',
  'legal.terms',
  'app.dashboard.view',
  'app.project.create',
  'app.project.import',
  'app.credit.view',
  'app.settings.view',
  'project.home.view',
  'project.chat.user-message',
  'project.chat.ai-reply',
  'project.concept.choose',
  'project.foundation.manage',
  'project.characters.read',
  'project.outline.create',
  'project.secrets.read',
  'project.facts.read',
  'project.write.resume',
  'project.manuscript.view',
  'project.publish.view',
  'chapter.write.compose',
  'chapter.check.run',
  'chapter.complete.run',
  'chapter.manuscript.view',
  'chapter.publish.build',
  'shell.logout',
  'shell.project-navigation',
  'shell.mobile-more',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type CapabilityMode = 'REAL' | 'PRESENTATION' | 'DISABLED';
export type CapabilityReasonCode =
  | 'AVAILABLE'
  | 'BACKEND_NOT_AVAILABLE'
  | 'PREREQUISITE_MISSING'
  | 'IMPORT_OUT_OF_SCOPE'
  | 'PROJECT_CONTEXT_REQUIRED'
  | 'CHAPTER_CONTEXT_REQUIRED'
  | 'PROJECT_NOT_FOUND'
  | 'CHAPTER_NOT_FOUND'
  | 'CHAPTER_NOT_IN_PROJECT'
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'FOUNDATION_NOT_LOCKED'
  | 'ACCEPTED_PROSE_REQUIRED'
  | 'VALIDATION_REQUIRED'
  | 'JOB_ACTIVE'
  | 'PREVIEW_DISABLED';

export type CapabilityDeclaration = Readonly<{
  key: CapabilityKey;
  mode: CapabilityMode;
  reasonCode: CapabilityReasonCode;
  actionPolicy: 'STATIC_AVAILABLE' | 'SERVER_DERIVED' | 'UNAVAILABLE';
  primaryAction: Readonly<{ label: string }>;
}>;
export type ServerCapabilityDecision = Readonly<{
  allowed: boolean;
  reasonCode: CapabilityReasonCode;
}>;
export type EffectiveCapability = Readonly<{
  key: CapabilityKey;
  mode: CapabilityMode;
  reasonCode: CapabilityReasonCode;
  primaryAction: Readonly<{ label: string; enabled: boolean }>;
}>;

export const CAPABILITY_REASON_MESSAGES: Record<CapabilityReasonCode, string> = {
  AVAILABLE: 'Tersedia.',
  BACKEND_NOT_AVAILABLE: 'Kemampuan ini belum tersedia.',
  PREREQUISITE_MISSING: 'Selesaikan langkah sebelumnya dahulu.',
  IMPORT_OUT_OF_SCOPE: 'Impor draft belum tersedia pada rilis ini.',
  PROJECT_CONTEXT_REQUIRED: 'Pilih proyek untuk melanjutkan.',
  CHAPTER_CONTEXT_REQUIRED: 'Pilih bab yang valid untuk melanjutkan.',
  PROJECT_NOT_FOUND: 'Proyek tidak ditemukan.',
  CHAPTER_NOT_FOUND: 'Bab tidak ditemukan.',
  CHAPTER_NOT_IN_PROJECT: 'Bab tidak ditemukan pada proyek ini.',
  NOT_AUTHENTICATED: 'Masuk untuk melanjutkan.',
  NOT_AUTHORIZED: 'Halaman tidak ditemukan.',
  FOUNDATION_NOT_LOCKED: 'Kunci fondasi sebelum melanjutkan.',
  ACCEPTED_PROSE_REQUIRED: 'Terima versi tulisan sebelum melanjutkan.',
  VALIDATION_REQUIRED: 'Jalankan cek cerita sebelum melanjutkan.',
  JOB_ACTIVE: 'Proses sebelumnya masih berjalan.',
  PREVIEW_DISABLED: 'Preview tidak tersedia.',
};

function declare(
  key: CapabilityKey,
  label: string,
  mode: CapabilityMode,
  reasonCode: CapabilityReasonCode,
  actionPolicy: CapabilityDeclaration['actionPolicy'],
): CapabilityDeclaration {
  return Object.freeze({
    key,
    mode,
    reasonCode,
    actionPolicy,
    primaryAction: Object.freeze({ label }),
  });
}

const staticAvailable = (key: CapabilityKey, label: string) =>
  declare(key, label, 'REAL', 'AVAILABLE', 'STATIC_AVAILABLE');
const serverDerived = (key: CapabilityKey, label: string) =>
  declare(key, label, 'REAL', 'PREREQUISITE_MISSING', 'SERVER_DERIVED');
const presentation = (
  key: CapabilityKey,
  label: string,
  reasonCode: CapabilityReasonCode = 'BACKEND_NOT_AVAILABLE',
) => declare(key, label, 'PRESENTATION', reasonCode, 'UNAVAILABLE');
const disabled = (key: CapabilityKey, label: string, reasonCode: CapabilityReasonCode) =>
  declare(key, label, 'DISABLED', reasonCode, 'UNAVAILABLE');

export function deriveEffectiveCapability(
  declaration: CapabilityDeclaration,
  decision: ServerCapabilityDecision,
): EffectiveCapability {
  const enabled = decision.allowed;
  if (declaration.actionPolicy !== 'SERVER_DERIVED') {
    throw new Error('Only SERVER_DERIVED capability accepts a server decision');
  }
  if (enabled && declaration.mode !== 'REAL') {
    throw new Error('Only REAL capability can derive an enabled primary action');
  }
  if (enabled && decision.reasonCode !== 'AVAILABLE') {
    throw new Error('Enabled primary action requires AVAILABLE reason');
  }
  if (!enabled && decision.reasonCode === 'AVAILABLE') {
    throw new Error('Disabled primary action requires an unavailable reason');
  }
  return Object.freeze({
    key: declaration.key,
    mode: declaration.mode,
    reasonCode: decision.reasonCode,
    primaryAction: Object.freeze({ label: declaration.primaryAction.label, enabled }),
  });
}

export const CAPABILITIES = {
  'landing.view': staticAvailable('landing.view', 'Mulai dari ide'),
  'auth.login': staticAvailable('auth.login', 'Masuk'),
  'auth.register': staticAvailable('auth.register', 'Buat akun'),
  'auth.password-reset': staticAvailable('auth.password-reset', 'Simpan kata sandi baru'),
  'auth.verification': staticAvailable('auth.verification', 'Verifikasi & masuk'),
  'legal.privacy': staticAvailable('legal.privacy', 'Baca Kebijakan Privasi'),
  'legal.terms': staticAvailable('legal.terms', 'Baca Ketentuan Layanan'),
  'app.dashboard.view': serverDerived('app.dashboard.view', 'Buat proyek'),
  'app.project.create': serverDerived('app.project.create', 'Buat proyek'),
  'app.project.import': disabled('app.project.import', 'Impor draft', 'IMPORT_OUT_OF_SCOPE'),
  'app.credit.view': presentation('app.credit.view', 'Lihat penggunaan'),
  'app.settings.view': presentation('app.settings.view', 'Buka pengaturan'),
  'project.home.view': serverDerived('project.home.view', 'Lihat proyek'),
  'project.chat.user-message': serverDerived('project.chat.user-message', 'Kirim pesan'),
  'project.chat.ai-reply': disabled(
    'project.chat.ai-reply',
    'Minta balasan Narra',
    'BACKEND_NOT_AVAILABLE',
  ),
  'project.concept.choose': presentation('project.concept.choose', 'Pilih konsep'),
  'project.foundation.manage': serverDerived('project.foundation.manage', 'Simpan fondasi'),
  'project.characters.read': serverDerived('project.characters.read', 'Lihat karakter'),
  'project.outline.create': serverDerived('project.outline.create', 'Buat rencana'),
  'project.secrets.read': serverDerived('project.secrets.read', 'Lihat jadwal'),
  'project.facts.read': serverDerived('project.facts.read', 'Lihat fakta'),
  'project.write.resume': presentation(
    'project.write.resume',
    'Lanjut menulis',
    'CHAPTER_CONTEXT_REQUIRED',
  ),
  'project.manuscript.view': presentation('project.manuscript.view', 'Lihat naskah'),
  'project.publish.view': presentation('project.publish.view', 'Lihat paket publish'),
  'chapter.write.compose': presentation('chapter.write.compose', 'Tulis bab'),
  'chapter.check.run': presentation('chapter.check.run', 'Cek cerita', 'VALIDATION_REQUIRED'),
  'chapter.complete.run': presentation(
    'chapter.complete.run',
    'Selesaikan bab',
    'VALIDATION_REQUIRED',
  ),
  'chapter.manuscript.view': presentation(
    'chapter.manuscript.view',
    'Baca naskah',
    'ACCEPTED_PROSE_REQUIRED',
  ),
  'chapter.publish.build': presentation(
    'chapter.publish.build',
    'Siapkan paket publish',
    'ACCEPTED_PROSE_REQUIRED',
  ),
  'shell.logout': serverDerived('shell.logout', 'Keluar'),
  'shell.project-navigation': serverDerived('shell.project-navigation', 'Buka proyek'),
  'shell.mobile-more': serverDerived('shell.mobile-more', 'Lainnya'),
} as const satisfies Record<CapabilityKey, CapabilityDeclaration>;

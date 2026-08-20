import 'server-only';

export const PREVIEW_PRESENTATION_FIXTURES = Object.freeze({
  'kredit-unavailable': Object.freeze({
    kind: 'kredit' as const,
  }),
  'tulis-choose': Object.freeze({
    kind: 'tulis' as const,
    projectTitle: 'Novel Contoh',
    state: 'choose' as const,
    choices: Object.freeze([
      Object.freeze({ title: 'Pertemuan di Stasiun', ordinal: 1 }),
      Object.freeze({ title: 'Surat yang Tertinggal', ordinal: 2 }),
    ]),
  }),
  'tulis-outline-required': Object.freeze({
    kind: 'tulis' as const,
    projectTitle: 'Novel Contoh',
    state: 'OUTLINE_REQUIRED' as const,
  }),
  'tulis-no-chapter': Object.freeze({
    kind: 'tulis' as const,
    projectTitle: 'Novel Contoh',
    state: 'NO_CHAPTER_AVAILABLE' as const,
  }),
} as const);

export type PreviewPresentationFixture =
  (typeof PREVIEW_PRESENTATION_FIXTURES)[keyof typeof PREVIEW_PRESENTATION_FIXTURES];

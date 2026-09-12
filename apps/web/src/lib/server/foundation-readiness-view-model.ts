import 'server-only';

import {
  calculateFoundationReadiness,
  toReadinessInput,
  type FoundationReadinessKey,
  type JsonObject,
} from '@narraza/application';

const READINESS_LABELS: Readonly<Record<FoundationReadinessKey, string>> = Object.freeze({
  core_concept: 'Konsep inti',
  main_character: 'Karakter utama',
  main_relationship: 'Relasi utama',
  conflict: 'Konflik sentral',
  ending_direction: 'Arah akhir',
  reader_promise: 'Janji kepada pembaca',
  character_address: 'Sapaan karakter',
  speech_style: 'Gaya bicara',
  secret_schedule: 'Jadwal rahasia',
});

type FoundationReadinessChecklistViewModel = Readonly<{
  key: FoundationReadinessKey;
  label: string;
  weight: number;
  earned: number;
  complete: boolean;
}>;

export type FoundationReadinessViewModel =
  | Readonly<{
      available: true;
      percent: number;
      checklist: readonly FoundationReadinessChecklistViewModel[];
      recommendation: string;
    }>
  | Readonly<{
      available: false;
      message: string;
    }>;

export function makeFoundationReadinessViewModel(
  payload: JsonObject | null,
): FoundationReadinessViewModel {
  if (payload === null) {
    return Object.freeze({
      available: false,
      message: 'Kesiapan akan dihitung setelah draft fondasi tersedia.',
    });
  }

  try {
    const result = calculateFoundationReadiness(toReadinessInput(payload));
    const checklist = Object.freeze(
      result.checklist.map((item) =>
        Object.freeze({
          key: item.key,
          label: READINESS_LABELS[item.key],
          weight: item.weight,
          earned: item.earned,
          complete: item.complete,
        }),
      ),
    );
    const recommendation =
      result.nextRecommendation === null
        ? 'Semua unsur kesiapan terpenuhi. Tinjau fondasi sebelum menguncinya.'
        : `Lengkapi berikutnya: ${READINESS_LABELS[result.nextRecommendation]}.`;

    return Object.freeze({
      available: true,
      percent: result.percent,
      checklist,
      recommendation,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'INVALID_FOUNDATION_READINESS_INPUT'
    ) {
      return Object.freeze({
        available: false,
        message: 'Kesiapan belum dapat dihitung karena data fondasi perlu diperbaiki.',
      });
    }
    throw error;
  }
}

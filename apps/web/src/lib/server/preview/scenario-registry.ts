import 'server-only';

export const PREVIEW_SCENARIOS = Object.freeze({
  'kredit-unavailable': Object.freeze({ key: 'kredit-unavailable', scope: 'account' }),
  'tulis-choose': Object.freeze({ key: 'tulis-choose', scope: 'project' }),
  'tulis-outline-required': Object.freeze({ key: 'tulis-outline-required', scope: 'project' }),
  'tulis-no-chapter': Object.freeze({ key: 'tulis-no-chapter', scope: 'project' }),
} as const);

export type PreviewScenarioKey = keyof typeof PREVIEW_SCENARIOS;
export type PreviewScenario = (typeof PREVIEW_SCENARIOS)[PreviewScenarioKey];

export function getPreviewScenario(value: string): PreviewScenario | null {
  if (!Object.prototype.hasOwnProperty.call(PREVIEW_SCENARIOS, value)) return null;
  return PREVIEW_SCENARIOS[value as PreviewScenarioKey];
}

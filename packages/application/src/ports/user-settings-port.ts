/** User-facing experience mode (D3): exactly two modes, no third. */
export type UiMode = 'pemula' | 'mahir';

export interface UserSettingsPort {
  /** Persists the caller's own experience mode. Tenant-safe by construction. */
  updateUiMode(userId: string, mode: UiMode): Promise<{ readonly uiMode: UiMode }>;
}

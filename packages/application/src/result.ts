/**
 * Result type for use cases. Use cases never throw domain errors across their
 * boundary — they return Ok | Err so Server Actions can map to a Result<T,
 * PublicError> without leaking internals (§3.2).
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

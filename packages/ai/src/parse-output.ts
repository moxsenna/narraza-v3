import type { ZodType } from 'zod';

/**
 * Strict-schema output parsing (S5.3, Block C).
 *
 * Model output is only ever accepted through a `.strict()` zod contract: no
 * additional keys, no coercions, no silent defaults. A parse failure is DATA
 * returned to the orchestrator — it drives the parse-repair stage — and is
 * never retried inside the parser.
 */

export type ParseOutcome<T> =
  | { readonly kind: 'parsed'; readonly value: T }
  | { readonly kind: 'parse_failed'; readonly errorCode: ParseErrorCode };

export type ParseErrorCode = 'empty_output' | 'malformed_json' | 'schema_violation';

export function parseOutput<T>(schema: ZodType<T>, rawBody: string): ParseOutcome<T> {
  const trimmed = rawBody.trim();
  if (trimmed === '') return { kind: 'parse_failed', errorCode: 'empty_output' };

  let candidate: unknown;
  try {
    candidate = JSON.parse(trimmed);
  } catch {
    return { kind: 'parse_failed', errorCode: 'malformed_json' };
  }

  const result = schema.safeParse(candidate);
  if (!result.success) {
    return { kind: 'parse_failed', errorCode: 'schema_violation' };
  }
  return { kind: 'parsed', value: result.data };
}

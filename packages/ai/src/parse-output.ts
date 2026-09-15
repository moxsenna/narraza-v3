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

  // Gateway-mapped models may ignore response_format=json_object and wrap an
  // otherwise valid document in a single markdown fence (observed live:
  // ```json {...} ```). Unwrap exactly one fence pair, then validate strictly
  // as before — never extract JSON from mid-prose, never coerce the schema.
  const unfenced = extractFencedDocument(trimmed) ?? trimmed;

  let candidate: unknown;
  try {
    candidate = JSON.parse(unfenced);
  } catch {
    return { kind: 'parse_failed', errorCode: 'malformed_json' };
  }

  const result = schema.safeParse(candidate);
  if (!result.success) {
    return { kind: 'parse_failed', errorCode: 'schema_violation' };
  }
  return { kind: 'parsed', value: result.data };
}

function extractFencedDocument(trimmed: string): string | null {
  const lines = trimmed.split('\n');
  const first = lines[0].trim().toLowerCase();
  if (first !== '```json' && first !== '```') return null;
  const last = lines[lines.length - 1].trim();
  if (last !== '```' || lines.length < 3) return null;
  return lines.slice(1, -1).join('\n');
}

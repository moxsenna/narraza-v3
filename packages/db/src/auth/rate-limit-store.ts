import type { RateLimitStore } from '@narraza/application';
import type { PrismaClient } from '../client.js';

/**
 * Atomic rate limiting on the rate_limit_counters table (D10/D21).
 *
 * Windowed counters use a bucket boundary computed from the DB clock via
 * date_bin, so all skew is the database's. The atomic upsert (ON CONFLICT DO
 * UPDATE ... RETURNING count) means concurrent increments can't lose a count.
 *
 * Markers (cooldown/lockout) reuse the same table with a fixed sentinel window
 * (unix epoch) so there is exactly one marker row per (kind, key); the marker's
 * meaning is entirely in expires_at.
 */
const MARKER_WINDOW = new Date(0);

export function createRateLimitStore(prisma: PrismaClient): RateLimitStore {
  return {
    async increment({ kind, key, windowSeconds }) {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_counters (id, kind, key_hash, window_starts_at, count, expires_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${kind},
          ${key},
          date_bin(make_interval(secs => ${windowSeconds}::int), now(), 'epoch'::timestamptz),
          1,
          date_bin(make_interval(secs => ${windowSeconds}::int), now(), 'epoch'::timestamptz)
            + make_interval(secs => ${windowSeconds}::int),
          now()
        )
        ON CONFLICT (kind, key_hash, window_starts_at)
        DO UPDATE SET count = rate_limit_counters.count + 1, updated_at = now()
        RETURNING count`;
      return Number(rows[0]?.count ?? 0);
    },

    async count({ kind, key, windowSeconds }) {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count FROM rate_limit_counters
         WHERE kind = ${kind}
           AND key_hash = ${key}
           AND window_starts_at = date_bin(make_interval(secs => ${windowSeconds}::int), now(), 'epoch'::timestamptz)`;
      return Number(rows[0]?.count ?? 0);
    },

    async setMarker({ kind, key, ttlSeconds }) {
      await prisma.$executeRaw`
        INSERT INTO rate_limit_counters (id, kind, key_hash, window_starts_at, count, expires_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${kind},
          ${key},
          ${MARKER_WINDOW},
          0,
          now() + make_interval(secs => ${ttlSeconds}::int),
          now()
        )
        ON CONFLICT (kind, key_hash, window_starts_at)
        DO UPDATE SET expires_at = now() + make_interval(secs => ${ttlSeconds}::int), updated_at = now()`;
    },

    async markerActive({ kind, key }) {
      const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
        SELECT (expires_at > now()) AS ok
          FROM rate_limit_counters
         WHERE kind = ${kind}
           AND key_hash = ${key}
           AND window_starts_at = ${MARKER_WINDOW}`;
      return rows[0]?.ok === true;
    },

    async clearMarkers({ kind, key }) {
      await prisma.$executeRaw`
        DELETE FROM rate_limit_counters
         WHERE kind = ${kind}
           AND key_hash = ${key}
           AND window_starts_at = ${MARKER_WINDOW}`;
    },
  };
}

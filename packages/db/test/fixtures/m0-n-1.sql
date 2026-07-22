-- Fixed-time N-1 fixture. Requires only 20260721181246_init_m0_auth.
INSERT INTO "users" (
  "id", "email", "password_hash", "status", "email_verified_at", "ui_mode", "tier", "created_at", "updated_at"
) VALUES
  ('m0-user-pending', 'pending@m0.narraza.test', 'hashed:m0-pending', 'pending_verification', NULL, 'pemula', 'hemat', '2026-07-21T10:00:00.000Z', '2026-07-21T10:00:00.000Z'),
  ('m0-user-active', 'active@m0.narraza.test', 'hashed:m0-active', 'active', '2026-07-21T10:01:00.000Z', 'mahir', 'terbaik', '2026-07-21T10:01:00.000Z', '2026-07-21T10:02:00.000Z');

INSERT INTO "sessions" (
  "id", "session_token", "user_id", "expires_at", "absolute_expires_at", "last_active_at", "revoked_at", "created_at"
) VALUES
  ('m0-session-active', 'm0-session-token-active', 'm0-user-active', '2026-08-01T10:00:00.000Z', '2026-08-21T10:00:00.000Z', '2026-07-21T10:03:00.000Z', NULL, '2026-07-21T10:02:00.000Z'),
  ('m0-session-revoked', 'm0-session-token-revoked', 'm0-user-pending', '2026-08-01T10:00:00.000Z', '2026-08-21T10:00:00.000Z', '2026-07-21T10:04:00.000Z', '2026-07-21T10:05:00.000Z', '2026-07-21T10:02:00.000Z');

INSERT INTO "email_action_tokens" (
  "id", "user_id", "purpose", "token_hash", "expires_at", "consumed_at", "revoked_at", "created_at"
) VALUES
  ('m0-token-verify-active', 'm0-user-pending', 'verify_email', 'm0-hash-verify-active', '2026-08-01T11:00:00.000Z', NULL, NULL, '2026-07-21T11:00:00.000Z'),
  ('m0-token-verify-consumed', 'm0-user-active', 'verify_email', 'm0-hash-verify-consumed', '2026-08-01T11:00:00.000Z', '2026-07-21T11:05:00.000Z', NULL, '2026-07-21T11:00:00.000Z'),
  ('m0-token-reset-active', 'm0-user-active', 'reset_password', 'm0-hash-reset-active', '2026-08-01T11:00:00.000Z', NULL, NULL, '2026-07-21T11:00:00.000Z'),
  ('m0-token-reset-revoked', 'm0-user-active', 'reset_password', 'm0-hash-reset-revoked', '2026-08-01T11:00:00.000Z', NULL, '2026-07-21T11:06:00.000Z', '2026-07-21T11:00:00.000Z');

INSERT INTO "rate_limit_counters" (
  "id", "kind", "key_hash", "window_starts_at", "count", "expires_at", "updated_at"
) VALUES (
  'm0-rate-counter', 'login', 'm0-rate-key-hash', '2026-07-21T12:00:00.000Z', 3, '2026-07-21T12:15:00.000Z', '2026-07-21T12:03:00.000Z'
);

INSERT INTO "audit_events" (
  "id", "user_id", "action", "entity_type", "entity_id", "metadata", "created_at"
) VALUES (
  'm0-audit-event', 'm0-user-active', 'auth.login', 'user', 'm0-user-active', '{"ipClass":"test","result":"success"}'::jsonb, '2026-07-21T12:04:00.000Z'
);

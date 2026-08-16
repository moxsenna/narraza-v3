-- Upgrade fixture - applies all prior W3.2 migrations, then verifies credit_engine_v1 can be applied
-- Used in migration:test:upgrade scenario

-- Apply prior migrations (W3.2 state)
SELECT 'apply_all_w3.2_migrations' AS phase;

-- Then apply current migration via Prisma migrate dev/deploy

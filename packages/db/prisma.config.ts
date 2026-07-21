import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI runs with cwd = packages/db; schema + migrations live at repo root
// (§3.1). DATABASE_URL comes from the root .env (CLI-only; runtime processes
// use their own per-process env, see packages/shared/src/env).
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../.env') });

export default defineConfig({
  schema: path.resolve(here, '../../prisma/schema.prisma'),
  migrations: {
    path: path.resolve(here, '../../prisma/migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// apps/web → monorepo root for this worktree (not a parent checkout).
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin workspace root so nested git worktrees are not mistaken for the parent repo.
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingRoot: workspaceRoot,
  // Workspace packages are consumed as compiled dist (their exports point there):
  // Turbopack can't map NodeNext .js imports back to .ts source, and the Prisma
  // generated client uses .js imports too. Build order (deps first) is handled by
  // pnpm -r. Web still reaches the DB only via @narraza/db (D8 / web-boundary).
  // Server-only native/node packages that must not enter the client bundle.
  serverExternalPackages: ['@prisma/client', '@node-rs/argon2', 'nodemailer'],
  typedRoutes: true,
};

export default nextConfig;

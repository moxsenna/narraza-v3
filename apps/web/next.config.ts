import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed as compiled dist (their exports point there):
  // Turbopack can't map NodeNext .js imports back to .ts source, and the Prisma
  // generated client uses .js imports too. Build order (deps first) is handled by
  // pnpm -r. Web still reaches the DB only via @narraza/db (D8 / web-boundary).
  // Server-only native/node packages that must not enter the client bundle.
  serverExternalPackages: ['@prisma/client', '@node-rs/argon2', 'nodemailer'],
  typedRoutes: true,
};

export default nextConfig;

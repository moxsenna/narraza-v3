import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Consume workspace packages from source (Just-in-Time). Keeps DB access behind
  // @narraza/db (D8) while still giving web live reload of shared/application code.
  transpilePackages: ['@narraza/shared', '@narraza/application', '@narraza/db'],
  // Prisma client is server-only; never let it be bundled into the client graph.
  serverExternalPackages: ['@prisma/client', '@auth/prisma-adapter'],
  typedRoutes: true,
};

export default nextConfig;

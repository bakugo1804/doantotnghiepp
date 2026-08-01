import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000'] } },
  turbopack: { root: process.cwd() },
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001' },
};

export default nextConfig;

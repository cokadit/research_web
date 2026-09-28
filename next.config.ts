import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // playwright, sharp and pg are external by default. These two are not.
  serverExternalPackages: ['pg-boss', 'postgres', 'simple-wappalyzer'],
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
};

export default nextConfig;

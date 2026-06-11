import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  devIndicators: {
    position: 'top-right'
  }
};

export default nextConfig;

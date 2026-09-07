import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  devIndicators: {
    position: 'top-right'
  },
  // The office app is one client shell whose screens are addressed by URL (see
  // src/modules/operations/office-route.ts). Any path that is not a real page or asset falls
  // back to that shell, so refresh, bookmarks, and shared links land on the right screen.
  async rewrites() {
    return {
      fallback: [{ source: '/:path*', destination: '/' }]
    };
  }
};

export default nextConfig;

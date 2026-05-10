import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const apiBaseUrl = process.env.KESTREL_API_BASE_URL ?? 'http://localhost:3000';

    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

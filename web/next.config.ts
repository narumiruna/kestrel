import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],

  async rewrites() {
    const apiBaseUrl = process.env.KESTREL_API_BASE_URL ?? 'http://localhost:3300';

    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

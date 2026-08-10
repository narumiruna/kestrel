import type { NextConfig } from 'next';
import { AGENT_DISCOVERY_LINK_HEADER } from './lib/agentDiscovery';

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    useTypeScriptCli: true,
  },
  async headers() {
    return [
      {
        headers: [
          {
            key: 'Link',
            value: AGENT_DISCOVERY_LINK_HEADER,
          },
        ],
        source: '/',
      },
      {
        headers: [
          {
            key: 'Link',
            value: AGENT_DISCOVERY_LINK_HEADER,
          },
        ],
        source: '/login',
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig = {
  // Disable strict linting for deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
} as NextConfig;

export default nextConfig;

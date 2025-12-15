import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed ignoreDuringBuilds and ignoreBuildErrors for enterprise production standards
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;

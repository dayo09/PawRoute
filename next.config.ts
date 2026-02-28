import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'dnvefa72aowie.cloudfront.net',
      },
      {
        protocol: 'https',
        hostname: 'www.daangn.com',
      },
    ],
  },
};

export default nextConfig;

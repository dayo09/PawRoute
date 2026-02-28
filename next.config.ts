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
      {
        protocol: 'https',
        hostname: 'community-api-cdn.kr.karrotmarket.com',
      },
      {
        protocol: 'https',
        hostname: 'pawinhand.kr',
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // allowedDevOrigins: ["192.168.200.33"],

  allowedDevOrigins: [
    "10.166.75.143",
    "10.166.75.143.sslip.io",
    "*.sslip.io",
    "localhost",
    "127.0.0.1",
    "127.0.0.1.sslip.io",
  ],

  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

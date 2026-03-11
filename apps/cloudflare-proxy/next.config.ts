import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.cloudflare.com",
      },
      {
        protocol: "https",
        hostname: "dash.cloudflare.com",
      },
    ],
  },
  serverExternalPackages: ["better-sqlite3", "@modelcontextprotocol/sdk"],
};

export default nextConfig;

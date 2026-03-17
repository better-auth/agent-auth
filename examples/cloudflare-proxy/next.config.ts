import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
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

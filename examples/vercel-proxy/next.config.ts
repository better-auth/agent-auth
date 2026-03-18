import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
    resolveAlias: {
      tailwindcss: path.join(__dirname, "node_modules", "tailwindcss"),
    },
  },
  
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.vercel.com",
      },
      {
        protocol: "https",
        hostname: "vercel.com",
      },
    ],
  },
  serverExternalPackages: ["postgres"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

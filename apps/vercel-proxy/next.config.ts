import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
	serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

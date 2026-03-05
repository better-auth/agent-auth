import type { NextConfig } from "next";

const config: NextConfig = {
	devIndicators: false,
	serverExternalPackages: ["better-sqlite3"],
};

export default config;

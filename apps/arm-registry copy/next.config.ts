import type { NextConfig } from "next";

const config: NextConfig = {
	devIndicators: false,
	serverExternalPackages: [
		"onnxruntime-node",
		"@huggingface/transformers",
		"better-sqlite3",
	],
};

export default config;

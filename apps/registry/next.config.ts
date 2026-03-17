import type { NextConfig } from "next";

const config: NextConfig = {
	devIndicators: false,
	serverExternalPackages: ["onnxruntime-node", "@huggingface/transformers"],
};

export default config;

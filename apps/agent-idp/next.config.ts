import type { NextConfig } from "next";

const config: NextConfig = {
	serverExternalPackages: ["onnxruntime-node", "@huggingface/transformers"],
};

export default config;

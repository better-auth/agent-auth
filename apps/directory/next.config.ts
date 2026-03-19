import path from "path";
import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
    resolveAlias: {
      tailwindcss: path.join(__dirname, "node_modules", "tailwindcss"),
    },
  },
  devIndicators: false,
  serverExternalPackages: ["onnxruntime-node", "@huggingface/transformers"],
};

export default config;

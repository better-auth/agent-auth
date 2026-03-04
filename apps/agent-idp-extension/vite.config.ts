import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	base: "./",
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				panel: resolve(__dirname, "index.html"),
			},
			output: {
				entryFileNames: "assets/[name].js",
				chunkFileNames: "assets/[name].js",
				assetFileNames: "assets/[name].[ext]",
			},
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
});

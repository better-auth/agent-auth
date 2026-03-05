import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/client.ts",
		"src/agent-client.ts",
		"src/mcp-tools.ts",
		"src/mcp-storage-fs.ts",
		"src/mcp-storage-memory.ts",
		"src/mcp-server.ts",
		"src/openapi.ts",
	],
	format: ["esm"],
	dts: true,
	splitting: true,
	clean: true,
	outDir: "dist",
	external: [
		"better-auth",
		"@better-auth/core",
		"@better-auth/utils",
		"@noble/ciphers",
		"@modelcontextprotocol/sdk",
	],
});

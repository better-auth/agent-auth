import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/openapi.ts"],
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
  external: ["better-auth", "@better-auth/core", "@better-auth/utils"],
});

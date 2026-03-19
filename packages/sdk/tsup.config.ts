import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/tools-entry.ts"],
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
});

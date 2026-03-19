import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/**/*.test.ts"],
      thresholds: {
        lines: 60,
      },
    },
  },
});

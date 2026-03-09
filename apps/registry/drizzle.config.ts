import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./lib/db/schema.ts",
	dbCredentials: {
		url: "registry.db",
	},
});

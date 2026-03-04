import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: ["./lib/db/better-auth-schema.ts", "./lib/db/schema.ts"],
	out: "./drizzle",
	dbCredentials: {
		url: process.env.POSTGRES_URL!,
	},
});

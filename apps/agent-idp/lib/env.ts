if (typeof window !== "undefined") {
	throw new Error("env.ts must not be imported from the browser.");
}

const required = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
};

const optional = (name: string, fallback?: string): string | undefined => {
	const value = process.env[name];
	return value || fallback;
};

const nodeEnv = (process.env.NODE_ENV ?? "development") as
	| "development"
	| "production"
	| "test";

export const env = {
	NODE_ENV: nodeEnv,
	IS_PROD: nodeEnv === "production",
	IS_DEV: nodeEnv === "development",

	POSTGRES_URL: required("POSTGRES_URL"),

	BETTER_AUTH_URL:
		optional("BETTER_AUTH_URL") ||
		optional("BASE_URL") ||
		"http://localhost:4000",
	BASE_URL:
		optional("BASE_URL") ||
		optional("BETTER_AUTH_URL") ||
		"http://localhost:4000",

	// Google OAuth
	GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID", ""),
	GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET", ""),

	// GitHub OAuth
	GITHUB_CLIENT_ID: optional("GITHUB_CLIENT_ID", ""),
	GITHUB_CLIENT_SECRET: optional("GITHUB_CLIENT_SECRET", ""),

	AGENT_ENCRYPTION_KEY: optional("AGENT_ENCRYPTION_KEY"),

	CLICKHOUSE_URL: optional("CLICKHOUSE_URL"),
} as const;

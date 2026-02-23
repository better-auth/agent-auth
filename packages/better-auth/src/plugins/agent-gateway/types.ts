import type { InferOptionSchema } from "../../types";
import type { gatewaySchema } from "./schema";

export interface AgentGatewayOptions {
	/**
	 * Providers to enable.
	 *
	 * Pass a string for known providers (e.g. `"github"`) or a full
	 * config object for custom providers. Known providers are resolved
	 * from a built-in registry — no config needed.
	 *
	 * @example
	 * ```ts
	 * agentGateway({
	 *   providers: [
	 *     "github",
	 *     {
	 *       name: "google",
	 *       transport: "stdio",
	 *       command: "npx",
	 *       args: ["tsx", "lib/providers/google/server.ts"],
	 *       getEnv: (token) => ({ GOOGLE_ACCESS_TOKEN: token }),
	 *     },
	 *   ],
	 * })
	 * ```
	 */
	providers?: ProviderBridgeInput[];
	/**
	 * Resolves a credential (token, API key, etc.) for a given provider
	 * and user at request time. Return a string token or `null` to skip
	 * that provider for that user.
	 *
	 * If not provided, defaults to looking up the user's OAuth access
	 * token from the `account` table.
	 *
	 * @example
	 * ```ts
	 * agentGateway({
	 *   providers: ["github"],
	 *   resolveCredentials: async ({ providerId, userId, adapter }) => {
	 *     // Custom lookup — e.g. from a user_tokens table
	 *     const row = await adapter.findOne({
	 *       model: "userToken",
	 *       where: [
	 *         { field: "userId", value: userId },
	 *         { field: "provider", value: providerId },
	 *       ],
	 *     });
	 *     return row?.token ?? null;
	 *   },
	 * })
	 * ```
	 */
	resolveCredentials?: (ctx: {
		providerId: string;
		userId: string;
		adapter: unknown;
	}) => Promise<string | null> | string | null;
	/**
	 * Guard for MCP provider management endpoints (register, delete).
	 * Receives the user session and returns `true` to allow.
	 *
	 * Defaults to checking `user.role === "admin"`.
	 * Set to `true` to allow any authenticated user.
	 *
	 * @example
	 * ```ts
	 * authorizeProviderManagement: (user) => user.role === "admin"
	 * ```
	 */
	authorizeProviderManagement?:
		| ((user: {
				id: string;
				role?: string | null;
				[key: string]: string | number | boolean | null | undefined;
		  }) => boolean | Promise<boolean>)
		| true;
	/**
	 * Rate limiting for gateway endpoints.
	 * Set to `false` to disable plugin-level rate limiting entirely.
	 *
	 * @default { window: 60, max: 60, sensitiveMax: 5 }
	 */
	rateLimit?:
		| {
				/** Time window in seconds. @default 60 */
				window?: number;
				/** Max requests per window for general gateway routes. @default 60 */
				max?: number;
				/** Max requests per window for provider register/delete. @default 5 */
				sensitiveMax?: number;
		  }
		| false;
	/**
	 * Custom schema overrides for the gateway tables.
	 */
	schema?: InferOptionSchema<ReturnType<typeof gatewaySchema>>;
}

/** A known provider name or a full bridge config with a `name` field. */
export type ProviderBridgeInput =
	| string
	| (ProviderBridgeConfig & { name: string });

/**
 * HTTP provider bridge — uses the user's OAuth token to authenticate
 * with a remote MCP endpoint (e.g. GitHub Copilot MCP).
 */
export interface HttpProviderBridge {
	transport: "http";
	/** The MCP server endpoint URL. */
	mcpEndpoint: string;
	/** Builds auth headers from the user's OAuth access token. */
	getAuthHeaders: (token: string) => Record<string, string>;
}

/**
 * Stdio provider bridge — spawns a local process and passes the
 * user's OAuth token via environment variables.
 */
export interface StdioProviderBridge {
	transport: "stdio";
	/** Command to spawn (e.g. "npx", "node"). */
	command: string;
	/** Arguments for the command. */
	args?: string[];
	/** Builds env vars from the user's OAuth access token. */
	getEnv: (token: string) => Record<string, string>;
}

export type ProviderBridgeConfig = HttpProviderBridge | StdioProviderBridge;

export interface McpTool {
	name: string;
	description: string;
	inputSchema?: Record<string, unknown>;
}

export interface ToolResult {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}

/**
 * An MCP provider record as stored in the database.
 */
export interface MCPProvider {
	id: string;
	name: string;
	orgId: string | null;
	workgroupId: string | null;
	displayName: string;
	transport: "stdio" | "sse";
	command: string | null;
	args: string[];
	env: Record<string, string> | null;
	url: string | null;
	headers: Record<string, string> | null;
	toolScopes: Record<string, string[]> | null;
	status: "active" | "disabled";
	createdAt: Date;
	updatedAt: Date;
}

export interface ResolvedGatewayOptions extends AgentGatewayOptions {
	/** Resolved provider bridge map (name → config). Built during plugin init. */
	resolvedBridge: Record<string, ProviderBridgeConfig>;
}

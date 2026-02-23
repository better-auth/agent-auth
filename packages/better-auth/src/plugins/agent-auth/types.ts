import type { InferOptionSchema } from "../../types";
import type { agentSchema } from "./schema";

export interface AgentAuthOptions {
	/**
	 * Role definitions mapping role names to scope arrays.
	 *
	 * @example
	 * ```ts
	 * roles: {
	 *   agent: ["email.send", "reports.read"],
	 *   finance_agent: ["email.send", "invoices.read"],
	 * }
	 * ```
	 */
	roles?: Record<string, string[]>;
	/**
	 * Default role assigned to new agents.
	 */
	defaultRole?: string;
	/**
	 * Allowed key algorithms for agent keypairs. Validated against
	 * the JWK `crv` field (or `kty` when no curve applies).
	 *
	 * Use JWK curve names, **not** JWA algorithm identifiers:
	 * - `"Ed25519"` (correct) — not `"EdDSA"`
	 * - `"P-256"` (correct) — not `"ES256"`
	 *
	 * @default ["Ed25519"]
	 */
	allowedKeyAlgorithms?: string[];
	/**
	 * JWT claim format for keypair auth.
	 *
	 * - `"simple"` — flat claims: `sub`, `scopes`, `userId`, `role`
	 * - `"aap"` — structured AAP-compatible claims: `aap_agent`, `aap_capabilities`, etc.
	 *
	 * @default "simple"
	 */
	jwtFormat?: "simple" | "aap";
	/**
	 * Maximum age for agent JWTs in seconds.
	 * @default 60
	 */
	jwtMaxAge?: number;
	/**
	 * Sliding TTL for agent sessions in seconds. When set, agents
	 * automatically expire if unused for longer than this duration.
	 * Each authenticated request extends the deadline.
	 *
	 * Set to `0` or omit to disable TTL (agents never auto-expire).
	 * @default 3600 (1 hour)
	 */
	agentSessionTTL?: number;
	/**
	 * Validate that requested scopes exist before granting them.
	 *
	 * When `true`, scopes are checked against the union of all role
	 * scopes defined in `roles`. Unrecognized scopes are rejected.
	 *
	 * **Warning:** Setting `true` without defining any `roles` means
	 * the known-scopes set is empty and *every* scope will be rejected.
	 * Either define `roles` or use a custom validation function.
	 *
	 * When a function, it receives the scopes array and should return
	 * `true` if all scopes are valid, or throw/return `false` to reject.
	 *
	 * When `false` or omitted, any scope string is accepted.
	 * @default false
	 */
	validateScopes?: boolean | ((scopes: string[]) => boolean | Promise<boolean>);
	/**
	 * Maximum number of active agents a single user can have.
	 * New agent creation is rejected once this limit is reached.
	 *
	 * Set to `0` to disable (unlimited agents).
	 * @default 25
	 */
	maxAgentsPerUser?: number;
	/**
	 * Maximum total tokens (input + output) an agent can consume.
	 * Once exceeded, authenticated requests are rejected and token
	 * logging via `log-activity` returns an error.
	 *
	 * **Note:** Budgets are enforced on a best-effort basis. Under high
	 * concurrency, multiple requests may pass the check before any single
	 * increment is written, allowing brief overages. This is suitable for
	 * advisory limits; do not rely on it for hard billing cutoffs.
	 *
	 * Set to `0` or omit to disable (unlimited tokens).
	 * @default 0
	 */
	maxTokensPerAgent?: number;
	/**
	 * Maximum total tokens (input + output) across ALL agents owned
	 * by a single user. Prevents circumventing per-agent limits by
	 * creating multiple agents.
	 *
	 * **Note:** Same best-effort semantics as `maxTokensPerAgent`.
	 *
	 * Set to `0` or omit to disable (unlimited).
	 * @default 0
	 */
	maxTokensPerUser?: number;
	/**
	 * Maximum absolute lifetime for agent sessions in seconds,
	 * measured from `createdAt`. Even if the sliding TTL keeps
	 * extending, the agent is rejected once this cap is reached.
	 *
	 * Set to `0` or omit to disable (no hard cap).
	 * @default 86400 (24 hours)
	 */
	agentMaxLifetime?: number;
	/**
	 * Rate limiting configuration for agent endpoints.
	 * Set to `false` to disable plugin-level rate limiting entirely.
	 *
	 * @default { window: 60, max: 60, createMax: 10, sensitiveMax: 5 }
	 *
	 * @example
	 * ```ts
	 * rateLimit: { window: 60, max: 100, createMax: 50 }
	 * ```
	 */
	rateLimit?:
		| {
				/** Time window in seconds. @default 60 */
				window?: number;
				/** Max requests per window for general agent routes. @default 60 */
				max?: number;
				/** Max requests per window for agent creation. @default 10 */
				createMax?: number;
				/** Max requests per window for sensitive ops (key rotation, cleanup, provider management). @default 5 */
				sensitiveMax?: number;
		  }
		| false;
	/**
	 * MCP providers that agents can connect to through the gateway.
	 *
	 * Pass a string for known providers (e.g. "github", "slack"),
	 * or a config object for custom MCP servers.
	 *
	 * @example
	 * ```ts
	 * mcpProviders: [
	 *   "github",
	 *   "slack",
	 *   { name: "my-tool", command: "node", args: ["my-server.js"] },
	 * ]
	 * ```
	 */
	mcpProviders?: (string | MCPProviderConfig)[];
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
	 * Custom schema overrides for the agent table.
	 */
	schema?: InferOptionSchema<ReturnType<typeof agentSchema>>;
}

/**
 * An agent record as stored in the database.
 */
export interface Agent {
	id: string;
	name: string;
	userId: string;
	orgId: string | null;
	scopes: string[];
	role: string | null;
	status: "active" | "revoked";
	publicKey: string;
	kid: string | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	totalInputTokens: number;
	totalOutputTokens: number;
	metadata: AgentMetadata | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Arbitrary key-value metadata attached to an agent. */
export type AgentMetadata = Record<string, string | number | boolean | null>;

/**
 * The session object returned when an agent authenticates.
 * Available via `ctx.context.agentSession` in route handlers.
 */
export interface AgentSession {
	agent: {
		id: string;
		name: string;
		scopes: string[];
		role: string | null;
		orgId: string | null;
		createdAt: Date;
		metadata: AgentMetadata | null;
	};
	user: {
		id: string;
		name: string;
		email: string;
		[key: string]: string | number | boolean | null | undefined;
	};
}

/**
 * Configuration for an MCP provider.
 *
 * Mirrors the MCP server config format you already know from
 * Cursor / Claude Desktop, plus a `name` for scope namespacing.
 *
 * @example Stdio provider (spawns a process)
 * ```ts
 * { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] }
 * ```
 *
 * @example SSE provider (connects to a remote URL)
 * ```ts
 * { name: "my-api", url: "https://mcp.example.com/sse" }
 * ```
 */
export interface MCPProviderConfig {
	/** Unique name used as scope namespace (e.g. "github", "slack"). */
	name: string;
	/** Human-readable label. Defaults to `name` if omitted. */
	displayName?: string;
	/** Transport type. Required when using the registration API. For programmatic config, auto-detected from `command` (stdio) or `url` (sse). */
	transport?: "stdio" | "sse";
	/** Command to spawn the MCP server (e.g. "npx", "node"). */
	command?: string;
	/** Arguments for the command (e.g. ["-y", "@modelcontextprotocol/server-github"]). */
	args?: string[];
	/** Extra environment variables for the spawned process. Merged with the parent env. */
	env?: Record<string, string>;
	/** URL for remote MCP servers using SSE transport. */
	url?: string;
	/** HTTP headers for SSE connections (e.g. authorization). */
	headers?: Record<string, string>;
	/**
	 * Optional scope-to-tools mapping for granular access control.
	 *
	 * @example
	 * ```ts
	 * toolScopes: {
	 *   read: ["list_files", "read_file"],
	 *   write: ["create_file", "update_file"],
	 * }
	 * ```
	 *
	 * When omitted, all tools are accessible under `{provider}.*`.
	 */
	toolScopes?: Record<string, string[]>;
}

/**
 * An MCP provider record as stored in the database.
 */
export interface MCPProvider {
	id: string;
	name: string;
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

/**
 * Resolved options with defaults applied.
 */
export type ResolvedAgentAuthOptions = Required<
	Pick<
		AgentAuthOptions,
		| "allowedKeyAlgorithms"
		| "jwtFormat"
		| "jwtMaxAge"
		| "agentSessionTTL"
		| "agentMaxLifetime"
		| "maxAgentsPerUser"
		| "maxTokensPerAgent"
		| "maxTokensPerUser"
	>
> &
	AgentAuthOptions;

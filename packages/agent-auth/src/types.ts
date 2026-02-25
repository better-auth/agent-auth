import type { InferOptionSchema } from "better-auth/types";
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
	 */
	rateLimit?:
		| {
				/** Time window in seconds. @default 60 */
				window?: number;
				/** Max requests per window for general agent routes. @default 60 */
				max?: number;
				/** Max requests per window for agent creation. @default 10 */
				createMax?: number;
				/** Max requests per window for sensitive ops (key rotation, cleanup). @default 5 */
				sensitiveMax?: number;
		  }
		| false;
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
	workgroupId: string | null;
	scopes: string[];
	role: string | null;
	status: "active" | "revoked";
	publicKey: string;
	kid: string | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	metadata: AgentMetadata | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Arbitrary key-value metadata attached to an agent. */
export type AgentMetadata = Record<string, string | number | boolean | null>;

/**
 * A workgroup record as stored in the database.
 * Workgroups group agents within an organization.
 */
export interface Workgroup {
	id: string;
	name: string;
	description: string | null;
	orgId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

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
		workgroupId: string | null;
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
	>
> &
	AgentAuthOptions;

import type { GenericEndpointContext } from "@better-auth/core";
import type { InferOptionSchema } from "better-auth/types";
import type { agentSchema } from "./schema";

/** Capability definition for the capabilities endpoint (§2.3). */
export interface AgentCapability {
	name: string;
	description: string;
	type: "mcp" | "http" | (string & {});
	mcp?: { endpoint: string; tool_name: string };
	http?: {
		openapi_url?: string;
		operation_id?: string;
		method?: string;
		url?: string;
	};
	[key: string]: unknown;
}

export interface AgentAuthOptions {
	/**
	 * Provider name for discovery (§2.1).
	 * Returned in the well-known configuration.
	 */
	providerName?: string;
	/**
	 * Human-readable description of the service (§2.1).
	 */
	providerDescription?: string;
	/**
	 * Supported registration modes (§2.1).
	 * @default ["delegated", "autonomous"]
	 */
	modes?: Array<"delegated" | "autonomous">;
	/**
	 * Supported approval methods (§8).
	 * @default ["device_authorization"]
	 */
	approvalMethods?: string[];
	/**
	 * Resolve the preferred approval method for a given user.
	 *
	 * Called during agent creation when the agent needs user approval
	 * (pending host or pending scopes). Return `"ciba"` to automatically
	 * create a CIBA backchannel auth request, or `"device_authorization"`
	 * to return the standard device-flow verification URL.
	 *
	 * @example
	 * ```ts
	 * resolveApprovalMethod: async ({ userId }) => {
	 *   const prefs = await db.getUserPrefs(userId);
	 *   return prefs.useCiba ? "ciba" : "device_authorization";
	 * }
	 * ```
	 *
	 * @default () => "device_authorization"
	 */
	resolveApprovalMethod?: (context: {
		userId: string | null;
		agentName: string;
		hostId: string | null;
		scopes: string[];
	}) => string | Promise<string>;
	/**
	 * Server JWKS URI for clients to verify server-signed responses (§2.1).
	 */
	jwksUri?: string;
	/**
	 * Capability definitions returned by the capabilities endpoint (§2.3).
	 * Each capability maps a scope name to its execution details.
	 */
	capabilities?: AgentCapability[];
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
	 * When a function, it receives the scopes array and should return
	 * `true` if all scopes are valid, or throw/return `false` to reject.
	 *
	 * When omitted, any scope string is accepted.
	 */
	validateScopes?: (scopes: string[]) => boolean | Promise<boolean>;
	/**
	 * Maximum number of active agents a single user can have.
	 * New agent creation is rejected once this limit is reached.
	 *
	 * Set to `0` to disable (unlimited agents).
	 * @default 25
	 */
	maxAgentsPerUser?: number;
	/**
	 * Maximum lifetime for agent sessions in seconds,
	 * measured from `activatedAt`. Resets on each reactivation.
	 * When elapsed the agent transitions to "expired" (reactivatable).
	 *
	 * Set to `0` or omit to disable (no cap).
	 * @default 86400 (24 hours)
	 */
	agentMaxLifetime?: number;
	/**
	 * Absolute lifetime for agents in seconds, measured from `createdAt`.
	 * Never resets. When elapsed the agent is **revoked** (not expired),
	 * meaning it cannot be reactivated and must be re-created.
	 *
	 * Set to `0` or omit to disable (no absolute cap).
	 * @default 0 (disabled)
	 */
	absoluteLifetime?: number;
	/**
	 * Time window in seconds within which the user must have
	 * authenticated for sensitive operations (approve-scope).
	 * If the session is older than this, re-authentication is required.
	 *
	 * Set to `0` to disable fresh session enforcement.
	 * @default 300 (5 minutes)
	 */
	freshSessionWindow?: number;
	/**
	 * Whether to allow unknown hosts to register dynamically during
	 * agent creation. When `false`, only pre-registered hosts (created
	 * via `POST /agent/host/create` or the dashboard) can create agents.
	 *
	 * Can be a boolean or an async callback that receives the full
	 * endpoint context for per-request decisions (e.g. checking
	 * org-level settings from session data).
	 *
	 * @default true
	 */
	allowDynamicHostRegistration?:
		| boolean
		| ((ctx: GenericEndpointContext) => boolean | Promise<boolean>);
	/**
	 * Scopes that are always blocked from being granted or escalated.
	 * Any scope request containing a blocked scope is rejected.
	 * @default []
	 */
	blockedScopes?: string[];
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
 * An agent host record — persistent, app-level consent.
 * Uses Ed25519 keypair for proof-of-possession (no bearer tokens — §4).
 * Three-state lifecycle matching agents (§9.1).
 */
export interface AgentHost {
	id: string;
	/** Human-readable name identifying the environment/device (e.g. "Cursor on MacBook-Pro"). §7.1. */
	name: string | null;
	userId: string | null;
	/** Optional server-defined external identifier (org ID, tenant ID, etc.). §4.3. */
	referenceId: string | null;
	scopes: string[];
	publicKey: string;
	kid: string | null;
	jwksUrl: string | null;
	/** SHA-256 hash of a one-time enrollment token for dashboard-provisioned hosts. */
	enrollmentTokenHash: string | null;
	enrollmentTokenExpiresAt: Date | null;
	status:
		| "active"
		| "pending"
		| "pending_enrollment"
		| "expired"
		| "revoked"
		| "rejected";
	activatedAt: Date | null;
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * An agent record as stored in the database.
 * Pure identity — authorization lives in `agentPermission`.
 * Three-state lifecycle: active → expired → (reactivate) → active, or → revoked.
 */
export interface Agent {
	id: string;
	name: string;
	userId: string | null;
	hostId: string | null;
	status: "active" | "pending" | "expired" | "revoked" | "rejected";
	mode: "delegated" | "autonomous";
	publicKey: string;
	kid: string | null;
	/** JWKS endpoint URL for agent keys (§2.2). */
	jwksUrl: string | null;
	lastUsedAt: Date | null;
	activatedAt: Date | null;
	expiresAt: Date | null;
	metadata: AgentMetadata | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * A single permission granted to an agent.
 * Multiple rows per agent — the union of all active rows is the agent's effective permissions.
 */
export interface AgentPermission {
	id: string;
	agentId: string;
	scope: string;
	/** Resource this permission applies to. Null = unrestricted. */
	referenceId: string | null;
	/** User who granted this permission. Null when granted during host bootstrap without a user session. */
	grantedBy: string | null;
	expiresAt: Date | null;
	/** Lifecycle status: active permissions are enforced, pending await user approval, denied are rejected. */
	status: "active" | "pending" | "denied";
	/** Human-readable reason for a pending permission request. */
	reason: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * A CIBA backchannel authentication request (OpenID Connect CIBA Core 1.0).
 */
export interface CibaAuthRequest {
	id: string;
	clientId: string;
	loginHint: string;
	userId: string | null;
	scope: string | null;
	bindingMessage: string | null;
	clientNotificationToken: string | null;
	clientNotificationEndpoint: string | null;
	deliveryMode: "poll" | "ping" | "push";
	status: "pending" | "approved" | "denied" | "expired";
	accessToken: string | null;
	interval: number;
	lastPolledAt: Date | null;
	expiresAt: Date;
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
		mode: "delegated" | "autonomous";
		permissions: Array<{
			scope: string;
			referenceId: string | null;
			grantedBy: string | null;
			status: string;
		}>;
		hostId: string | null;
		createdAt: Date;
		activatedAt: Date | null;
		metadata: AgentMetadata | null;
	};
	user: {
		id: string;
		name: string;
		email: string;
		[key: string]: string | number | boolean | null | undefined;
	} | null;
}

/**
 * The session object set when a host JWT authenticates.
 * Available via `ctx.context.hostSession` in route handlers.
 */
export interface HostSession {
	host: {
		id: string;
		userId: string | null;
		scopes: string[];
		status: string;
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
		| "absoluteLifetime"
		| "freshSessionWindow"
		| "blockedScopes"
		| "modes"
		| "approvalMethods"
		| "resolveApprovalMethod"
		| "allowDynamicHostRegistration"
	>
> &
	AgentAuthOptions;

import type { GenericEndpointContext } from "@better-auth/core";
import type { InferOptionSchema } from "better-auth/types";
import type { agentSchema } from "./schema";

/** OpenAPI-aligned parameter definition for the HTTP profile — §4.2. */
export interface HttpParameter {
	name: string;
	in: "path" | "query" | "header";
	required?: boolean;
	schema?: Record<string, unknown>;
	description?: string;
}

/** OpenAPI-aligned request body definition for the HTTP profile — §4.2. */
export interface HttpRequestBody {
	required?: boolean;
	description?: string;
	content?: Record<string, { schema?: Record<string, unknown> }>;
}

/** Standard HTTP execution profile — §4.2. */
export interface HttpDescriptor {
	method: string;
	url: string;
	headers?: Record<string, string>;
	interaction_mode?: "sync" | "stream" | "async";
	input?: {
		parameters?: HttpParameter[];
		requestBody?: HttpRequestBody;
	};
}

/**
 * Capability definition — §4.
 *
 * Core fields are `id` and `description`. Execution metadata
 * (e.g. `http`, `graphql`, `docs`) lives as flat top-level keys.
 */
export interface Capability {
	id: string;
	title?: string;
	description: string;
	http?: HttpDescriptor;
	[key: string]: unknown;
}

export type AgentMode = "delegated" | "autonomous";

export type AgentStatus =
	| "active"
	| "pending"
	| "expired"
	| "revoked"
	| "rejected"
	| "claimed";

export type HostStatus =
	| "active"
	| "pending"
	| "pending_enrollment"
	| "revoked"
	| "rejected";

export type GrantStatus = "active" | "pending" | "denied";

/** Host — §8.1. */
export interface AgentHost {
	id: string;
	name: string | null;
	userId: string | null;
	defaultCapabilityIds: string[];
	publicKey: string | null;
	kid: string | null;
	jwksUrl: string | null;
	enrollmentTokenHash: string | null;
	enrollmentTokenExpiresAt: Date | null;
	status: HostStatus;
	activatedAt: Date | null;
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Agent — §8.2. */
export interface Agent {
	id: string;
	name: string;
	hostId: string;
	userId: string | null;
	publicKey: string;
	kid: string | null;
	jwksUrl: string | null;
	status: AgentStatus;
	mode: AgentMode;
	lastUsedAt: Date | null;
	activatedAt: Date | null;
	expiresAt: Date | null;
	metadata: AgentMetadata | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Arbitrary key-value metadata attached to an agent. */
export type AgentMetadata = Record<string, string | number | boolean | null>;

/** Agent capability grant — §8.3. */
export interface AgentCapabilityGrant {
	id: string;
	agentId: string;
	capabilityId: string;
	grantedBy: string | null;
	reason: string | null;
	expiresAt: Date | null;
	status: GrantStatus;
	createdAt: Date;
	updatedAt: Date;
}

/** CIBA backchannel authentication request (§9.2). */
export interface CibaAuthRequest {
	id: string;
	clientId: string;
	loginHint: string;
	userId: string | null;
	agentId: string | null;
	capabilityIds: string | null;
	bindingMessage: string | null;
	clientNotificationToken: string | null;
	clientNotificationEndpoint: string | null;
	deliveryMode: "poll" | "ping" | "push";
	status: "pending" | "approved" | "denied" | "expired";
	interval: number;
	lastPolledAt: Date | null;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

/** User shape returned in `AgentSession.user`. */
export interface AgentSessionUser {
	id: string;
	name: string;
	email: string;
	[key: string]: unknown;
}

/**
 * Session object set when an agent JWT authenticates.
 * Available via `ctx.context.agentSession`.
 */
export interface AgentSession {
	type: AgentMode;
	agent: {
		id: string;
		name: string;
		mode: AgentMode;
		capabilityGrants: Array<{
			capabilityId: string;
			grantedBy: string | null;
			status: string;
		}>;
		hostId: string;
		createdAt: Date;
		activatedAt: Date | null;
		metadata: AgentMetadata | null;
	};
	host: {
		id: string;
		userId: string | null;
		status: string;
	} | null;
	user: AgentSessionUser;
}

/**
 * Session object set when a host JWT authenticates.
 * Available via `ctx.context.hostSession`.
 */
export interface HostSession {
	host: {
		id: string;
		userId: string | null;
		defaultCapabilityIds: string[];
		status: string;
	};
}

export type AgentAuthPath =
	| "/agent/register"
	| "/agent/list"
	| "/agent/get"
	| "/agent/update"
	| "/agent/revoke"
	| "/agent/rotate-key"
	| "/agent/reactivate"
	| "/agent/session"
	| "/agent/cleanup"
	| "/agent/request-capability"
	| "/agent/approve-capability"
	| "/agent/agent-configuration"
	| "/agent/capabilities"
	| "/agent/status"
	| "/agent/introspect"
	| "/agent/connect-account"
	| "/agent/approve-connect-account"
	| "/agent/grant-capability"
	| "/agent/host/create"
	| "/agent/host/enroll"
	| "/agent/host/list"
	| "/agent/host/get"
	| "/agent/host/revoke"
	| "/agent/host/reactivate"
	| "/agent/host/update"
	| "/agent/host/rotate-key"
	| "/agent/ciba/authorize"
	| "/agent/ciba/token"
	| "/agent/ciba/approve"
	| "/agent/ciba/deny"
	| "/agent/ciba/pending";

export interface DynamicHostDefaultCapabilityIdsContext {
	ctx: GenericEndpointContext;
	mode: AgentMode;
	userId: string | null;
	hostId: string | null;
	hostName: string | null;
}

export interface AgentAuthOptions {
	/**
	 * Provider name for discovery (§6.1).
	 * Returned in the well-known configuration.
	 */
	providerName?: string;
	/**
	 * Human-readable description of the service (§6.1).
	 */
	providerDescription?: string;
	/**
	 * Supported registration modes (§6.1).
	 * @default ["delegated", "autonomous"]
	 */
	modes?: AgentMode[];
	/**
	 * Supported approval methods (§9).
	 * @default ["ciba", "device_authorization"]
	 */
	approvalMethods?: string[];
	/**
	 * Resolve the approval method for a given context (§9.5).
	 *
	 * @default ({ userId }) => userId ? "ciba" : "device_authorization"
	 */
	resolveApprovalMethod?: (context: {
		userId: string | null;
		agentName: string;
		hostId: string | null;
		capabilityIds: string[];
		preferredMethod?: string;
	}) => string | Promise<string>;
	/**
	 * Server JWKS URI for clients to verify server-signed responses (§6.1).
	 */
	jwksUri?: string;
	/**
	 * Capability definitions returned by the capabilities endpoint (§4).
	 */
	capabilities?: Capability[];
	/**
	 * Allowed key algorithms for agent/host keypairs (§5.1).
	 * Use JWK curve names (`"Ed25519"`, `"P-256"`), **not** JWA identifiers.
	 * @default ["Ed25519"]
	 */
	allowedKeyAlgorithms?: string[];
	/**
	 * JWT claim format for keypair auth.
	 * - `"simple"` — flat claims: `sub`, `capabilityIds`, etc.
	 * - `"aap"` — structured AAP-compatible claims
	 * @default "simple"
	 */
	jwtFormat?: "simple" | "aap";
	/**
	 * Maximum age for agent/host JWTs in seconds (§5.3).
	 * @default 60
	 */
	jwtMaxAge?: number;
	/**
	 * Sliding TTL for agent sessions in seconds (§2.4).
	 * Each authenticated request extends the deadline.
	 * Set to `0` to disable.
	 * @default 3600 (1 hour)
	 */
	agentSessionTTL?: number;
	/**
	 * Validate that requested capability IDs exist (§10.6).
	 * When omitted, any string is accepted.
	 */
	validateCapabilities?: (
		capabilityIds: string[],
	) => boolean | Promise<boolean>;
	/**
	 * Maximum number of active agents a single user can have (§10.13).
	 * Set to `0` to disable.
	 * @default 25
	 */
	maxAgentsPerUser?: number;
	/**
	 * Maximum lifetime for active agent sessions in seconds (§2.4).
	 * Measured from `activatedAt`, resets on reactivation.
	 * Set to `0` to disable.
	 * @default 86400 (24 hours)
	 */
	agentMaxLifetime?: number;
	/**
	 * Absolute lifetime in seconds, measured from `createdAt` (§2.4).
	 * Never resets. When elapsed the agent is **revoked**.
	 * Set to `0` to disable.
	 * @default 0 (disabled)
	 */
	absoluteLifetime?: number;
	/**
	 * Fresh session window in seconds for device-auth approval (§10.11).
	 * @default 300 (5 minutes)
	 */
	freshSessionWindow?:
		| number
		| ((ctx: GenericEndpointContext) => number | Promise<number>);
	/**
	 * Whether to allow unknown hosts to register dynamically (§3.2).
	 * @default true
	 */
	allowDynamicHostRegistration?:
		| boolean
		| ((ctx: GenericEndpointContext) => boolean | Promise<boolean>);
	/**
	 * Default capability IDs for dynamically created hosts (§3.2).
	 * @default []
	 */
	dynamicHostDefaultCapabilityIds?:
		| string[]
		| ((
				context: DynamicHostDefaultCapabilityIdsContext,
		  ) => string[] | Promise<string[]>);
	/**
	 * Resolve a virtual user for an autonomous agent session.
	 * Called at session time when the agent has no userId and
	 * the host has no userId.
	 */
	resolveAutonomousUser?: (context: {
		ctx: GenericEndpointContext;
		hostId: string;
		hostName: string | null;
		agentId: string;
		agentMode: AgentMode;
	}) => AgentSessionUser | null | Promise<AgentSessionUser | null>;
	/**
	 * Called when an unclaimed host is linked to a real user (§3.4).
	 */
	onHostClaimed?: (context: {
		ctx: GenericEndpointContext;
		hostId: string;
		userId: string;
		previousUserId: string | null;
	}) => void | Promise<void>;
	/**
	 * Resolve a TTL (in seconds) for a newly granted capability (§8.3).
	 */
	resolveGrantTTL?: (context: {
		capabilityId: string;
		agentId: string;
		hostId: string | null;
		userId: string | null;
	}) => number | null | undefined | Promise<number | null | undefined>;
	/**
	 * Capability IDs that are always blocked from being granted (§10.6).
	 * @default []
	 */
	blockedCapabilityIds?: string[];
	/**
	 * Where to store seen JWT `jti` values for replay protection (§5.6).
	 *
	 * - `"memory"` — in-process `Map` with automatic eviction (default).
	 * - `"secondary-storage"` — delegates to Better Auth's configured
	 *   `secondaryStorage` (e.g. Redis), giving replay protection across
	 *   multiple server instances.
	 *
	 * When omitted, the plugin auto-detects: if `secondaryStorage` is
	 * available on the auth context it is used; otherwise falls back to
	 * in-memory.
	 */
	jtiCacheStorage?: "memory" | "secondary-storage";
	/**
	 * Storage backend for the JWKS URL cache.
	 *
	 * - `"memory"` — in-process Map (default, fine for single-instance).
	 * - `"secondary-storage"` — uses Better Auth's configured
	 *   `secondaryStorage` (e.g. Redis), sharing cached key sets
	 *   across multiple server instances.
	 *
	 * When omitted, the plugin auto-detects: if `secondaryStorage` is
	 * available on the auth context it is used; otherwise falls back to
	 * in-memory.
	 */
	jwksCacheStorage?: "memory" | "secondary-storage";
	/**
	 * Skip JTI (JWT ID) replay protection checks.
	 *
	 * By default the plugin requires every host/agent JWT to carry a
	 * unique `jti` claim and rejects replayed tokens. Set this to
	 * `true` only in development or testing — **never in production**.
	 *
	 * @default false
	 */
	dangerouslySkipJtiCheck?: boolean;
	/**
	 * Per-path rate limit overrides for agent endpoints.
	 *
	 * Sensible defaults are applied to every path automatically.
	 * Use this to tighten or relax limits on specific routes.
	 *
	 * To disable rate limiting entirely, use the top-level Better Auth
	 * `rateLimit` config — the plugin always contributes its rules.
	 */
	rateLimit?: Partial<
		Record<AgentAuthPath, { window?: number; max?: number }>
	>;
	/**
	 * Custom schema overrides for the agent tables.
	 */
	schema?: InferOptionSchema<ReturnType<typeof agentSchema>>;
	/**
	 * Callback invoked after significant mutations (§12).
	 */
	onEvent?: (event: AgentAuthEvent) => void | Promise<void>;
}

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
		| "blockedCapabilityIds"
		| "modes"
		| "approvalMethods"
		| "resolveApprovalMethod"
		| "allowDynamicHostRegistration"
		| "dynamicHostDefaultCapabilityIds"
		| "jtiCacheStorage"
		| "jwksCacheStorage"
		| "dangerouslySkipJtiCheck"
	>
> &
	AgentAuthOptions;

interface AgentAuthEventBase {
	orgId?: string;
	actorId?: string;
	actorType?: "user" | "agent" | "system";
	agentId?: string;
	hostId?: string;
	targetId?: string;
	targetType?: string;
	metadata?: Record<string, unknown>;
}

export type AgentAuthAuditEventType =
	| "agent.created"
	| "agent.updated"
	| "agent.revoked"
	| "agent.reactivated"
	| "agent.key_rotated"
	| "agent.cleanup"
	| "host.created"
	| "host.enrolled"
	| "host.updated"
	| "host.revoked"
	| "host.reactivated"
	| "host.key_rotated"
	| "host.claimed"
	| "capability.requested"
	| "capability.approved"
	| "capability.denied"
	| "capability.granted"
	| "ciba.authorized"
	| "ciba.approved"
	| "ciba.denied";

export interface AgentAuthAuditEvent extends AgentAuthEventBase {
	type: AgentAuthAuditEventType;
}

export interface AgentAuthToolEvent extends AgentAuthEventBase {
	type: "tool.executed";
	tool: string;
	provider?: string;
	agentName?: string;
	userId?: string;
	toolArgs?: Record<string, unknown>;
	toolOutput?: unknown;
	status: "success" | "error";
	durationMs?: number;
	error?: string;
}

export type AgentAuthEvent = AgentAuthAuditEvent | AgentAuthToolEvent;

/** Ed25519 JWK (or other supported key types). */
export interface AgentJWK {
	kty: string;
	crv?: string;
	x?: string;
	d?: string;
	kid?: string;
	[key: string]: unknown;
}

export interface AdapterFindOne {
	findOne: <T>(args: {
		model: string;
		where: Array<{ field: string; value: string }>;
	}) => Promise<T | null>;
}

export interface AdapterFindMany {
	findMany: <T>(args: {
		model: string;
		where: Array<{ field: string; value: string }>;
		sortBy?: { field: string; direction: "asc" | "desc" };
		limit?: number;
	}) => Promise<T[]>;
}

export interface AdapterCreate {
	create: <TInput extends Record<string, unknown>, TOutput = TInput>(args: {
		model: string;
		data: TInput;
	}) => Promise<TOutput>;
}

export interface AdapterUpdate {
	update: (args: {
		model: string;
		where: Array<{ field: string; value: string }>;
		update: Record<string, unknown>;
	}) => Promise<unknown>;
}

export interface AdapterDelete {
	delete: (args: {
		model: string;
		where: Array<{ field: string; value: string }>;
	}) => Promise<unknown>;
}

export interface AdapterCount {
	count: (args: {
		model: string;
		where: Array<{ field: string; value: string }>;
	}) => Promise<number>;
}

export type FullAdapter = AdapterFindOne &
	AdapterFindMany &
	AdapterCreate &
	AdapterUpdate &
	AdapterDelete &
	AdapterCount;

import type { GenericEndpointContext } from "@better-auth/core";
import type { InferOptionSchema } from "better-auth/types";
import type { agentSchema } from "./schema";

/**
 * Capability definition — §4.
 *
 * Core fields are `name`, `description`, and optionally `input`
 * (a JSON Schema describing arguments for `POST /capability/execute`).
 *
 * Capabilities are executed through the server's execute endpoint.
 * Additional pass-through metadata (e.g. for direct client execution)
 * can be included via the index signature.
 */
export interface Capability {
	name: string;
	description: string;
	/**
	 * JSON Schema describing the `arguments` accepted by
	 * `POST /capability/execute` (§6.11).
	 */
	input?: Record<string, unknown>;
	grant_status?: "granted" | "not_granted";
	[key: string]: unknown;
}

/**
 * Returned from `onExecute` to signal an async capability (§4.1).
 * The server responds with `202 Accepted` and a polling URL.
 */
export interface AsyncExecuteResult {
	readonly __type: "async";
	statusUrl: string;
	retryAfter?: number;
}

/**
 * Returned from `onExecute` to signal a streaming capability (§4.1).
 * The server responds with `text/event-stream` SSE.
 */
export interface StreamExecuteResult {
	readonly __type: "stream";
	body: ReadableStream;
	headers?: Record<string, string>;
}

export type ExecuteResult = AsyncExecuteResult | StreamExecuteResult;

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
	defaultCapabilities: string[];
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
	capability: string;
	grantedBy: string | null;
	reason: string | null;
	expiresAt: Date | null;
	status: GrantStatus;
	createdAt: Date;
	updatedAt: Date;
}

/** Unified approval request for device authorization and CIBA flows. */
export interface ApprovalRequest {
	id: string;
	method: "device_authorization" | "ciba";
	agentId: string | null;
	hostId: string | null;
	userId: string | null;
	capabilities: string | null;
	status: "pending" | "approved" | "denied" | "expired";
	/** SHA-256 hash of the user_code (device authorization only). */
	userCodeHash: string | null;
	/** CIBA login hint (email). */
	loginHint: string | null;
	bindingMessage: string | null;
	clientNotificationToken: string | null;
	clientNotificationEndpoint: string | null;
	deliveryMode: string | null;
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
			capability: string;
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
		defaultCapabilities: string[];
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
	| "/capability/list"
	| "/capability/execute"
	| "/agent/status"
	| "/agent/introspect"
	| "/agent/grant-capability"
	| "/host/create"
	| "/host/enroll"
	| "/host/list"
	| "/host/get"
	| "/host/revoke"
	| "/host/update"
	| "/host/rotate-key"
	| "/agent/ciba/authorize"
	| "/agent/ciba/pending";

export interface DefaultHostCapabilitiesContext {
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
	 * Path or full URL for the device authorization approval page.
	 *
	 * The agent-auth plugin does not serve this page — your app must
	 * implement it. This option controls the `verification_uri` and
	 * `verification_uri_complete` returned by the device code flow.
	 *
	 * When a path is given (e.g. `"/approve"`), it is resolved against
	 * the server origin. When a full URL is given, it is used as-is.
	 *
	 * The page receives `agent_id` and `code` as query parameters.
	 *
	 * @default "/device/capabilities"
	 */
	deviceAuthorizationPage?: string;
	/**
	 * Supported approval methods (§9).
	 * @default ["ciba", "device_authorization"]
	 */
	approvalMethods?: string[];
	/**
	 * Resolve the approval method for a given context (§9.5).
	 *
	 * The `supportedMethods` array reflects the server's configured
	 * `approvalMethods`. The returned method **must** be one of them;
	 * if it isn't, `buildApprovalInfo` falls back to `device_authorization`.
	 *
	 * @default Prefers `device_authorization`; uses `ciba` only when
	 *          the agent explicitly passes `preferredMethod: "ciba"`
	 *          and the server supports it.
	 */
	resolveApprovalMethod?: (context: {
		userId: string | null;
		agentName: string;
		hostId: string | null;
		capabilities: string[];
		preferredMethod?: string;
		supportedMethods: string[];
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
	 * Require a valid agent JWT or host JWT to list or describe
	 * capabilities.
	 *
	 * When `true`, unauthenticated requests to `GET /capability/list`
	 * and `GET /capability/describe` receive a `401` with
	 * `error: "authentication_required"` and a `WWW-Authenticate`
	 * challenge header pointing to the discovery document. This
	 * guides AI agents to call `connect_agent` first.
	 *
	 * @default false
	 */
	requireAuthForCapabilities?: boolean;
	/**
	 * Allowed key algorithms for agent/host keypairs (§5.1).
	 * Use JWK curve names (`"Ed25519"`, `"P-256"`), **not** JWA identifiers.
	 * @default ["Ed25519"]
	 */
	allowedKeyAlgorithms?: string[];
	/**
	 * JWT claim format for keypair auth.
	 * - `"simple"` — flat claims: `sub`, `capabilities`, etc.
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
	 * Validate that requested capabilities exist (§10.6).
	 * When omitted, any string is accepted.
	 */
	validateCapabilities?: (
		capabilities: string[],
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
	 * Set to `0` to disable.
	 *
	 * When a function, receives the endpoint context and the list of
	 * capability IDs being approved so you can vary the requirement
	 * per-capability.
	 * @default 0 (disabled)
	 */
	freshSessionWindow?:
		| number
		| ((context: {
				ctx: GenericEndpointContext;
				capabilities: string[];
		  }) => number | Promise<number>);
	/**
	 * Whether to allow unknown hosts to register dynamically (§3.2).
	 * @default true
	 */
	allowDynamicHostRegistration?:
		| boolean
		| ((ctx: GenericEndpointContext) => boolean | Promise<boolean>);
	/**
	 * Default capabilities applied to newly created hosts (§3.2).
	 *
	 * Used as the fallback when a host is created without explicit
	 * `default_capabilities`, whether via dynamic registration or
	 * the `POST /host/create` endpoint.
	 *
	 * @default []
	 */
	defaultHostCapabilities?:
		| string[]
		| ((
				context: DefaultHostCapabilitiesContext,
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
		capability: string;
		agentId: string;
		hostId: string | null;
		userId: string | null;
	}) => number | null | undefined | Promise<number | null | undefined>;
	/**
	 * Capabilities that are always blocked from being granted (§10.6).
	 * @default []
	 */
	blockedCapabilities?: string[];
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
	/**
	 * Filter or augment capabilities based on the requesting user's context.
	 *
	 * Called by `GET /capability/list` and `GET /capability/describe`
	 * before returning results. Use this to show different capabilities
	 * to different users — e.g. admin-only capabilities, plan-gated
	 * features, or per-org capability sets.
	 *
	 * Receives the full capability list and whatever auth context is
	 * available (agent session, host session, or neither for
	 * unauthenticated requests).
	 *
	 * Return the capabilities the caller should see.
	 */
	resolveCapabilities?: (context: {
		capabilities: Capability[];
		query: string | null;
		agentSession: AgentSession | null;
		hostSession: HostSession | null;
	}) => Capability[] | Promise<Capability[]>;
	/**
	 * Custom query resolver for capability search (§6.2).
	 *
	 * When provided, completely replaces the built-in BM25-based
	 * matching against capability name and description. Use this to
	 * plug in your own logic — e.g. embedding-based semantic search,
	 * an external API, or a custom classifier.
	 *
	 * Return the filtered/ranked capabilities that match the query.
	 */
	resolveQuery?: (context: {
		query: string;
		capabilities: Capability[];
	}) => Capability[] | Promise<Capability[]>;
	/**
	 * Execute a capability on behalf of the agent (§6.11).
	 *
	 * Called by `POST /capability/execute`. The server validates the
	 * agent JWT and checks grants before invoking this handler.
	 *
	 * Return types determine the interaction mode:
	 * - **Plain value** → sync response (`{ data: result }`)
	 * - **`asyncResult(...)`** → `202 Accepted` with `status_url` for polling
	 * - **`streamResult(...)`** → SSE stream (`text/event-stream`)
	 *
	 * If not provided, the endpoint returns `501 Not Implemented`.
	 */
	onExecute?: (context: {
		ctx: GenericEndpointContext;
		capability: string;
		capabilityDef: Capability;
		arguments?: Record<string, unknown>;
		agentSession: AgentSession;
	}) => unknown | ExecuteResult | Promise<unknown | ExecuteResult>;
	/**
	 * Called when an autonomous agent is claimed (§3.4).
	 *
	 * Triggered when a previously unlinked host acquires a user_id,
	 * causing all active autonomous agents under it to be claimed.
	 * Use this to transfer resources, notify systems, or perform
	 * any application-specific cleanup.
	 */
	onAutonomousAgentClaimed?: (context: {
		ctx: GenericEndpointContext;
		agentId: string;
		hostId: string;
		userId: string;
		agentName: string;
		capabilities: string[];
	}) => void | Promise<void>;
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
		| "blockedCapabilities"
		| "modes"
		| "deviceAuthorizationPage"
		| "approvalMethods"
		| "resolveApprovalMethod"
		| "allowDynamicHostRegistration"
		| "defaultHostCapabilities"
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
	| "agent.claimed"
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
	| "approval.created"
	| "approval.approved"
	| "approval.denied";

export interface AgentAuthAuditEvent extends AgentAuthEventBase {
	type: AgentAuthAuditEventType;
}

export interface AgentAuthCapabilityExecutionEvent extends AgentAuthEventBase {
	type: "capability.executed";
	capability: string;
	provider?: string;
	agentName?: string;
	userId?: string;
	arguments?: Record<string, unknown>;
	output?: unknown;
	status: "success" | "error";
	durationMs?: number;
	error?: string;
}

export type AgentAuthEvent = AgentAuthAuditEvent | AgentAuthCapabilityExecutionEvent;

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

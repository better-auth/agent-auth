/** Ed25519 JWK (or other supported key types). */
export interface AgentJWK {
	kty: string;
	crv?: string;
	x?: string;
	d?: string;
	kid?: string;
	[key: string]: unknown;
}

export interface Keypair {
	publicKey: AgentJWK;
	privateKey: AgentJWK;
}

/**
 * Required approval strength for a capability (§8.11).
 *
 * - `"none"` — auto-grant, no user interaction required.
 * - `"session"` — requires an active user session (device auth / CIBA).
 * - `"webauthn"` — requires proof of physical presence via WebAuthn.
 */
export type ApprovalStrength = "none" | "session" | "webauthn";

/** Capability definition — §4. */
export interface Capability {
	name: string;
	description: string;
	/**
	 * The URL where this capability is executed (§2.15).
	 * The client sends the execute request to this URL and sets the
	 * JWT `aud` claim to match it. If absent, the client uses the
	 * server's `default_location` from discovery.
	 */
	location?: string;
	/**
	 * JSON Schema describing the `arguments` accepted by
	 * `POST /capability/execute` (§5.11).
	 */
	input?: Record<string, unknown>;
	/**
	 * Required approval strength (§8.11).
	 * `"webauthn"` requires physical presence (fingerprint, face, hardware key).
	 */
	approvalStrength?: ApprovalStrength;
	/**
	 * JSON Schema describing the shape of the data returned when
	 * this capability executes successfully (§2.12).
	 */
	output?: Record<string, unknown>;
	grant_status?: "granted" | "not_granted";
	[key: string]: unknown;
}

/** A single request within a batch execute call. */
export interface BatchExecuteRequest {
	/** Client-assigned ID for correlating responses. Auto-generated if omitted. */
	id?: string;
	/** Capability to execute. */
	capability: string;
	/** Arguments for the capability. */
	arguments?: Record<string, unknown>;
}

/** A single response item within a batch execute result. */
export interface BatchExecuteResponseItem {
	/** Correlation ID matching the request. */
	id: string;
	/** Whether this individual request succeeded or failed. */
	status: "completed" | "failed";
	/** Result data (when status is "completed"). */
	data?: unknown;
	/** Error details (when status is "failed"). */
	error?: { code?: string; message?: string };
}

/** Response from POST /capability/batch-execute. */
export interface BatchExecuteResponse {
	responses: BatchExecuteResponseItem[];
}

/** Response from POST /capabilities/execute (§6.11). */
export interface ExecuteCapabilityResponse {
	/** Sync result payload. */
	data?: unknown;
	/** Async status: "pending", "completed", or "failed". */
	status?: "pending" | "completed" | "failed";
	/** Polling URL for async results. */
	status_url?: string;
	/** Async result payload (when status is "completed"). */
	result?: unknown;
	/** Error details (when status is "failed"). */
	error?: { code?: string; message?: string };
}

export type AgentMode = "delegated" | "autonomous";

export type AgentStatus =
	| "active"
	| "pending"
	| "expired"
	| "revoked"
	| "rejected"
	| "claimed";

/** Primitive types allowed in constraint operator values (§2.13). */
export type ConstraintPrimitive = string | number | boolean;

/** Named constraint operators for a single field (§2.13). */
export interface ConstraintOperators {
	eq?: ConstraintPrimitive;
	min?: number;
	max?: number;
	in?: ConstraintPrimitive[];
	not_in?: ConstraintPrimitive[];
}

/** Constraint for a single capability argument field. */
export type ConstraintValue = ConstraintPrimitive | ConstraintOperators;

/** Scoped constraints applied to a capability grant (§2.13). */
export type CapabilityConstraints = Record<string, ConstraintValue>;

/**
 * Capability request item — either a plain string (unconstrained)
 * or an object with constraints (§2.13).
 */
export type CapabilityRequestItem = string | {
	name: string;
	constraints?: CapabilityConstraints;
};

export interface CapabilityGrant {
	capability: string;
	status: "active" | "pending" | "denied" | "revoked";
	granted_by?: string | null;
	constraints?: CapabilityConstraints | null;
	description?: string;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	reason?: string;
}

/** Discovery response — §6.1. */
export interface ProviderConfig {
	version: string;
	provider_name: string;
	description: string;
	issuer: string;
	/**
	 * Default URL where capability execution requests are sent (§2.15).
	 * Capabilities without their own `location` are executed here.
	 * If absent, derived as `{issuer}{endpoints.execute}`.
	 */
	default_location?: string;
	algorithms: string[];
	modes: AgentMode[];
	approval_methods: string[];
	proof_of_presence_methods?: string[];
	endpoints: Record<string, string>;
	capabilities?: Capability[];
	jwks_uri?: string;
}

/** Approval info returned when registration or capability request is pending. */
export interface ApprovalInfo {
	method: string;
	verification_uri?: string;
	verification_uri_complete?: string;
	user_code?: string;
	expires_in: number;
	interval: number;
	notification_url?: string;
}

/** Registration response from POST /agent/register — §6.3. */
export interface RegisterResponse {
	agent_id: string;
	host_id: string;
	name: string;
	mode: AgentMode;
	status: AgentStatus;
	agent_capability_grants: CapabilityGrant[];
	approval?: ApprovalInfo;
}

/** Status response from GET /agent/status — §6.5. */
export interface StatusResponse {
	agent_id: string;
	name: string;
	host_id: string;
	status: AgentStatus;
	agent_capability_grants: CapabilityGrant[];
	mode: AgentMode;
	activated_at?: string | null;
	created_at?: string;
	last_used_at?: string | null;
	expires_at?: string | null;
}

/** Request-capability response from POST /agent/request-capability — §6.4. */
export interface RequestCapabilityResponse {
	agent_id: string;
	status: "granted" | "pending";
	agent_capability_grants: CapabilityGrant[];
	approval?: ApprovalInfo;
}

/** Introspect response from POST /agent/introspect — §6.11. */
export interface IntrospectResponse {
	active: boolean;
	agent_id?: string;
	host_id?: string;
	user_id?: string | null;
	agent_capability_grants?: CapabilityGrant[];
	mode?: AgentMode;
	expires_at?: string | null;
}

/** Agent session response from GET /agent/session. */
export interface AgentSessionResponse {
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
		createdAt: string;
		activatedAt: string | null;
		metadata: Record<string, string | number | boolean | null> | null;
	};
	host: {
		id: string;
		userId: string | null;
		status: string;
	} | null;
	user: {
		id: string;
		name: string;
		email: string;
		[key: string]: unknown;
	};
}

/** Enroll host response from POST /host/enroll. */
export interface EnrollHostResponse {
	hostId: string;
	name: string;
	default_capabilities: string[];
	status: string;
}

/** A capability enriched with its provider identity for cross-provider search results. */
export interface CapabilitySearchResult extends Capability {
	provider: string;
	issuer: string;
}

/** Capabilities list response from GET /capabilities — §6.2. */
export interface CapabilitiesResponse {
	capabilities: Capability[];
	has_more: boolean;
	next_cursor?: string | null;
}

/** Locally-stored agent connection state. */
export interface AgentConnection {
	agentId: string;
	hostId: string;
	hostName?: string | null;
	providerName: string;
	issuer: string;
	mode: AgentMode;
	agentKeypair: Keypair;
	capabilityGrants: CapabilityGrant[];
	createdAt: number;
}

/** Locally-stored host identity — one per client, shared across all providers. */
export interface HostIdentity {
	keypair: Keypair;
	createdAt: number;
}

/**
 * Pluggable storage interface for persisting host identity
 * and agent connections across sessions.
 */
export interface Storage {
	getHostIdentity(): Promise<HostIdentity | null>;
	setHostIdentity(host: HostIdentity): Promise<void>;
	deleteHostIdentity(): Promise<void>;

	getAgentConnection(agentId: string): Promise<AgentConnection | null>;
	setAgentConnection(
		agentId: string,
		conn: AgentConnection,
	): Promise<void>;
	deleteAgentConnection(agentId: string): Promise<void>;
	listAgentConnections(): Promise<AgentConnection[]>;

	getProviderConfig(issuer: string): Promise<ProviderConfig | null>;
	setProviderConfig(
		issuer: string,
		config: ProviderConfig,
	): Promise<void>;
	listProviderConfigs(): Promise<ProviderConfig[]>;
}

export interface ProviderInfo {
	name: string;
	description: string;
	issuer?: string;
}

/** Options for creating the AgentAuthClient. */
export interface AgentAuthClientOptions {
	/**
	 * Pluggable storage backend.
	 * @default MemoryStorage
	 */
	storage?: Storage;
	/**
	 * Registry URL for `searchProviders`.
	 * If not provided, `searchProviders` is unavailable.
	 */
	registryUrl?: string;
	/**
	 * Allow direct discovery from arbitrary URLs
	 * (`.well-known/agent-configuration`).
	 *
	 * When `false` and a `registryUrl` is set, `discoverProvider` will
	 * only resolve providers through the registry — never fetch from
	 * untrusted endpoints. This prevents agents from being tricked
	 * into connecting to malicious services.
	 *
	 * @default true when no registryUrl, false when registryUrl is set
	 */
	allowDirectDiscovery?: boolean;
	/**
	 * Pre-configured providers. Skips discovery for these.
	 */
	providers?: ProviderConfig[];
	/**
	 * Custom fetch implementation. Defaults to globalThis.fetch.
	 */
	fetch?: typeof globalThis.fetch;
	/**
	 * Default JWT expiry in seconds.
	 * @default 60
	 */
	jwtExpirySeconds?: number;
	/**
	 * Host name to report in host JWTs (§8.1).
	 * Auto-detected if omitted.
	 */
	hostName?: string;
	/**
	 * Called when approval is required. The client should present
	 * the approval info to the user (open browser, display code, etc.).
	 */
	onApprovalRequired?: (info: ApprovalInfo) => void | Promise<void>;
	/**
	 * Called when approval polling status changes.
	 */
	onApprovalStatusChange?: (status: AgentStatus) => void | Promise<void>;
	/**
	 * Max time in ms to poll for approval before timing out.
	 * @default 300_000 (5 minutes)
	 */
	approvalTimeoutMs?: number;
}

/** Error returned by the server (Agent Auth Protocol §5.13). */
export interface AgentAuthError {
	error: string;
	message: string;
	status: number;
}

export class AgentAuthSDKError extends Error {
	public readonly code: string;
	public readonly status: number;

	constructor(code: string, message: string, status: number = 0) {
		super(message);
		this.name = "AgentAuthSDKError";
		this.code = code;
		this.status = status;
	}

	static fromResponse(
		body: {
			error?: string;
			message?: string;
		},
		status: number,
	): AgentAuthSDKError {
		return new AgentAuthSDKError(
			body.error || "unknown_error",
			body.message || "Unknown error",
			status,
		);
	}
}

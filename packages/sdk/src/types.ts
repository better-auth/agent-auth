/** Ed25519 JWK (or other supported key types). */
export interface AgentJWK {
	crv?: string;
	d?: string;
	kid?: string;
	kty: string;
	x?: string;
	[key: string]: unknown;
}

export interface Keypair {
	privateKey: AgentJWK;
	publicKey: AgentJWK;
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
	/**
	 * Required approval strength (§8.11).
	 * `"webauthn"` requires physical presence (fingerprint, face, hardware key).
	 */
	approvalStrength?: ApprovalStrength;
	description: string;
	grant_status?: "granted" | "not_granted";
	/**
	 * JSON Schema describing the `arguments` accepted by
	 * `POST /capability/execute` (§5.11).
	 */
	input?: Record<string, unknown>;
	/**
	 * The URL where this capability is executed (§2.15).
	 * The client sends the execute request to this URL and sets the
	 * JWT `aud` claim to match it. If absent, the client uses the
	 * server's `default_location` from discovery.
	 */
	location?: string;
	name: string;
	/**
	 * JSON Schema describing the shape of the data returned when
	 * this capability executes successfully (§2.12).
	 */
	output?: Record<string, unknown>;
	[key: string]: unknown;
}

/** Response from POST /capabilities/execute (§6.11). */
export interface ExecuteCapabilityResponse {
	/** Sync result payload. */
	data?: unknown;
	/** Error details (when status is "failed"). */
	error?: { code?: string; message?: string };
	/** Async result payload (when status is "completed"). */
	result?: unknown;
	/** Async status: "pending", "completed", or "failed". */
	status?: "pending" | "completed" | "failed";
	/** Polling URL for async results. */
	status_url?: string;
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
	in?: ConstraintPrimitive[];
	max?: number;
	min?: number;
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
export type CapabilityRequestItem =
	| string
	| {
			name: string;
			constraints?: CapabilityConstraints;
	  };

export interface CapabilityGrant {
	capability: string;
	constraints?: CapabilityConstraints | null;
	description?: string;
	granted_by?: string | null;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	reason?: string;
	status: "active" | "pending" | "denied" | "revoked";
}

/** Discovery response — §6.1. */
export interface ProviderConfig {
	algorithms: string[];
	approval_methods: string[];
	capabilities?: Capability[];
	/**
	 * Default URL where capability execution requests are sent (§2.15).
	 * Capabilities without their own `location` are executed here.
	 * If absent, derived as `{issuer}{endpoints.execute}`.
	 */
	default_location?: string;
	description: string;
	endpoints: Record<string, string>;
	issuer: string;
	jwks_uri?: string;
	modes: AgentMode[];
	proof_of_presence_methods?: string[];
	provider_name: string;
	version: string;
}

/** Approval info returned when registration or capability request is pending. */
export interface ApprovalInfo {
	expires_in: number;
	interval: number;
	method: string;
	notification_url?: string;
	user_code?: string;
	verification_uri?: string;
	verification_uri_complete?: string;
}

/** Registration response from POST /agent/register — §6.3. */
export interface RegisterResponse {
	agent_capability_grants: CapabilityGrant[];
	agent_id: string;
	approval?: ApprovalInfo;
	host_id: string;
	mode: AgentMode;
	name: string;
	status: AgentStatus;
}

/** Status response from GET /agent/status — §6.5. */
export interface StatusResponse {
	activated_at?: string | null;
	agent_capability_grants: CapabilityGrant[];
	agent_id: string;
	created_at?: string;
	expires_at?: string | null;
	host_id: string;
	last_used_at?: string | null;
	mode: AgentMode;
	name: string;
	status: AgentStatus;
}

/** Request-capability response from POST /agent/request-capability — §6.4. */
export interface RequestCapabilityResponse {
	agent_capability_grants: CapabilityGrant[];
	agent_id: string;
	approval?: ApprovalInfo;
	status: "granted" | "pending";
}

/** Introspect response from POST /agent/introspect — §6.11. */
export interface IntrospectResponse {
	active: boolean;
	agent_capability_grants?: CapabilityGrant[];
	agent_id?: string;
	expires_at?: string | null;
	host_id?: string;
	mode?: AgentMode;
	user_id?: string | null;
}

/** Agent session response from GET /agent/session. */
export interface AgentSessionResponse {
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
	type: AgentMode;
	user: {
		id: string;
		name: string;
		email: string;
		[key: string]: unknown;
	};
}

/** Enroll host response from POST /host/enroll. */
export interface EnrollHostResponse {
	default_capabilities: string[];
	hostId: string;
	name: string;
	status: string;
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
	agentKeypair: Keypair;
	capabilityGrants: CapabilityGrant[];
	createdAt: number;
	hostId: string;
	hostName?: string | null;
	issuer: string;
	mode: AgentMode;
	providerName: string;
}

/** Locally-stored host identity — one per client, shared across all providers. */
export interface HostIdentity {
	createdAt: number;
	keypair: Keypair;
}

/**
 * Pluggable storage interface for persisting host identity
 * and agent connections across sessions.
 */
export interface Storage {
	deleteAgentConnection(agentId: string): Promise<void>;
	deleteHostIdentity(): Promise<void>;

	getAgentConnection(agentId: string): Promise<AgentConnection | null>;
	getHostIdentity(): Promise<HostIdentity | null>;

	getProviderConfig(issuer: string): Promise<ProviderConfig | null>;
	listAgentConnections(issuer: string): Promise<AgentConnection[]>;
	listProviderConfigs(): Promise<ProviderConfig[]>;
	setAgentConnection(agentId: string, conn: AgentConnection): Promise<void>;
	setHostIdentity(host: HostIdentity): Promise<void>;
	setProviderConfig(issuer: string, config: ProviderConfig): Promise<void>;
}

export interface ProviderInfo {
	description: string;
	issuer?: string;
	name: string;
}

/** Options for creating the AgentAuthClient. */
export interface AgentAuthClientOptions {
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
	 * Max time in ms to poll for approval before timing out.
	 * @default 300_000 (5 minutes)
	 */
	approvalTimeoutMs?: number;
	/**
	 * Custom fetch implementation. Defaults to globalThis.fetch.
	 */
	fetch?: typeof globalThis.fetch;
	/**
	 * Host name to report in host JWTs (§8.1).
	 * Auto-detected if omitted.
	 */
	hostName?: string;
	/**
	 * Default JWT expiry in seconds.
	 * @default 60
	 */
	jwtExpirySeconds?: number;
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
	 * Pre-configured providers. Skips discovery for these.
	 */
	providers?: ProviderConfig[];
	/**
	 * Registry URL for `searchProviders`.
	 * If not provided, `searchProviders` is unavailable.
	 */
	registryUrl?: string;
	/**
	 * Pluggable storage backend.
	 * @default MemoryStorage
	 */
	storage?: Storage;
}

/** Error returned by the server (RFC 6749 §5.2). */
export interface AgentAuthError {
	error: string;
	error_description: string;
	status: number;
}

export class AgentAuthSDKError extends Error {
	public readonly code: string;
	public readonly status: number;

	constructor(code: string, message: string, status = 0) {
		super(message);
		this.name = "AgentAuthSDKError";
		this.code = code;
		this.status = status;
	}

	static fromResponse(
		body: { error?: string; error_description?: string },
		status: number
	): AgentAuthSDKError {
		return new AgentAuthSDKError(
			body.error || "unknown_error",
			body.error_description || "Unknown error",
			status
		);
	}
}

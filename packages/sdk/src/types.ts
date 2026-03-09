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

/** Capability definition — §4. */
export interface Capability {
	name: string;
	description: string;
	/**
	 * JSON Schema describing the `arguments` accepted by
	 * `POST /capabilities/execute` (§6.11).
	 */
	input?: Record<string, unknown>;
	grant_status?: "granted" | "not_granted";
	/** Direct execution metadata — §4.2. */
	http?: HttpDescriptor;
	[key: string]: unknown;
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

export interface CapabilityGrant {
	capability: string;
	status: "active" | "pending" | "denied";
	granted_by?: string | null;
}

/** Discovery response — §6.1. */
export interface ProviderConfig {
	version: string;
	provider_name: string;
	description: string;
	issuer: string;
	algorithms: string[];
	modes: AgentMode[];
	approval_methods: string[];
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
	host_name?: string | null;
	mode: AgentMode;
	status: AgentStatus;
	agent_capability_grants: CapabilityGrant[];
	approval?: ApprovalInfo;
}

/** Status response from GET /agent/status — §6.5. */
export interface StatusResponse {
	agent_id: string;
	host_id: string;
	status: AgentStatus;
	agent_capability_grants: CapabilityGrant[];
	mode: AgentMode;
	user_id?: string | null;
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
	listAgentConnections(issuer: string): Promise<AgentConnection[]>;

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

/** Error returned by the server. */
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

	static fromResponse(body: { error?: string; message?: string; code?: string }, status: number): AgentAuthSDKError {
		return new AgentAuthSDKError(
			body.error || body.code || "unknown_error",
			body.message || "Unknown error",
			status,
		);
	}
}

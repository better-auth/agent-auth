import type {
	AgentAuthAuditEventType,
	AgentAuthEvent,
	AgentMode,
	AgentSession,
	ApprovalStrength,
	Capability,
	CapabilityConstraints,
	Constraints,
	ExecuteResult,
	FullAdapter,
	HostSession,
} from "../types";

export interface SecondaryStorage {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
}

export interface ServerEndpointContext {
	request: Request;
	headers: Headers;
	body: Record<string, unknown>;
	query: Record<string, string>;
	adapter: FullAdapter;
	baseURL: string;
}

export interface UserRecord {
	id: string;
	name: string;
	email: string;
	[key: string]: unknown;
}

export interface UserSession {
	user: UserRecord;
	session: {
		createdAt: Date;
		[key: string]: unknown;
	};
}

export interface DefaultHostCapabilitiesContext {
	ctx: ServerEndpointContext;
	mode: AgentMode;
	userId: string | null;
	hostId: string | null;
	hostName: string | null;
}

export interface AgentAuthServerOptions {
	adapter: FullAdapter;
	baseURL: string;
	findUserById: (id: string) => Promise<UserRecord | null>;
	findUserByEmail: (email: string) => Promise<UserRecord | null>;
	getSession: (request: Request) => Promise<UserSession | null>;
	secondaryStorage?: SecondaryStorage;

	providerName?: string;
	providerDescription?: string;
	modes?: AgentMode[];
	deviceAuthorizationPage?: string;
	approvalMethods?: string[];
	resolveApprovalMethod?: (context: {
		userId: string | null;
		agentName: string;
		hostId: string | null;
		capabilities: string[];
		preferredMethod?: string;
		supportedMethods: string[];
	}) => string | Promise<string>;
	jwksUri?: string;
	capabilities?: Capability[];
	requireAuthForCapabilities?: boolean;
	allowedKeyAlgorithms?: string[];
	jwtFormat?: "simple" | "aap";
	jwtMaxAge?: number;
	agentSessionTTL?: number;
	validateCapabilities?: (
		capabilities: string[],
	) => boolean | Promise<boolean>;
	maxAgentsPerUser?: number;
	agentMaxLifetime?: number;
	absoluteLifetime?: number;
	freshSessionWindow?:
		| number
		| ((context: {
				ctx: ServerEndpointContext;
				capabilities: string[];
		  }) => number | Promise<number>);
	allowDynamicHostRegistration?:
		| boolean
		| ((ctx: ServerEndpointContext) => boolean | Promise<boolean>);
	defaultHostCapabilities?:
		| string[]
		| ((
				context: DefaultHostCapabilitiesContext,
		  ) => string[] | Promise<string[]>);
	resolveAutonomousUser?: (context: {
		ctx: ServerEndpointContext;
		hostId: string;
		hostName: string | null;
		agentId: string;
		agentMode: AgentMode;
	}) => { id: string; name: string; email: string } | null | Promise<{ id: string; name: string; email: string } | null>;
	onHostClaimed?: (context: {
		ctx: ServerEndpointContext;
		hostId: string;
		userId: string;
		previousUserId: string | null;
	}) => void | Promise<void>;
	resolveGrantTTL?: (context: {
		capability: string;
		agentId: string;
		hostId: string | null;
		userId: string | null;
	}) => number | null | undefined | Promise<number | null | undefined>;
	blockedCapabilities?: string[];
	jtiCacheStorage?: "memory" | "secondary-storage";
	jwksCacheStorage?: "memory" | "secondary-storage";
	dangerouslySkipJtiCheck?: boolean;
	trustProxy?: boolean;
	proofOfPresence?: {
		enabled?: boolean;
		rpId?: string;
		origin?: string | string[];
	};
	onEvent?: (event: AgentAuthEvent) => void | Promise<void>;
	resolveCapabilities?: (context: {
		capabilities: Capability[];
		query: string | null;
		agentSession: AgentSession | null;
		hostSession: HostSession | null;
	}) => Capability[] | Promise<Capability[]>;
	resolveQuery?: (context: {
		query: string;
		capabilities: Capability[];
	}) => Capability[] | Promise<Capability[]>;
	onExecute?: (context: {
		ctx: ServerEndpointContext;
		capability: string;
		capabilityDef: Capability;
		arguments?: Record<string, unknown>;
		agentSession: AgentSession;
	}) => unknown | ExecuteResult | Promise<unknown | ExecuteResult>;
	onAutonomousAgentClaimed?: (context: {
		ctx: ServerEndpointContext;
		agentId: string;
		hostId: string;
		userId: string;
		agentName: string;
		capabilities: string[];
	}) => void | Promise<void>;
	/**
	 * Base path prefix for all agent-auth routes.
	 * All routes will be mounted under this prefix.
	 * @default "/api/auth"
	 */
	basePath?: string;
}

export interface ResolvedProofOfPresence {
	enabled: boolean;
	rpId: string;
	origin: string[];
}

export type ResolvedServerOptions = Required<
	Pick<
		AgentAuthServerOptions,
		| "adapter"
		| "baseURL"
		| "findUserById"
		| "findUserByEmail"
		| "getSession"
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
		| "trustProxy"
		| "basePath"
	>
> & {
	proofOfPresence: ResolvedProofOfPresence;
} & AgentAuthServerOptions;

export interface RouteContext {
	request: Request;
	headers: Headers;
	body: Record<string, unknown>;
	query: Record<string, string>;
	path: string;
	adapter: FullAdapter;
	baseURL: string;
	opts: ResolvedServerOptions;
	agentSession: AgentSession | null;
	hostSession: HostSession | null;
	userSession: UserSession | null;
	responseHeaders: Record<string, string>;
}

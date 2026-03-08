export { AgentAuthClient } from "./client";
export { MemoryStorage } from "./storage";
export { generateKeypair, signHostJWT, signAgentJWT } from "./crypto";
export { discoverProvider, searchProviders } from "./discovery";
export { executeHttpCapability } from "./http";
export { AgentAuthSDKError } from "./types";

export type {
	AgentJWK,
	Keypair,
	HttpParameter,
	HttpRequestBody,
	HttpDescriptor,
	Capability,
	AgentMode,
	AgentStatus,
	CapabilityGrant,
	ProviderConfig,
	ApprovalInfo,
	RegisterResponse,
	StatusResponse,
	RequestCapabilityResponse,
	IntrospectResponse,
	CapabilitiesResponse,
	AgentSessionResponse,
	EnrollHostResponse,
	AgentConnection,
	HostIdentity,
	Storage,
	ProviderInfo,
	AgentAuthClientOptions,
	AgentAuthError,
} from "./types";

export type {
	SignHostJWTOptions,
	SignAgentJWTOptions,
} from "./crypto";

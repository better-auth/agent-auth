export { AgentAuthClient } from "./client";
export { MemoryStorage } from "./storage";
export { generateKeypair, signHostJWT, signAgentJWT } from "./crypto";
export { discoverProvider, searchProviders, searchRegistryFull, lookupByUrl } from "./discovery";
export { detectHostName, detectTool } from "./host-name";
export { AgentAuthSDKError } from "./types";
export { getAgentAuthTools, toOpenAITools, toAISDKTools } from "./tools";

export type {
	AgentJWK,
	Keypair,
	Capability,
	ApprovalStrength,
	AgentMode,
	AgentStatus,
	CapabilityGrant,
	CapabilityConstraints,
	CapabilityRequestItem,
	ConstraintPrimitive,
	ConstraintOperators,
	ConstraintValue,
	ProviderConfig,
	ApprovalInfo,
	RegisterResponse,
	StatusResponse,
	RequestCapabilityResponse,
	IntrospectResponse,
	ExecuteCapabilityResponse,
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

export type { ToolDetection } from "./host-name";
export type {
	AgentAuthTool,
	ToolParameters,
	ToolContext,
	OpenAIToolDefinition,
	OpenAITools,
	AISDKTool,
} from "./tools";

export { AgentAuthClient } from "./client";
export type {
	SignAgentJWTOptions,
	SignHostJWTOptions,
} from "./crypto";
export { generateKeypair, signAgentJWT, signHostJWT } from "./crypto";
export {
	discoverProvider,
	lookupByUrl,
	searchProviders,
	searchRegistryFull,
} from "./discovery";
export type { ToolDetection } from "./host-name";
export { detectHostName, detectTool } from "./host-name";
export { MemoryStorage } from "./storage";
export type {
	AgentAuthTool,
	AISDKTool,
	AISDKToolsOptions,
	AnthropicToolDefinition,
	AnthropicToolResultBlock,
	AnthropicTools,
	AnthropicToolUseBlock,
	FilterToolsOptions,
	OpenAIToolDefinition,
	OpenAITools,
	OpenAIToolsOptions,
	ToolContext,
	ToolErrorResult,
	ToolParameters,
} from "./tools";
export {
	filterTools,
	getAgentAuthTools,
	toAISDKTools,
	toAnthropicTools,
	toOpenAITools,
} from "./tools";
export type {
	AgentAuthClientOptions,
	AgentAuthError,
	AgentConnection,
	AgentJWK,
	AgentMode,
	AgentSessionResponse,
	AgentStatus,
	ApprovalInfo,
	ApprovalStrength,
	CapabilitiesResponse,
	Capability,
	CapabilityConstraints,
	CapabilityGrant,
	CapabilityRequestItem,
	ConstraintOperators,
	ConstraintPrimitive,
	ConstraintValue,
	EnrollHostResponse,
	ExecuteCapabilityResponse,
	HostIdentity,
	IntrospectResponse,
	Keypair,
	ProviderConfig,
	ProviderInfo,
	RegisterResponse,
	RequestCapabilityResponse,
	StatusResponse,
	Storage,
} from "./types";
export { AgentAuthSDKError } from "./types";

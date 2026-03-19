export { AgentAuthClient } from "./client";
export { MemoryStorage } from "./storage";
export { generateKeypair, signHostJWT, signAgentJWT } from "./crypto";
export { discoverProvider, searchProviders, searchDirectoryFull, lookupByUrl } from "./discovery";
export { detectHostName, detectTool } from "./host-name";
export { matchQuery, matchQueryScored } from "./search";
export type { ScoredMatch } from "./search";
export { AgentAuthSDKError } from "./types";
export { getAgentAuthTools, filterTools, toOpenAITools, toAISDKTools, toAnthropicTools } from "./tools";
export { SERVER_INSTRUCTIONS } from "./instructions";

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
  BatchExecuteRequest,
  BatchExecuteResponseItem,
  BatchExecuteResponse,
  CapabilitiesResponse,
  AgentSessionResponse,
  CapabilitySearchResult,
  EnrollHostResponse,
  AgentConnection,
  HostIdentity,
  Storage,
  ProviderInfo,
  AgentAuthClientOptions,
  AgentAuthError,
} from "./types";

export type { SignHostJWTOptions, SignAgentJWTOptions } from "./crypto";

export type { ToolDetection } from "./host-name";
export type {
  AgentAuthTool,
  ToolAnnotations,
  ToolParameters,
  ToolContext,
  ToolErrorResult,
  FilterToolsOptions,
  OpenAIToolDefinition,
  OpenAITools,
  OpenAIToolsOptions,
  AISDKTool,
  AISDKToolsOptions,
  AnthropicToolDefinition,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  AnthropicTools,
} from "./tools";

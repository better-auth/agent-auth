// Crypto

export type {
	AgentClientOptions,
	ConnectAgentOptions,
	ConnectAgentResult,
	ConnectAgentViaCibaOptions,
	EnrollHostOptions,
	EnrollHostResult,
} from "./agent-client";
// Agent client
export {
	connectAgent,
	connectAgentViaCiba,
	createAgentClient,
	enrollHost,
} from "./agent-client";
export type {
	AgentJWK,
	RequestBinding,
	SignAgentJWTOptions,
	VerifyAgentJWTOptions,
} from "./crypto";
export {
	generateAgentKeypair,
	hashRequestBody,
	signAgentJWT,
	verifyAgentJWT,
} from "./crypto";
export type { ToolDetection } from "./host-name";
// Host name & tool detection
export { detectHostName, detectTool } from "./host-name";
export type {
	AgentConnectionData,
	AgentKeypair,
	AgentMCPToolsResult,
	Capability,
	CreateAgentMCPToolsOptions,
	MCPAgentStorage,
	MCPToolDefinition,
	ProviderConfig,
} from "./mcp-tools";
// MCP tools
export {
	createAgentMCPTools,
	getAgentAuthInstructions,
} from "./mcp-tools";

// Types
export type { AgentMetadata, AgentSession } from "./types";

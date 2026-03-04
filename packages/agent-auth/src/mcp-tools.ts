/**
 * Re-export from @auth/agents for backwards compatibility.
 * Import directly from "@auth/agents/mcp-tools" for new code.
 */

export type {
	AgentConnectionData,
	AgentKeypair,
	AgentMCPToolsResult,
	CreateAgentMCPToolsOptions,
	MCPAgentStorage,
	MCPToolDefinition,
} from "@auth/agents/mcp-tools";
export {
	createAgentMCPTools,
	getAgentAuthInstructions,
} from "@auth/agents/mcp-tools";

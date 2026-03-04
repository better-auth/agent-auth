/**
 * Re-export from @auth/agents.
 * Import directly from "@auth/agents/mcp-server" for new code.
 */

export type {
	MCPAgentStorage,
	MCPServerOptions,
} from "@auth/agents/mcp-server";
export { createMCPServer } from "@auth/agents/mcp-server";

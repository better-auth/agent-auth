/**
 * Built-in provider bridge defaults.
 *
 * For well-known providers, we know the MCP endpoint and how
 * OAuth tokens are passed — users just need to pass the name.
 *
 * Add more entries here as providers publish stable MCP endpoints.
 */

import type { ProviderBridgeConfig } from "./types";

export const defaultBridges: Record<string, ProviderBridgeConfig> = {
	github: {
		transport: "http",
		mcpEndpoint: "https://api.githubcopilot.com/mcp/",
		getAuthHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
	},
};

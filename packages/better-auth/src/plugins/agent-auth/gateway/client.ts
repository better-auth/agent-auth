import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { mcpGateway } from ".";
import { AGENT_AUTH_ERROR_CODES } from "../error-codes";

export const mcpGatewayClient = () => {
	return {
		id: "mcp-gateway",
		$InferServerPlugin: {} as ReturnType<typeof mcpGateway>,
		pathMethods: {
			"/agent/mcp-provider/register": "POST",
			"/agent/mcp-provider/delete": "POST",
		},
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type MCPGatewayClientPlugin = ReturnType<typeof mcpGatewayClient>;

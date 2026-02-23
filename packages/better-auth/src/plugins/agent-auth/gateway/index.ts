import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "../../../db";
import { AGENT_AUTH_ERROR_CODES } from "../error-codes";
import { gatewaySchema } from "../gateway-schema";
import { gatewayConfig } from "../routes/gateway-config";
import {
	deleteProvider,
	listProviders,
	registerProvider,
} from "../routes/mcp-providers";
import type { MCPGatewayOptions, ResolvedMCPGatewayOptions } from "../types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"mcp-gateway": {
			creator: typeof mcpGateway;
		};
	}
}

function buildGatewayRateLimits(config: MCPGatewayOptions["rateLimit"]) {
	if (config === false) return [];
	const rl = typeof config === "object" ? config : {};
	const window = rl.window ?? 60;
	const max = rl.max ?? 60;
	const sensitiveMax = rl.sensitiveMax ?? 5;
	return [
		{
			pathMatcher(path: string) {
				return (
					path === "/agent/mcp-provider/register" ||
					path === "/agent/mcp-provider/delete"
				);
			},
			window,
			max: sensitiveMax,
		},
		{
			pathMatcher(path: string) {
				return (
					path.startsWith("/agent/mcp-provider/") ||
					path === "/agent/gateway-config"
				);
			},
			window,
			max,
		},
	];
}

export const mcpGateway = (options?: MCPGatewayOptions) => {
	const opts: ResolvedMCPGatewayOptions = {
		...options,
		providers: options?.providers ?? [],
	};

	const schema = mergeSchema(gatewaySchema(), opts.schema);

	return {
		id: "mcp-gateway",
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
		endpoints: {
			registerProvider: registerProvider(opts),
			listProviders: listProviders(),
			deleteProvider: deleteProvider(opts),
			gatewayConfig: gatewayConfig(opts),
		},
		rateLimit: buildGatewayRateLimits(options?.rateLimit),
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type { GatewayServerOptions } from "./create-gateway-server";
export { createGatewayServer, estimateTokens } from "./create-gateway-server";
export type {
	GatewayTool,
	GatewayToolResult,
	ProviderManager,
} from "./provider-manager";
export { createProviderManager } from "./provider-manager";
export type { ProviderInput } from "./providers";
export { registry, resolveProvider, resolveProviders } from "./providers";
export { getAllowedTools, isScopeAllowed } from "./scope-utils";

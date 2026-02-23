import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "../../db";
import { defaultBridges } from "./default-bridges";
import { AGENT_GATEWAY_ERROR_CODES } from "./error-codes";
import { createGatewayRoutes } from "./routes";
import { gatewaySchema } from "./schema";
import type {
	AgentGatewayOptions,
	ProviderBridgeConfig,
	ResolvedGatewayOptions,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"agent-gateway": {
			creator: typeof agentGateway;
		};
	}
}

export { AGENT_GATEWAY_ERROR_CODES } from "./error-codes";

function buildGatewayRateLimits(config: AgentGatewayOptions["rateLimit"]) {
	if (config === false) return [];
	const rl = typeof config === "object" ? config : {};
	const window = rl.window ?? 60;
	const max = rl.max ?? 60;
	const sensitiveMax = rl.sensitiveMax ?? 5;
	return [
		{
			pathMatcher(path: string) {
				return (
					path === "/agent/gateway/provider/register" ||
					path === "/agent/gateway/provider/delete"
				);
			},
			window,
			max: sensitiveMax,
		},
		{
			pathMatcher(path: string) {
				return (
					path.startsWith("/agent/gateway/") || path === "/agent/gateway-config"
				);
			},
			window,
			max,
		},
	];
}

/**
 * Agent Gateway plugin.
 *
 * Provides standardized API routes for agents to discover and call tools
 * through connected OAuth providers. Separate from agent authentication —
 * use alongside `agentAuth()` for the complete agent experience.
 *
 * The plugin:
 * - Looks up the user's connected OAuth accounts
 * - Bridges those accounts to provider MCP servers
 * - Enforces agent scope checks before tool execution
 * - Manages MCP provider registrations in the database
 *
 * @example
 * ```ts
 * import { agentAuth } from "better-auth/plugins/agent-auth";
 * import { agentGateway } from "better-auth/plugins/agent-gateway";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     agentAuth(),
 *     agentGateway({
 *       providers: ["github"],
 *       authorizeProviderManagement: (user) => user.role === "admin",
 *     }),
 *   ],
 * });
 * ```
 */
export const agentGateway = (options?: AgentGatewayOptions) => {
	const resolvedBridge: Record<string, ProviderBridgeConfig> = {};

	for (const input of options?.providers ?? []) {
		if (typeof input === "string") {
			const bridge = defaultBridges[input];
			if (!bridge) {
				const known = Object.keys(defaultBridges).join(", ");
				throw new Error(
					`Unknown provider "${input}". Known providers: ${known}. ` +
						`For custom providers, pass a config object: { name: "...", transport: "...", ... }`,
				);
			}
			resolvedBridge[input] = bridge;
		} else {
			const { name, ...config } = input;
			resolvedBridge[name] = config;
		}
	}

	const opts: ResolvedGatewayOptions = {
		...options,
		resolvedBridge,
	};

	const schema = mergeSchema(gatewaySchema(), opts.schema);
	const routes = createGatewayRoutes(opts, options);

	return {
		id: "agent-gateway",
		$ERROR_CODES: AGENT_GATEWAY_ERROR_CODES,
		endpoints: {
			gatewayTools: routes.gatewayTools,
			gatewayCall: routes.gatewayCall,
			registerGatewayProvider: routes.registerGatewayProvider,
			listGatewayProviders: routes.listGatewayProviders,
			deleteGatewayProvider: routes.deleteGatewayProvider,
			gatewayConfig: routes.gatewayConfig,
		},
		rateLimit: buildGatewayRateLimits(options?.rateLimit),
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type { GatewayServerOptions } from "./create-gateway-server";
export { createGatewayServer, estimateTokens } from "./create-gateway-server";
export { callTool, discoverTools, invalidateToolCache } from "./mcp-bridge";
export type {
	GatewayTool,
	GatewayToolResult,
	ProviderManager,
} from "./provider-manager";
export { createProviderManager } from "./provider-manager";
export type { ProviderInput } from "./providers";
export { registry, resolveProvider, resolveProviders } from "./providers";
export { getAllowedTools, isScopeAllowed } from "./scope-utils";
export type * from "./types";

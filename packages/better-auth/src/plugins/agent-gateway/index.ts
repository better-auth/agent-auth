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
 * import { agentAuth, agentGateway } from "better-auth/plugins";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     agentAuth(),
 *     agentGateway({
 *       providers: ["github"],
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
	const routes = createGatewayRoutes(opts);

	return {
		id: "agent-gateway",
		$ERROR_CODES: AGENT_GATEWAY_ERROR_CODES,
		endpoints: {
			gatewayTools: routes.gatewayTools,
			gatewayCall: routes.gatewayCall,
			registerGatewayProvider: routes.registerGatewayProvider,
			listGatewayProviders: routes.listGatewayProviders,
			deleteGatewayProvider: routes.deleteGatewayProvider,
		},
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
export { discoverTools, callTool, invalidateToolCache } from "./mcp-bridge";

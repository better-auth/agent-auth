import { createAuthEndpoint } from "@better-auth/core/api";
import type { AgentGatewayOptions } from "../types";

/**
 * Public endpoint that returns the gateway configuration.
 *
 * The MCP gateway process calls this on startup to discover
 * which providers are configured in the plugin. No auth required —
 * only returns provider names, no secrets.
 */
export function gatewayConfig(opts: AgentGatewayOptions) {
	const providers = (opts.providers ?? []).map((p) =>
		typeof p === "string" ? p : { name: p.name },
	);

	return createAuthEndpoint(
		"/agent/gateway-config",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"Returns gateway configuration for the MCP gateway process.",
				},
			},
		},
		async (ctx) => {
			return ctx.json({ providers });
		},
	);
}

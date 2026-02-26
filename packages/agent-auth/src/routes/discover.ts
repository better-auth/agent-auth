import { createAuthEndpoint } from "@better-auth/core/api";
import type { ResolvedAgentAuthOptions } from "../types";

/**
 * GET /agent/discover
 *
 * Discovery endpoint (§12, §17.4). Returns available scopes,
 * supported key algorithms, and other configuration.
 */
export function discover(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/discover",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"Discovery endpoint. Returns available scopes, supported algorithms, and configuration.",
				},
			},
		},
		async (ctx) => {
			const allScopeNames = opts.roles
				? [...new Set(Object.values(opts.roles).flat())]
				: [];

			return ctx.json({
				algorithms: opts.allowedKeyAlgorithms,
				scopes: allScopeNames.map((name) => ({
					name,
					description: name,
				})),
				roles: opts.roles ? Object.keys(opts.roles) : [],
				jwtMaxAge: opts.jwtMaxAge,
				sessionTTL: opts.agentSessionTTL,
				maxLifetime: opts.agentMaxLifetime,
				absoluteLifetime: opts.absoluteLifetime,
				blockedScopes: opts.blockedScopes,
			});
		},
	);
}

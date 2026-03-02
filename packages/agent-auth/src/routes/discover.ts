import { createAuthEndpoint } from "@better-auth/core/api";
import type { ResolvedAgentAuthOptions } from "../types";

/**
 * GET /agent/discover
 *
 * Discovery endpoint (§2.1). Returns the server's Agent Auth configuration
 * matching the well-known agent-configuration format.
 * No authentication required.
 */
export function discover(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/discover",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"Discovery endpoint. Returns the server's Agent Auth configuration (§2.1).",
				},
			},
		},
		async (ctx) => {
			const issuer = new URL(ctx.context.baseURL).origin;

			const endpoints: Record<string, string> = {
				register: "/agent/register",
				capabilities: "/agent/capabilities",
				request_scope: "/agent/request-scope",
				connect_account: "/agent/connect-account",
				status: "/agent/status",
				revoke: "/agent/revoke",
				revoke_host: "/agent/host/revoke",
				rotate_key: "/agent/rotate-key",
				rotate_host_key: "/agent/host/rotate-key",
				introspect: "/agent/introspect",
			};

			endpoints.device_authorization = "/device/code";
			endpoints.device_token = "/device/token";

			if (opts.approvalMethods.includes("ciba")) {
				endpoints.ciba_authorize = "/agent/ciba/authorize";
				endpoints.ciba_token = "/agent/ciba/token";
			}

			return ctx.json({
				protocol_version: "1.0-draft",
				provider_name: opts.providerName ?? "agent-auth",
				description: opts.providerDescription ?? "Agent Auth enabled service",
				issuer,
				algorithms: opts.allowedKeyAlgorithms,
				modes: opts.modes,
				approval_methods: opts.approvalMethods,
				endpoints,
				...(opts.jwksUri ? { jwks_uri: opts.jwksUri } : {}),
			});
		},
	);
}

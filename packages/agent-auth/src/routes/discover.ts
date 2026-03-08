import { createAuthEndpoint } from "@better-auth/core/api";
import type { ResolvedAgentAuthOptions } from "../types";

/**
 * GET /agent/agent-configuration (§6.1).
 *
 * Returns the Agent Auth discovery document. Users should expose this
 * at `/.well-known/agent-configuration` on their server root by calling
 * `auth.api.getAgentConfiguration()` from their own route handler.
 */
export function agentConfiguration(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/agent-configuration",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"Agent Auth discovery document (§6.1). Expose at /.well-known/agent-configuration.",
				},
			},
		},
		async (ctx) => {
			const issuer = new URL(ctx.context.baseURL).origin;

			const endpoints: Record<string, string> = {
				register: "/agent/register",
				capabilities: "/capabilities",
				request_capability: "/agent/request-capability",
				status: "/agent/status",
				revoke: "/agent/revoke",
				reactivate: "/agent/reactivate",
				revoke_host: "/host/revoke",
				rotate_key: "/agent/rotate-key",
				rotate_host_key: "/host/rotate-key",
				introspect: "/agent/introspect",
				device_authorization: "/device/code",
			};

			if (opts.approvalMethods.includes("ciba")) {
				endpoints.ciba_authorize = "/agent/ciba/authorize";
			}

			return ctx.json({
				version: "1.0-draft",
				provider_name: opts.providerName ?? "agent-auth",
				description:
					opts.providerDescription ??
					"Agent Auth enabled service",
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

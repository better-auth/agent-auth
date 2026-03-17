import { createAuthEndpoint } from "@better-auth/core/api";
import type { ResolvedAgentAuthOptions } from "../types";

/**
 * GET /agent-configuration (§6.1).
 *
 * Returns the Agent Auth discovery document. Users should expose this
 * at `/.well-known/agent-configuration` on their server root by calling
 * `auth.api.getAgentConfiguration()` from their own route handler.
 */
export function agentConfiguration(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent-configuration",
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
			const issuer = ctx.context.baseURL.replace(/\/$/, "");

			const endpoints: Record<string, string> = {
				register: `${issuer}/agent/register`,
				capabilities: `${issuer}/capability/list`,
				execute: `${issuer}/capability/execute`,
				request_capability: `${issuer}/agent/request-capability`,
				status: `${issuer}/agent/status`,
				revoke: `${issuer}/agent/revoke`,
				reactivate: `${issuer}/agent/reactivate`,
				revoke_host: `${issuer}/host/revoke`,
				rotate_key: `${issuer}/agent/rotate-key`,
				rotate_host_key: `${issuer}/host/rotate-key`,
				switch_account: `${issuer}/host/switch-account`,
				introspect: `${issuer}/agent/introspect`,
				describe_capability: `${issuer}/capability/describe`,
				device_authorization: `${issuer}/device/code`,
			};

			if (opts.approvalMethods.includes("ciba")) {
				endpoints.ciba_authorize = `${issuer}/agent/ciba/authorize`;
			}

			const proofOfPresenceMethods: string[] = [];
			if (opts.proofOfPresence?.enabled) {
				proofOfPresenceMethods.push("webauthn");
			}

			return ctx.json({
				version: "1.0-draft",
				provider_name: opts.providerName ?? "agent-auth",
				description: opts.providerDescription ?? "Agent Auth enabled service",
				issuer,
				default_location: endpoints.execute,
				algorithms: opts.allowedKeyAlgorithms,
				modes: opts.modes,
				approval_methods: opts.approvalMethods,
				...(proofOfPresenceMethods.length > 0
					? { proof_of_presence_methods: proofOfPresenceMethods }
					: {}),
				endpoints,
				...(opts.jwksUri ? { jwks_uri: opts.jwksUri } : {}),
			});
		}
	);
}

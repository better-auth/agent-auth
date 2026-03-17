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
			const baseUrl = new URL(ctx.context.baseURL);
			const issuer = baseUrl.origin;
			const basePath = baseUrl.pathname.replace(/\/$/, "");

			const endpoints: Record<string, string> = {
				register: `${basePath}/agent/register`,
				capabilities: `${basePath}/capability/list`,
				execute: `${basePath}/capability/execute`,
				request_capability: `${basePath}/agent/request-capability`,
				status: `${basePath}/agent/status`,
				revoke: `${basePath}/agent/revoke`,
				reactivate: `${basePath}/agent/reactivate`,
				revoke_host: `${basePath}/host/revoke`,
				rotate_key: `${basePath}/agent/rotate-key`,
				rotate_host_key: `${basePath}/host/rotate-key`,
				switch_account: `${basePath}/host/switch-account`,
				introspect: `${basePath}/agent/introspect`,
				describe_capability: `${basePath}/capability/describe`,
				device_authorization: `${basePath}/device/code`,
			};

			if (opts.approvalMethods.includes("ciba")) {
				endpoints.ciba_authorize = `${basePath}/agent/ciba/authorize`;
			}

		const proofOfPresenceMethods: string[] = [];
		if (opts.proofOfPresence?.enabled) {
			proofOfPresenceMethods.push("webauthn");
		}

		const defaultLocation = new URL(endpoints.execute, issuer).toString();

		return ctx.json({
			version: "1.0-draft",
			provider_name: opts.providerName ?? "agent-auth",
			description:
				opts.providerDescription ??
				"Agent Auth enabled service",
			issuer,
			default_location: defaultLocation,
			algorithms: opts.allowedKeyAlgorithms,
			modes: opts.modes,
			approval_methods: opts.approvalMethods,
			...(proofOfPresenceMethods.length > 0
				? { proof_of_presence_methods: proofOfPresenceMethods }
				: {}),
			endpoints,
			...(opts.jwksUri ? { jwks_uri: opts.jwksUri } : {}),
		});
		},
	);
}

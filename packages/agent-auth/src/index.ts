import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "better-auth/db";
import { createAgentAuthBeforeHook } from "./middleware";
import { createAgentRoutes } from "./routes";
import { agentSchema } from "./schema";
import { JtiCacheProxy } from "./utils/jti-cache";
import { JwksCacheProxy } from "./utils/jwks-cache";
import { buildRateLimits } from "./utils/rate-limit";
import { AGENT_AUTH_ERROR_CODES } from "./errors";
import type { AgentAuthOptions, ResolvedAgentAuthOptions } from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"agent-auth": {
			creator: typeof agentAuth;
		};
	}
}

export const agentAuth = (options?: AgentAuthOptions): BetterAuthPlugin => {
	const opts: ResolvedAgentAuthOptions = {
		...options,
		allowedKeyAlgorithms: options?.allowedKeyAlgorithms ?? ["Ed25519"],
		jwtFormat: options?.jwtFormat ?? "simple",
		jwtMaxAge: options?.jwtMaxAge ?? 60,
		agentSessionTTL: options?.agentSessionTTL ?? 3600,
		agentMaxLifetime: options?.agentMaxLifetime ?? 86400,
		maxAgentsPerUser: options?.maxAgentsPerUser ?? 25,
		absoluteLifetime: options?.absoluteLifetime ?? 0,
		freshSessionWindow: options?.freshSessionWindow ?? 300,
		blockedCapabilityIds: options?.blockedCapabilityIds ?? [],
		allowDynamicHostRegistration:
			options?.allowDynamicHostRegistration ?? true,
		dynamicHostDefaultCapabilityIds:
			options?.dynamicHostDefaultCapabilityIds ?? [],
		modes: options?.modes ?? ["delegated", "autonomous"],
		approvalMethods: options?.approvalMethods ?? [
			"ciba",
			"device_authorization",
		],
		resolveApprovalMethod:
			options?.resolveApprovalMethod ??
			(({ userId }) =>
				userId ? "ciba" : "device_authorization"),
		jtiCacheStorage: options?.jtiCacheStorage ?? "memory",
		jwksCacheStorage: options?.jwksCacheStorage ?? "memory",
		dangerouslySkipJtiCheck: options?.dangerouslySkipJtiCheck ?? false,
	};

	const jtiCache = new JtiCacheProxy();
	const jwksCache = new JwksCacheProxy();
	const schema = mergeSchema(agentSchema(), opts.schema);
	const routes = createAgentRoutes(opts, jtiCache, jwksCache);

	return {
		id: "agent-auth",
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
		init(ctx) {
			if (ctx.secondaryStorage) {
				const jtiUseSecondary =
					opts.jtiCacheStorage === "secondary-storage" ||
					(opts.jtiCacheStorage !== "memory");
				if (jtiUseSecondary) {
					jtiCache.useSecondaryStorage(ctx.secondaryStorage);
				}

				const jwksUseSecondary =
					opts.jwksCacheStorage === "secondary-storage" ||
					(opts.jwksCacheStorage !== "memory");
				if (jwksUseSecondary) {
					jwksCache.useSecondaryStorage(ctx.secondaryStorage);
				}
			}
		},
		hooks: {
			before: [createAgentAuthBeforeHook(opts, jtiCache, jwksCache)],
		},
		endpoints: {
			agentConfiguration: routes.agentConfiguration,
			register: routes.register,
			listAgents: routes.listAgents,
			getAgent: routes.getAgent,
			updateAgent: routes.updateAgent,
			revokeAgent: routes.revokeAgent,
			rotateKey: routes.rotateKey,
			reactivateAgent: routes.reactivateAgent,
			getAgentSession: routes.getAgentSession,
			cleanupAgents: routes.cleanupAgents,
			requestCapability: routes.requestCapability,
			approveCapability: routes.approveCapability,
			listCapabilities: routes.listCapabilities,
			agentStatus: routes.agentStatus,
			introspect: routes.introspect,
			connectAccount: routes.connectAccount,
			approveConnectAccount: routes.approveConnectAccount,
			grantCapability: routes.grantCapability,
			createHost: routes.createHost,
			enrollHost: routes.enrollHost,
			listHosts: routes.listHosts,
			getHost: routes.getHost,
			revokeHost: routes.revokeHost,
			reactivateHost: routes.reactivateHost,
			updateHost: routes.updateHost,
			rotateHostKey: routes.rotateHostKey,
			cibaAuthorize: routes.cibaAuthorize,
			cibaApprove: routes.cibaApprove,
			cibaDeny: routes.cibaDeny,
			cibaPending: routes.cibaPending,
		},
		rateLimit: buildRateLimits(options?.rateLimit),
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
export { verifyAgentRequest } from "./verify-agent-request";
export { AGENT_AUTH_ERROR_CODES } from "./errors";
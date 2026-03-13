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

export const agentAuth = (options?: AgentAuthOptions) => {
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
		blockedCapabilities: options?.blockedCapabilities ?? [],
		allowDynamicHostRegistration:
			options?.allowDynamicHostRegistration ?? false,
		defaultHostCapabilities:
			options?.defaultHostCapabilities ?? [],
		modes: options?.modes ?? ["delegated", "autonomous"],
		deviceAuthorizationPage:
			options?.deviceAuthorizationPage ?? "/device/capabilities",
		approvalMethods: options?.approvalMethods ?? [
			"ciba",
			"device_authorization",
		],
		resolveApprovalMethod:
			options?.resolveApprovalMethod ??
			(({ preferredMethod, supportedMethods }) =>
				preferredMethod && supportedMethods.includes(preferredMethod)
					? preferredMethod
					: "device_authorization"),
		jtiCacheStorage: options?.jtiCacheStorage ?? "memory",
		jwksCacheStorage: options?.jwksCacheStorage ?? "memory",
		dangerouslySkipJtiCheck: options?.dangerouslySkipJtiCheck ?? false,
		trustProxy: options?.trustProxy ?? false,
		proofOfPresence: (() => {
			const enabled = options?.proofOfPresence?.enabled ?? false;
			if (!enabled) return { enabled: false, rpId: "", origin: [] };
			return {
				enabled: true,
				rpId: options?.proofOfPresence?.rpId ?? "",
				origin: options?.proofOfPresence?.origin
					? Array.isArray(options.proofOfPresence.origin)
						? options.proofOfPresence.origin
						: [options.proofOfPresence.origin]
					: [],
			};
		})(),
	};

	if (opts.dangerouslySkipJtiCheck) {
		console.warn(
			"[agent-auth] WARNING: dangerouslySkipJtiCheck is enabled — " +
			"JWT replay protection is DISABLED. " +
			"Never use this in production.",
		);
	}

	const jtiCache = new JtiCacheProxy();
	const jwksCache = new JwksCacheProxy();
	const schema = mergeSchema(agentSchema(), opts.schema);
	const routes = createAgentRoutes(opts, jtiCache, jwksCache);

	return {
		id: "agent-auth",
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
		init(ctx) {
			if (opts.proofOfPresence.enabled) {
				const baseUrl = new URL(ctx.baseURL);
				if (!opts.proofOfPresence.rpId) {
					opts.proofOfPresence.rpId = baseUrl.hostname;
				}
				if (opts.proofOfPresence.origin.length === 0) {
					opts.proofOfPresence.origin = [baseUrl.origin];
				}

				const hasPasskeyTable = ctx.tables?.["passkey"] != null;
				if (!hasPasskeyTable) {
					console.warn(
						"[agent-auth] proofOfPresence is enabled but the passkey plugin " +
						"is not installed. WebAuthn-gated approvals require " +
						"@better-auth/passkey to be added to your plugins array " +
						"so users can register authenticators.",
					);
				}
			}
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

				if (opts.jtiCacheStorage === "memory") {
					console.warn(
						"[agent-auth] JTI cache is using in-memory storage while secondaryStorage " +
						"is available. Set jtiCacheStorage: 'secondary-storage' for multi-instance deployments.",
					);
				}
				if (opts.jwksCacheStorage === "memory") {
					console.warn(
						"[agent-auth] JWKS cache is using in-memory storage while secondaryStorage " +
						"is available. Set jwksCacheStorage: 'secondary-storage' for multi-instance deployments.",
					);
				}
			}
		},
		hooks: {
			before: [createAgentAuthBeforeHook(opts, jtiCache, jwksCache)],
		},
		endpoints: {
			getAgentConfiguration: routes.getAgentConfiguration,
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
			describeCapability: routes.describeCapability,
			executeCapability: routes.executeCapability,
			agentStatus: routes.agentStatus,
			introspect: routes.introspect,
			grantCapability: routes.grantCapability,
			createHost: routes.createHost,
			enrollHost: routes.enrollHost,
			listHosts: routes.listHosts,
			getHost: routes.getHost,
			revokeHost: routes.revokeHost,
			switchHostAccount: routes.switchHostAccount,
			updateHost: routes.updateHost,
			rotateHostKey: routes.rotateHostKey,
			cibaAuthorize: routes.cibaAuthorize,
			cibaPending: routes.cibaPending,
			deviceCode: routes.deviceCode,
		} as const,
		rateLimit: buildRateLimits(options?.rateLimit),
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
export { verifyAgentRequest } from "./verify-agent-request";
export { AGENT_AUTH_ERROR_CODES } from "./errors";
export { asyncResult, streamResult } from "./execute-helpers";
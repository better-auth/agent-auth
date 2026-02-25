import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "better-auth/db";
import { decodeJwt } from "jose";
import type { AgentJWK } from "./crypto";
import { verifyAgentJWT } from "./crypto";
import { AGENT_AUTH_ERROR_CODES } from "./error-codes";
import { createAgentRoutes } from "./routes";
import { agentSchema } from "./schema";
import type {
	Agent,
	AgentAuthOptions,
	AgentSession,
	ResolvedAgentAuthOptions,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"agent-auth": {
			creator: typeof agentAuth;
		};
	}
}

export { AGENT_AUTH_ERROR_CODES } from "./error-codes";

const AGENT_TABLE = "agent";

function buildRateLimits(config: AgentAuthOptions["rateLimit"]) {
	if (config === false) return [];
	const rl = typeof config === "object" ? config : {};
	const window = rl.window ?? 60;
	const max = rl.max ?? 60;
	const createMax = rl.createMax ?? 10;
	const sensitiveMax = rl.sensitiveMax ?? 5;
	return [
		{
			pathMatcher(path: string) {
				return path === "/agent/create";
			},
			window,
			max: createMax,
		},
		{
			pathMatcher(path: string) {
				return path === "/agent/rotate-key" || path === "/agent/cleanup";
			},
			window,
			max: sensitiveMax,
		},
		{
			pathMatcher(path: string) {
				return path.startsWith("/agent/");
			},
			window,
			max,
		},
	];
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
	};

	const schema = mergeSchema(agentSchema(), opts.schema);

	const routes = createAgentRoutes(opts);

	return {
		id: "agent-auth",
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) => {
						const auth = ctx.headers?.get("authorization");
						if (!auth) return false;
						const bearer = auth.replace(/^Bearer\s+/i, "");
						if (!bearer || bearer === auth) return false;
						return bearer.split(".").length === 3;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const bearer = ctx.headers
							?.get("authorization")
							?.replace(/^Bearer\s+/i, "")!;

						let agentId: string;
						try {
							const payload = decodeJwt(bearer);
							if (!payload.sub) {
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.INVALID_JWT,
								);
							}
							agentId = payload.sub;
						} catch {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}

						const agent = await ctx.context.adapter.findOne<Agent>({
							model: AGENT_TABLE,
							where: [{ field: "id", value: agentId }],
						});

						if (!agent) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
							);
						}

						if (agent.status !== "active") {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_REVOKED,
							);
						}

						if (agent.expiresAt && new Date(agent.expiresAt) <= new Date()) {
							ctx.context.runInBackground(
								ctx.context.adapter
									.update({
										model: AGENT_TABLE,
										where: [{ field: "id", value: agent.id }],
										update: {
											status: "revoked",
											publicKey: "",
											kid: null,
											updatedAt: new Date(),
										},
									})
									.catch(() => {}),
							);
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_EXPIRED,
							);
						}

						if (opts.agentMaxLifetime > 0 && agent.createdAt) {
							const maxExpiry =
								new Date(agent.createdAt).getTime() +
								opts.agentMaxLifetime * 1000;
							if (Date.now() >= maxExpiry) {
								ctx.context.runInBackground(
									ctx.context.adapter
										.update({
											model: AGENT_TABLE,
											where: [{ field: "id", value: agent.id }],
											update: {
												status: "revoked",
												publicKey: "",
												kid: null,
												updatedAt: new Date(),
											},
										})
										.catch(() => {}),
								);
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.AGENT_EXPIRED,
								);
							}
						}

						let publicKey: AgentJWK;
						try {
							publicKey = JSON.parse(agent.publicKey);
						} catch {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
							);
						}
						const payload = await verifyAgentJWT({
							jwt: bearer,
							publicKey,
							maxAge: opts.jwtMaxAge,
						});

						if (!payload) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}

						const user = await ctx.context.internalAdapter.findUserById(
							agent.userId,
						);
						if (!user) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
							);
						}

						const agentSession: AgentSession = {
							agent: {
								id: agent.id,
								name: agent.name,
								scopes:
									typeof agent.scopes === "string"
										? JSON.parse(agent.scopes)
										: agent.scopes,
								role: agent.role,
								orgId: agent.orgId,
								workgroupId: agent.workgroupId ?? null,
								createdAt: agent.createdAt,
								metadata:
									typeof agent.metadata === "string"
										? JSON.parse(agent.metadata)
										: agent.metadata,
							},
							user: {
								id: user.id,
								name: user.name,
								email: user.email,
							},
						};

						(ctx.context as { agentSession?: AgentSession }).agentSession =
							agentSession;

						const now = new Date();
						const heartbeatUpdate: { lastUsedAt: Date; expiresAt?: Date } = {
							lastUsedAt: now,
						};
						if (opts.agentSessionTTL > 0) {
							let newExpiry = now.getTime() + opts.agentSessionTTL * 1000;
							if (opts.agentMaxLifetime > 0 && agent.createdAt) {
								const hardCap =
									new Date(agent.createdAt).getTime() +
									opts.agentMaxLifetime * 1000;
								newExpiry = Math.min(newExpiry, hardCap);
							}
							heartbeatUpdate.expiresAt = new Date(newExpiry);
						}
						ctx.context.runInBackground(
							ctx.context.adapter
								.update({
									model: AGENT_TABLE,
									where: [{ field: "id", value: agent.id }],
									update: heartbeatUpdate,
								})
								.catch(() => {}),
						);

						if (ctx.path === "/agent/get-session") {
							return agentSession;
						}

						return { context: ctx };
					}),
				},
			],
		},
		endpoints: {
			createAgent: routes.createAgent,
			listAgents: routes.listAgents,
			getAgent: routes.getAgent,
			updateAgent: routes.updateAgent,
			revokeAgent: routes.revokeAgent,
			rotateKey: routes.rotateKey,
			getAgentSession: routes.getAgentSession,
			cleanupAgents: routes.cleanupAgents,
			requestScope: routes.requestScope,
			scopeRequestStatus: routes.scopeRequestStatus,
			approveScope: routes.approveScope,
		},
		rateLimit: buildRateLimits(options?.rateLimit),
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
export { verifyAgentRequest } from "./verify-agent-request";

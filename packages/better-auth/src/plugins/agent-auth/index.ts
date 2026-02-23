import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { decodeJwt } from "jose";
import { APIError } from "../../api";
import { mergeSchema } from "../../db";
import { isAPIError } from "../../utils/is-api-error";
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
		maxTokensPerAgent: options?.maxTokensPerAgent ?? 0,
		maxTokensPerUser: options?.maxTokensPerUser ?? 0,
		maxTokensPerOrg: options?.maxTokensPerOrg ?? 0,
		maxTokensPerWorkgroup: options?.maxTokensPerWorkgroup ?? 0,
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
						// Check if it looks like a JWT (three dot-separated segments)
						return bearer.split(".").length === 3;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const bearer = ctx.headers
							?.get("authorization")
							?.replace(/^Bearer\s+/i, "")!;

						// Decode JWT payload without verification to get the agentId (sub)
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

						// Look up the agent by ID
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

						// TTL check — reject if the agent has expired
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

						// Hard lifetime cap — reject if createdAt + maxLifetime has passed
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

						// Per-agent token budget check
						if (opts.maxTokensPerAgent > 0) {
							const used =
								(agent.totalInputTokens ?? 0) + (agent.totalOutputTokens ?? 0);
							if (used >= opts.maxTokensPerAgent) {
								throw APIError.from(
									"FORBIDDEN",
									AGENT_AUTH_ERROR_CODES.TOKEN_BUDGET_EXCEEDED,
								);
							}
						}

						// Per-user token budget check (sum across all agents)
						if (opts.maxTokensPerUser > 0) {
							const userAgents = await ctx.context.adapter.findMany<{
								totalInputTokens: number;
								totalOutputTokens: number;
							}>({
								model: AGENT_TABLE,
								where: [{ field: "userId", value: agent.userId }],
							});
							let userTotal = 0;
							for (const a of userAgents) {
								userTotal +=
									(a.totalInputTokens ?? 0) + (a.totalOutputTokens ?? 0);
							}
							if (userTotal >= opts.maxTokensPerUser) {
								throw APIError.from(
									"FORBIDDEN",
									AGENT_AUTH_ERROR_CODES.USER_TOKEN_BUDGET_EXCEEDED,
								);
							}
						}

						// Verify the JWT signature with the agent's stored public key
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

						// Load the user who owns this agent
						const user = await ctx.context.internalAdapter.findUserById(
							agent.userId,
						);
						if (!user) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
							);
						}

						// Build agent session
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

						// Attach agent session to context
						(ctx.context as { agentSession?: AgentSession }).agentSession =
							agentSession;

						// Update lastUsedAt (and extend expiresAt if TTL is active) in background
						const now = new Date();
						const heartbeatUpdate: { lastUsedAt: Date; expiresAt?: Date } = {
							lastUsedAt: now,
						};
						if (opts.agentSessionTTL > 0) {
							let newExpiry = now.getTime() + opts.agentSessionTTL * 1000;
							// Cap sliding TTL at the hard max lifetime
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

						// For get-agent-session endpoint, return the session directly
						if (ctx.path === "/agent/get-session") {
							return agentSession;
						}

						return { context: ctx };
					}),
				},
			],
			after: [
				{
					matcher: (ctx) => {
						// Run after hook only for requests that went through agent auth
						return !!(ctx.context as { agentSession?: AgentSession })
							.agentSession;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const agentSession = (
							ctx.context as { agentSession?: AgentSession }
						).agentSession;
						if (!agentSession) return;

						// Derive HTTP status from the response
						let status: number | null = null;
						const returned = (
							ctx.context as {
								returned?: { status?: number; statusCode?: number };
							}
						).returned;
						if (isAPIError(returned)) {
							status = returned.statusCode;
						} else if (
							returned &&
							typeof returned === "object" &&
							"status" in returned
						) {
							status = (returned as { status: number }).status;
						}

						// Use x-agent-path/x-agent-method if present (set by verifyAgentRequest helper)
						// so custom routes log the actual business path, not "/agent/get-session"
						const loggedMethod =
							ctx.headers?.get("x-agent-method") ?? ctx.method ?? "GET";
						const loggedPath =
							ctx.headers?.get("x-agent-path") ?? ctx.path ?? "";

						// Extract the first IP from x-forwarded-for (may contain a comma-separated chain)
						const forwarded = ctx.headers?.get("x-forwarded-for");
						const clientIp = forwarded
							? (forwarded.split(",")[0]?.trim() ?? null)
							: (ctx.headers?.get("x-real-ip") ?? null);

						// Log activity (method/path/status only).
						// Token counts are tracked exclusively via POST /agent/log-activity
						// to avoid double-counting when agents report tokens there.
						ctx.context.runInBackground(
							ctx.context.adapter
								.create({
									model: "agentActivity",
									data: {
										agentId: agentSession.agent.id,
										userId: agentSession.user.id,
										method: loggedMethod,
										path: loggedPath,
										status,
										inputTokens: null,
										outputTokens: null,
										ipAddress: clientIp,
										userAgent: ctx.headers?.get("user-agent") ?? null,
										createdAt: new Date(),
									},
								})
								.catch(() => {}),
						);
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
			getAgentActivity: routes.getAgentActivity,
			getTokenUsage: routes.getTokenUsage,
			logActivity: routes.logActivity,
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

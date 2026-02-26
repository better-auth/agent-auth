import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "better-auth/db";
import { decodeJwt } from "jose";
import type { AgentJWK } from "./crypto";
import { verifyAgentJWT } from "./crypto";
import { AGENT_AUTH_ERROR_CODES } from "./error-codes";
import { JtiReplayCache } from "./jti-cache";
import { createAgentRoutes } from "./routes";
import { agentSchema } from "./schema";
import type {
	Agent,
	AgentAuthOptions,
	AgentSession,
	Enrollment,
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
const ENROLLMENT_TABLE = "agentEnrollment";

const jtiCache = new JtiReplayCache();

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

/**
 * Transparently reactivate an expired agent (§7.1).
 * Scopes decay to enrollment's baseScopes if enrollment exists (§7.3).
 * Returns the updated agent record or null if reactivation is not possible.
 */
async function tryTransparentReactivation(
	agent: Agent,
	opts: ResolvedAgentAuthOptions,
	adapter: {
		findOne: <T>(args: {
			model: string;
			where: { field: string; value: string }[];
		}) => Promise<T | null>;
		update: (args: {
			model: string;
			where: { field: string; value: string }[];
			update: Record<string, unknown>;
		}) => Promise<unknown>;
	},
): Promise<Agent | null> {
	if (!agent.publicKey) return null;

	let baseScopes: string[];
	if (agent.enrollmentId) {
		const enrollment = await adapter.findOne<Enrollment>({
			model: ENROLLMENT_TABLE,
			where: [{ field: "id", value: agent.enrollmentId }],
		});
		if (!enrollment || enrollment.status === "revoked") return null;
		baseScopes =
			typeof enrollment.baseScopes === "string"
				? JSON.parse(enrollment.baseScopes)
				: enrollment.baseScopes;
	} else {
		baseScopes =
			typeof agent.scopes === "string"
				? JSON.parse(agent.scopes)
				: agent.scopes;
	}

	const now = new Date();
	const expiresAt =
		opts.agentSessionTTL > 0
			? new Date(now.getTime() + opts.agentSessionTTL * 1000)
			: null;

	await adapter.update({
		model: AGENT_TABLE,
		where: [{ field: "id", value: agent.id }],
		update: {
			status: "active",
			scopes: JSON.stringify(baseScopes),
			activatedAt: now,
			expiresAt,
			lastUsedAt: now,
			updatedAt: now,
		},
	});

	return {
		...agent,
		status: "active",
		scopes: baseScopes,
		activatedAt: now,
		expiresAt,
		lastUsedAt: now,
		updatedAt: now,
	};
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
		blockedScopes: options?.blockedScopes ?? [],
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
							const decodedPayload = decodeJwt(bearer);
							if (!decodedPayload.sub) {
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.INVALID_JWT,
								);
							}
							agentId = decodedPayload.sub;
						} catch {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}

						let agent = await ctx.context.adapter.findOne<Agent>({
							model: AGENT_TABLE,
							where: [{ field: "id", value: agentId }],
						});

						if (!agent) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
							);
						}

						if (agent.status === "revoked") {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_REVOKED,
							);
						}

						// §9.2 absoluteLifetime — measured from createdAt, results in revocation (not expiration)
						if (opts.absoluteLifetime > 0 && agent.createdAt) {
							const absoluteExpiry =
								new Date(agent.createdAt).getTime() +
								opts.absoluteLifetime * 1000;
							if (Date.now() >= absoluteExpiry) {
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
									AGENT_AUTH_ERROR_CODES.AGENT_REVOKED,
								);
							}
						}

						// Detect if agent needs expiration (but don't reject yet — try reactivation)
						let needsReactivation = agent.status === "expired";

						if (
							!needsReactivation &&
							agent.expiresAt &&
							new Date(agent.expiresAt) <= new Date()
						) {
							needsReactivation = true;
						}

						if (!needsReactivation && opts.agentMaxLifetime > 0) {
							const anchor = agent.activatedAt ?? agent.createdAt;
							if (anchor) {
								const maxExpiry =
									new Date(anchor).getTime() + opts.agentMaxLifetime * 1000;
								if (Date.now() >= maxExpiry) {
									needsReactivation = true;
								}
							}
						}

						// Verify the JWT against the stored public key first
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

						// §7.1: Transparent reactivation — if expired but JWT is valid,
						// auto-reactivate with scope decay instead of rejecting.
						if (needsReactivation) {
							const reactivated = await tryTransparentReactivation(
								agent,
								opts,
								ctx.context.adapter,
							);
							if (!reactivated) {
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.AGENT_EXPIRED,
								);
							}
							agent = reactivated;
						}

						// §15.5, §9.4 JTI replay detection
						if (payload.jti) {
							if (jtiCache.has(payload.jti)) {
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.JWT_REPLAY,
								);
							}
							jtiCache.add(payload.jti, opts.jwtMaxAge);
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
								enrollmentId: agent.enrollmentId ?? null,
								source: agent.source ?? null,
								createdAt: agent.createdAt,
								activatedAt: agent.activatedAt ?? null,
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

						// Heartbeat update (skip if we just reactivated — that already set timestamps)
						if (!needsReactivation) {
							const now = new Date();
							const heartbeatUpdate: {
								lastUsedAt: Date;
								expiresAt?: Date;
							} = {
								lastUsedAt: now,
							};
							if (opts.agentSessionTTL > 0) {
								let newExpiry = now.getTime() + opts.agentSessionTTL * 1000;

								const anchor = agent.activatedAt ?? agent.createdAt;
								if (opts.agentMaxLifetime > 0 && anchor) {
									const hardCap =
										new Date(anchor).getTime() + opts.agentMaxLifetime * 1000;
									newExpiry = Math.min(newExpiry, hardCap);
								}

								if (opts.absoluteLifetime > 0 && agent.createdAt) {
									const absoluteCap =
										new Date(agent.createdAt).getTime() +
										opts.absoluteLifetime * 1000;
									newExpiry = Math.min(newExpiry, absoluteCap);
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
						}

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
			reactivateAgent: routes.reactivateAgent,
			getAgentSession: routes.getAgentSession,
			cleanupAgents: routes.cleanupAgents,
			requestScope: routes.requestScope,
			scopeRequestStatus: routes.scopeRequestStatus,
			approveScope: routes.approveScope,
			discover: routes.discover,
			createEnrollment: routes.createEnrollment,
			listEnrollments: routes.listEnrollments,
			getEnrollment: routes.getEnrollment,
			revokeEnrollment: routes.revokeEnrollment,
			createWorkgroup: routes.createWorkgroup,
			listWorkgroups: routes.listWorkgroups,
			updateWorkgroup: routes.updateWorkgroup,
			deleteWorkgroup: routes.deleteWorkgroup,
		},
		rateLimit: buildRateLimits(options?.rateLimit),
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
export { verifyAgentRequest } from "./verify-agent-request";

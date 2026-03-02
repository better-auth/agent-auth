import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "better-auth/db";
import { decodeJwt } from "jose";
import type { AgentJWK } from "./crypto";
import { hashRequestBody, verifyAgentJWT } from "./crypto";
import { AGENT_AUTH_ERROR_CODES } from "./error-codes";
import { JtiReplayCache } from "./jti-cache";
import { createAgentRoutes } from "./routes";
import { agentSchema } from "./schema";
import type {
	Agent,
	AgentAuthOptions,
	AgentHost,
	AgentPermission,
	AgentSession,
	HostSession,
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
const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";

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
				return path === "/agent/register";
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
 * Permissions decay to host's scopes if host exists (§7.3).
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
		findMany: <T>(args: {
			model: string;
			where: { field: string; value: string }[];
		}) => Promise<T[]>;
		update: (args: {
			model: string;
			where: { field: string; value: string }[];
			update: Record<string, unknown>;
		}) => Promise<unknown>;
		delete: (args: {
			model: string;
			where: { field: string; value: string }[];
		}) => Promise<unknown>;
		create: (args: {
			model: string;
			data: Record<string, unknown>;
		}) => Promise<unknown>;
	},
): Promise<Agent | null> {
	if (!agent.publicKey) return null;

	const now = new Date();

	if (agent.hostId) {
		const host = await adapter.findOne<AgentHost>({
			model: HOST_TABLE,
			where: [{ field: "id", value: agent.hostId }],
		});
		if (!host || host.status === "revoked") return null;

		const baseScopes: string[] =
			typeof host.scopes === "string" ? JSON.parse(host.scopes) : host.scopes;

		// Scope decay: delete all existing permissions, re-create from host scopes
		const existingPerms = await adapter.findMany<AgentPermission>({
			model: PERMISSION_TABLE,
			where: [{ field: "agentId", value: agent.id }],
		});
		for (const perm of existingPerms) {
			await adapter.delete({
				model: PERMISSION_TABLE,
				where: [{ field: "id", value: perm.id }],
			});
		}
		for (const scope of baseScopes) {
			await adapter.create({
				model: PERMISSION_TABLE,
				data: {
					agentId: agent.id,
					scope,
					referenceId: null,
					grantedBy: agent.userId,
					expiresAt: null,
					status: "active",
					reason: null,
					createdAt: now,
					updatedAt: now,
				},
			});
		}
	}
	// If no host, keep existing permissions as-is

	const expiresAt =
		opts.agentSessionTTL > 0
			? new Date(now.getTime() + opts.agentSessionTTL * 1000)
			: null;

	await adapter.update({
		model: AGENT_TABLE,
		where: [{ field: "id", value: agent.id }],
		update: {
			status: "active",
			activatedAt: now,
			expiresAt,
			lastUsedAt: now,
			updatedAt: now,
		},
	});

	return {
		...agent,
		status: "active",
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
		modes: options?.modes ?? ["behalf_of", "autonomous"],
		approvalMethods: options?.approvalMethods ?? ["device_authorization"],
		resolveApprovalMethod:
			options?.resolveApprovalMethod ?? (() => "device_authorization"),
	};

	const schema = mergeSchema(agentSchema(), opts.schema);

	const routes = createAgentRoutes(opts, jtiCache);

	return {
		id: "agent-auth",
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) => {
						if (ctx.path === "/agent/register") return false;
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

							// §3.4 step 2: Verify aud early (before DB lookup).
							// Reject when aud is present but doesn't match — prevents cross-server replay.
							if (decodedPayload.aud) {
								const configuredOrigin = new URL(ctx.context.baseURL).origin;
								const acceptedOrigins = new Set([configuredOrigin]);
								const reqHost = ctx.headers?.get("host");
								const reqProto =
									ctx.headers?.get("x-forwarded-proto") ?? "http";
								if (reqHost) {
									acceptedOrigins.add(`${reqProto}://${reqHost}`);
								}
								const audValues = Array.isArray(decodedPayload.aud)
									? decodedPayload.aud
									: [decodedPayload.aud];
								const audMatch = audValues.some((a) =>
									acceptedOrigins.has(String(a)),
								);
								if (!audMatch) {
									throw APIError.from(
										"UNAUTHORIZED",
										AGENT_AUTH_ERROR_CODES.INVALID_JWT,
									);
								}
							}
						} catch (e) {
							if (e instanceof APIError) throw e;
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
							const host = await ctx.context.adapter.findOne<AgentHost>({
								model: HOST_TABLE,
								where: [{ field: "id", value: agentId }],
							});

							if (host && host.status === "active" && host.publicKey) {
								let hostPubKey: AgentJWK;
								try {
									hostPubKey = JSON.parse(host.publicKey);
								} catch {
									throw APIError.from(
										"UNAUTHORIZED",
										AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
									);
								}
								const hostPayload = await verifyAgentJWT({
									jwt: bearer,
									publicKey: hostPubKey,
									maxAge: opts.jwtMaxAge,
								});
								if (!hostPayload) {
									throw APIError.from(
										"UNAUTHORIZED",
										AGENT_AUTH_ERROR_CODES.INVALID_JWT,
									);
								}
								const hostScopes =
									typeof host.scopes === "string"
										? JSON.parse(host.scopes)
										: (host.scopes ?? []);
								const hostSession: HostSession = {
									host: {
										id: host.id,
										userId: host.userId,
										scopes: hostScopes,
										status: host.status,
									},
								};
								(ctx.context as { hostSession?: HostSession }).hostSession =
									hostSession;
								return { context: ctx };
							}

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

						if (agent.status === "pending") {
							throw APIError.from(
								"FORBIDDEN",
								AGENT_AUTH_ERROR_CODES.AGENT_PENDING,
							);
						}

						if (agent.status === "rejected") {
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
							// §9.4 SHOULD: if the JWT is invalid and the session has
							// lapsed, lazily transition agent to "expired" so the
							// database reflects reality.
							if (needsReactivation && agent.status === "active") {
								ctx.context.adapter
									.update({
										model: AGENT_TABLE,
										where: [{ field: "id", value: agent.id }],
										update: { status: "expired", updatedAt: new Date() },
									})
									.catch(() => {});
							}
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}

						// §3.5: jti is required for replay detection
						if (!payload.jti) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}
						if (jtiCache.has(payload.jti)) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.JWT_REPLAY,
							);
						}
						jtiCache.add(payload.jti, opts.jwtMaxAge);

						// DPoP-style request binding verification (§3.3).
						// htu must be the full URL (scheme + host + path) per RFC 9449 §4.2.
						if (payload.htm || payload.htu) {
							const method = ctx.method?.toUpperCase();

							if (
								payload.htm &&
								typeof payload.htm === "string" &&
								payload.htm !== method
							) {
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
								);
							}

							if (payload.htu && typeof payload.htu === "string") {
								const baseUrl = new URL(ctx.context.baseURL);
								const expectedHtu = `${baseUrl.origin}${baseUrl.pathname.replace(/\/$/, "")}${ctx.path}`;
								if (payload.htu !== expectedHtu) {
									throw APIError.from(
										"UNAUTHORIZED",
										AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
									);
								}
							}

							if (payload.ath && typeof payload.ath === "string") {
								const body = ctx.body ? JSON.stringify(ctx.body) : undefined;
								if (body) {
									const actualHash = await hashRequestBody(body);
									if (payload.ath !== actualHash) {
										throw APIError.from(
											"UNAUTHORIZED",
											AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
										);
									}
								}
							}
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

						const [user, permissions] = await Promise.all([
							agent.userId
								? ctx.context.internalAdapter.findUserById(agent.userId)
								: Promise.resolve(null),
							ctx.context.adapter.findMany<AgentPermission>({
								model: PERMISSION_TABLE,
								where: [{ field: "agentId", value: agent.id }],
							}),
						]);
						const activePermissions = permissions.filter(
							(p) =>
								p.status === "active" &&
								(!p.expiresAt || new Date(p.expiresAt) > new Date()),
						);

						// §3.4 step 9: If JWT contains a scopes claim, intersect
						// with granted scopes so downstream handlers only see the
						// scopes the JWT was issued for.
						let effectivePermissions = activePermissions;
						if (payload.scopes && Array.isArray(payload.scopes)) {
							const jwtScopes = new Set(payload.scopes as string[]);
							effectivePermissions = activePermissions.filter((p) =>
								jwtScopes.has(p.scope),
							);
						}

						const agentSession: AgentSession = {
							agent: {
								id: agent.id,
								name: agent.name,
								mode: agent.mode,
								permissions: effectivePermissions.map((p) => ({
									scope: p.scope,
									referenceId: p.referenceId,
									grantedBy: p.grantedBy,
									status: p.status,
								})),
								hostId: agent.hostId,
								createdAt: agent.createdAt,
								activatedAt: agent.activatedAt ?? null,
								metadata:
									typeof agent.metadata === "string"
										? JSON.parse(agent.metadata)
										: agent.metadata,
							},
							user: user
								? { id: user.id, name: user.name, email: user.email }
								: null,
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
			capabilities: routes.capabilities,
			agentStatus: routes.agentStatus,
			introspect: routes.introspect,
			connectAccount: routes.connectAccount,
			createHost: routes.createHost,
			listHosts: routes.listHosts,
			getHost: routes.getHost,
			revokeHost: routes.revokeHost,
			reactivateHost: routes.reactivateHost,
			updateHost: routes.updateHost,
			rotateHostKey: routes.rotateHostKey,
			grantPermission: routes.grantPermission,
			cibaAuthorize: routes.cibaAuthorize,
			cibaToken: routes.cibaToken,
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

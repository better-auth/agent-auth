import type { HookEndpointContext } from "@better-auth/core";
import { type AuthMiddleware, createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { getAgentAuthAdapter } from "./adapter";
import { TABLE } from "./constants";
import { AGENT_AUTH_ERROR_CODES } from "./errors";
import { parseCapabilityIds } from "./utils/capabilities";
import { hashRequestBody, verifyAgentJWT } from "./utils/crypto";
import type { JtiCacheStore } from "./utils/jti-cache";
import type { JwksCacheStore } from "./utils/jwks-cache";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	AgentJWK,
	AgentSession,
	AgentSessionUser,
	FullAdapter,
	HostSession,
	ResolvedAgentAuthOptions,
} from "./types";

async function resolveSessionUser(args: {
	opts: ResolvedAgentAuthOptions;
	ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
	agent: Agent;
	host: AgentHost | null;
}): Promise<AgentSessionUser | null> {
	const { opts, ctx, agent, host } = args;

	const userId = agent.userId ?? host?.userId ?? null;
	if (userId) {
		const user = await ctx.context.internalAdapter.findUserById(userId);
		return (user as AgentSessionUser | null) ?? null;
	}

	if (opts.resolveAutonomousUser) {
		return opts.resolveAutonomousUser({
			ctx,
			hostId: host?.id ?? agent.hostId,
			hostName: host?.name ?? null,
			agentId: agent.id,
			agentMode: agent.mode,
		});
	}

	return null;
}

export function createAgentAuthBeforeHook(
	opts: ResolvedAgentAuthOptions,
	jtiCache: JtiCacheStore,
	jwksCache?: JwksCacheStore,
): { matcher: (context: HookEndpointContext) => boolean; handler: AuthMiddleware } {
	return {
		matcher: (ctx: { path?: string; headers?: Headers }) => {
			if (!ctx.path || ctx.path === "/agent/register") return false;
			const auth = ctx.headers?.get("authorization");
			if (!auth) return false;
			const bearer = auth.replace(/^Bearer\s+/i, "");
			if (!bearer || bearer === auth) return false;
			return bearer.split(".").length === 3;
		},
		handler: createAuthMiddleware(async (ctx) => {
			const db = getAgentAuthAdapter(
				ctx.context.adapter as FullAdapter,
				opts,
			);
			const bearer = ctx.headers
				?.get("authorization")
				?.replace(/^Bearer\s+/i, "")!;

			let agentId: string;
			try {
				const decoded = decodeJwt(bearer);
				if (!decoded.sub) {
					throw APIError.from(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_JWT,
					);
				}
				agentId = decoded.sub;

				if (decoded.aud) {
					const configuredOrigin = new URL(
						ctx.context.baseURL,
					).origin;
					const acceptedOrigins = new Set([configuredOrigin]);
					const reqHost = ctx.headers?.get("host");
					const reqProto =
						ctx.headers?.get("x-forwarded-proto") ?? "http";
					if (reqHost) {
						acceptedOrigins.add(`${reqProto}://${reqHost}`);
					}
					const audValues = Array.isArray(decoded.aud)
						? decoded.aud
						: [decoded.aud];
					if (
						!audValues.some((a) =>
							acceptedOrigins.has(String(a)),
						)
					) {
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

			let agent = await db.findAgentById(agentId);

			if (!agent) {
				const host = await db.findHostById(agentId);

				if (host && host.status === "active" && (host.publicKey || host.jwksUrl)) {
					let hostPubKey: AgentJWK | null = null;
					if (host.jwksUrl && jwksCache) {
						try {
							const header = decodeProtectedHeader(bearer);
							if (header.kid) {
								hostPubKey = await jwksCache.getKeyByKid(host.jwksUrl, header.kid);
							}
						} catch {}
					}
					if (!hostPubKey && host.publicKey) {
						try {
							hostPubKey = JSON.parse(host.publicKey) as AgentJWK;
						} catch {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
							);
						}
					}
					if (!hostPubKey) {
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
					const hostCaps = parseCapabilityIds(
						host.defaultCapabilityIds,
					);
					const hostSession: HostSession = {
						host: {
							id: host.id,
							userId: host.userId,
							defaultCapabilityIds: hostCaps,
							status: host.status,
						},
					};
					(
						ctx.context as {
							hostSession?: HostSession;
						}
					).hostSession = hostSession;
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

			// Absolute lifetime check (§2.4)
			if (opts.absoluteLifetime > 0 && agent.createdAt) {
				const absExpiry =
					new Date(agent.createdAt).getTime() +
					opts.absoluteLifetime * 1000;
				if (Date.now() >= absExpiry) {
					ctx.context.runInBackground(
						db
							.updateAgent(agent.id, {
								status: "revoked",
								publicKey: "",
								kid: null,
								updatedAt: new Date(),
							})
							.catch(() => {}),
					);
					throw APIError.from(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.AGENT_REVOKED,
					);
				}
			}

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
						new Date(anchor).getTime() +
						opts.agentMaxLifetime * 1000;
					if (Date.now() >= maxExpiry) {
						needsReactivation = true;
					}
				}
			}

			let publicKey: AgentJWK | null = null;
			if (agent.jwksUrl && jwksCache) {
				try {
					const header = decodeProtectedHeader(bearer);
					if (header.kid) {
						publicKey = await jwksCache.getKeyByKid(agent.jwksUrl, header.kid);
					}
				} catch {}
			}
			if (!publicKey && agent.publicKey) {
				try {
					publicKey = JSON.parse(agent.publicKey) as AgentJWK;
				} catch {
					throw APIError.from(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
					);
				}
			}
			if (!publicKey) {
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
				if (needsReactivation && agent.status === "active") {
					db.updateAgent(agent.id, {
						status: "expired",
						updatedAt: new Date(),
					}).catch(() => {});
				}
				throw APIError.from(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}

			// JTI replay (§5.6)
			if (!payload.jti) {
				throw APIError.from(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}
			if (await jtiCache.has(String(payload.jti))) {
				throw APIError.from(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.JWT_REPLAY,
				);
			}
			await jtiCache.add(String(payload.jti), opts.jwtMaxAge);

			// DPoP-style request binding (§5.4)
			if (payload.htm || payload.htu) {
				const overrideMethod =
					ctx.headers?.get("x-agent-method");
				const overridePath = ctx.headers?.get("x-agent-path");
				const method = (
					overrideMethod ?? ctx.method
				)?.toUpperCase();

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
					const effectivePath = overridePath ?? ctx.path;
					const expectedHtu = overridePath
						? `${baseUrl.origin}${effectivePath}`
						: `${baseUrl.origin}${baseUrl.pathname.replace(/\/$/, "")}${ctx.path}`;
					if (payload.htu !== expectedHtu) {
						throw APIError.from(
							"UNAUTHORIZED",
							AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
						);
					}
				}

				if (payload.ath && typeof payload.ath === "string") {
					const body = ctx.body
						? JSON.stringify(ctx.body)
						: undefined;
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

			if (needsReactivation) {
				const reactivated =
					await db.transparentReactivation(agent);
				if (!reactivated) {
					throw APIError.from(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.AGENT_EXPIRED,
					);
				}
				agent = reactivated;
			}

			const host = agent.hostId
				? await ctx.context.adapter.findOne<AgentHost>({
						model: TABLE.host,
						where: [
							{
								field: "id",
								value: agent.hostId,
							},
						],
					})
				: null;

			const [user, grants] = await Promise.all([
				resolveSessionUser({ opts, ctx, agent, host }),
				ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [
						{
							field: "agentId",
							value: agent.id,
						},
					],
				}),
			]);

			if (!user) {
				throw new APIError("UNAUTHORIZED", {
					body: {
						code: AGENT_AUTH_ERROR_CODES.AUTONOMOUS_OWNER_REQUIRED,
						message:
							"Could not resolve a session user for this agent.",
					},
				});
			}

			const now = new Date();
			const activeGrants = grants.filter(
				(g) =>
					g.status === "active" &&
					(!g.expiresAt || new Date(g.expiresAt) > now),
			);

			// Intersect with JWT's capability_ids claim (§5.3)
			let effectiveGrants = activeGrants;
			const jwtCapIds =
				payload.capability_ids ?? payload.capabilityIds;
			if (jwtCapIds && Array.isArray(jwtCapIds)) {
				const jwtCapSet = new Set(jwtCapIds as string[]);
				effectiveGrants = activeGrants.filter((g) =>
					jwtCapSet.has(g.capabilityId),
				);
			}

			const agentSession: AgentSession = {
				type: agent.mode,
				agent: {
					id: agent.id,
					name: agent.name,
					mode: agent.mode,
					capabilityGrants: effectiveGrants.map((g) => ({
						capabilityId: g.capabilityId,
						grantedBy: g.grantedBy,
						status: g.status,
					})),
					hostId: agent.hostId,
					createdAt: agent.createdAt,
					activatedAt: agent.activatedAt ?? null,
					metadata:
						typeof agent.metadata === "string"
							? JSON.parse(agent.metadata)
							: agent.metadata,
				},
				host: host
					? {
							id: host.id,
							userId: host.userId,
							status: host.status,
						}
					: null,
				user,
			};

			(
				ctx.context as {
					agentSession?: AgentSession;
				}
			).agentSession = agentSession;

			// Heartbeat
			if (!needsReactivation) {
				const hbNow = new Date();
				const heartbeat: Record<string, unknown> = {
					lastUsedAt: hbNow,
				};
				if (opts.agentSessionTTL > 0) {
					let newExpiry =
						hbNow.getTime() + opts.agentSessionTTL * 1000;
					const anchor =
						agent.activatedAt ?? agent.createdAt;
					if (opts.agentMaxLifetime > 0 && anchor) {
						const hardCap =
							new Date(anchor).getTime() +
							opts.agentMaxLifetime * 1000;
						newExpiry = Math.min(newExpiry, hardCap);
					}
					if (
						opts.absoluteLifetime > 0 &&
						agent.createdAt
					) {
						const absCap =
							new Date(agent.createdAt).getTime() +
							opts.absoluteLifetime * 1000;
						newExpiry = Math.min(newExpiry, absCap);
					}
					heartbeat.expiresAt = new Date(newExpiry);
				}
				ctx.context.runInBackground(
					ctx.context.adapter
						.update({
							model: TABLE.agent,
							where: [
								{
									field: "id",
									value: agent.id,
								},
							],
							update: heartbeat,
						})
						.catch(() => {}),
				);
			}

			if (ctx.path === "/agent/session") {
				return agentSession;
			}

			return { context: ctx };
		}),
	};
}

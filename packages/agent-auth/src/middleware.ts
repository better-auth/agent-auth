import type { HookEndpointContext } from "@better-auth/core";
import { type AuthMiddleware, createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { getAgentAuthAdapter } from "./adapter";
import { TABLE } from "./constants";
import { emit } from "./emit";
import { agentError, agentAuthChallenge, AGENT_AUTH_ERROR_CODES } from "./errors";
import { verifyAudience } from "./routes/_helpers";
import { parseCapabilityIds } from "./utils/capabilities";
import { verifyJWT, hashRequestBody } from "./utils/crypto";
import type { JtiCacheStore } from "./utils/jti-cache";
import type { JwksCacheStore } from "./utils/jwks-cache";

function logBackgroundError(label: string) {
	return (err: unknown) => {
		console.error(`[agent-auth] background ${label} failed:`, err);
	};
}

function isKeyAlgorithmAllowed(
	key: AgentJWK,
	allowedAlgorithms: string[],
): boolean {
	const keyAlg = key.crv ?? key.kty;
	return !!keyAlg && allowedAlgorithms.includes(keyAlg);
}
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
		const challenge = agentAuthChallenge(ctx.context.baseURL);
		try {
			const db = getAgentAuthAdapter(
				ctx.context.adapter as FullAdapter,
				opts,
			);
			const bearer = ctx.headers
				?.get("authorization")
				?.replace(/^Bearer\s+/i, "")!;

			let decoded: ReturnType<typeof decodeJwt>;
			let header: ReturnType<typeof decodeProtectedHeader>;
			try {
				decoded = decodeJwt(bearer);
				header = decodeProtectedHeader(bearer);
			} catch {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}

			// §4.2/§4.5: MUST validate typ header
			const typ = header.typ;
			if (typ !== "host+jwt" && typ !== "agent+jwt") {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}

			// Validate aud (common to both token types) — §4.3
			if (!decoded.aud) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}
			const capabilityLocations = (opts.capabilities ?? [])
				.filter((c) => c.location)
				.map((c) => c.location!);
			if (
				!verifyAudience(
					decoded.aud,
					ctx.context.baseURL,
					ctx.headers,
					opts.trustProxy,
					capabilityLocations,
				)
			) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}

			// ── Host JWT path (typ: "host+jwt") ──
			if (typ === "host+jwt") {
				// §4.2: iss = JWK thumbprint is the host identifier
				const hostIdFromIss = typeof decoded.iss === "string" ? decoded.iss : null;
				if (!hostIdFromIss) {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_JWT,
					);
				}

				const host = await db.findHostById(hostIdFromIss)
					?? await db.findHostByKid(hostIdFromIss);

				const hostAllowed =
					host &&
					(host.publicKey || host.jwksUrl) &&
					(host.status === "active" ||
						(host.status === "pending" && ctx.path === "/agent/status"));

				if (!hostAllowed) {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
					);
				}

				let hostPubKey: AgentJWK | null = null;
				if (host.jwksUrl && jwksCache) {
					try {
						if (header.kid) {
							hostPubKey = await jwksCache.getKeyByKid(host.jwksUrl, header.kid);
						}
					} catch (err) {
						console.error("[agent-auth] JWKS fetch failed for host %s:", host.id, err);
					}
				}
				if (!hostPubKey && host.publicKey) {
					try {
						hostPubKey = JSON.parse(host.publicKey) as AgentJWK;
					} catch {
						throw agentError(
							"UNAUTHORIZED",
							AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
						);
					}
				}
				if (!hostPubKey) {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
					);
				}
				if (!isKeyAlgorithmAllowed(hostPubKey, opts.allowedKeyAlgorithms)) {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
					);
				}
				const hostPayload = await verifyJWT({
					jwt: bearer,
					publicKey: hostPubKey,
					maxAge: opts.jwtMaxAge,
				});
				if (!hostPayload) {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_JWT,
					);
				}
				const hostCaps = parseCapabilityIds(
					host.defaultCapabilities,
				);
				const hostSession: HostSession = {
					host: {
						id: host.id,
						userId: host.userId,
						defaultCapabilities: hostCaps,
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

			// ── Agent JWT path (typ: "agent+jwt") ──
			const agentId = typeof decoded.sub === "string" ? decoded.sub : null;
			if (!agentId) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}

			let agent = await db.findAgentById(agentId);

			if (!agent) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
				);
			}

			if (agent.status === "revoked") {
				throw agentError(
					"FORBIDDEN",
					AGENT_AUTH_ERROR_CODES.AGENT_REVOKED,
				);
			}
			if (agent.status === "claimed") {
				throw agentError(
					"FORBIDDEN",
					AGENT_AUTH_ERROR_CODES.AGENT_CLAIMED,
				);
			}
			if (agent.status === "pending") {
				throw agentError(
					"FORBIDDEN",
					AGENT_AUTH_ERROR_CODES.AGENT_PENDING,
				);
			}
			if (agent.status === "rejected") {
				throw agentError(
					"FORBIDDEN",
					AGENT_AUTH_ERROR_CODES.AGENT_REJECTED,
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
							.catch(logBackgroundError("revoke-expired-agent")),
					);
					throw agentError(
						"FORBIDDEN",
						AGENT_AUTH_ERROR_CODES.ABSOLUTE_LIFETIME_EXCEEDED,
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
					if (header.kid) {
						publicKey = await jwksCache.getKeyByKid(agent.jwksUrl, header.kid);
					}
				} catch (err) {
					console.error("[agent-auth] JWKS fetch failed for agent %s:", agent.id, err);
				}
			}
			if (!publicKey && agent.publicKey) {
				try {
					publicKey = JSON.parse(agent.publicKey) as AgentJWK;
				} catch {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
					);
				}
			}
			if (!publicKey) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
				);
			}
			if (!isKeyAlgorithmAllowed(publicKey, opts.allowedKeyAlgorithms)) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_PUBLIC_KEY,
				);
			}
			const payload = await verifyJWT({
				jwt: bearer,
				publicKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload) {
				if (needsReactivation && agent.status === "active") {
				db.updateAgent(agent.id, {
					status: "expired",
					updatedAt: new Date(),
				}).catch(logBackgroundError("mark-agent-expired"));
				}
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}

			// JTI replay (§3.5) — partitioned by identity
			if (!payload.jti) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.INVALID_JWT,
				);
			}
			const jtiKey = `${agentId}:${payload.jti}`;
			if (await jtiCache.has(jtiKey)) {
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.JWT_REPLAY,
				);
			}
			await jtiCache.add(jtiKey, opts.jwtMaxAge);

			// Request binding verification (§3.3)
			if (payload.htm || payload.htu || payload.ath) {
				if (payload.htm) {
					const method = ctx.request?.method ?? ctx.headers?.get("x-http-method") ?? "";
					if (String(payload.htm).toUpperCase() !== method.toUpperCase()) {
						throw agentError(
							"UNAUTHORIZED",
							AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
						);
					}
				}
				if (payload.htu) {
					const reqUrl = new URL(ctx.request?.url ?? ctx.context.baseURL);
					const expectedUrl = `${reqUrl.protocol}//${reqUrl.host}${reqUrl.pathname}`;
					if (String(payload.htu) !== expectedUrl) {
						throw agentError(
							"UNAUTHORIZED",
							AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
						);
					}
				}
				if (payload.ath && ctx.body) {
					const bodyStr = typeof ctx.body === "string"
						? ctx.body
						: JSON.stringify(ctx.body);
					const bodyHash = await hashRequestBody(bodyStr);
					if (String(payload.ath) !== bodyHash) {
						throw agentError(
							"UNAUTHORIZED",
							AGENT_AUTH_ERROR_CODES.REQUEST_BINDING_MISMATCH,
						);
					}
				}
			}

			if (needsReactivation) {
				const reactivated =
					await db.transparentReactivation(agent);
				if (!reactivated) {
					throw agentError(
						"UNAUTHORIZED",
						AGENT_AUTH_ERROR_CODES.AGENT_EXPIRED,
					);
				}
				agent = reactivated;
				emit(opts, {
					type: "agent.reactivated",
					actorType: "system",
					agentId: agent.id,
					hostId: agent.hostId ?? undefined,
					metadata: { transparent: true },
				}, ctx);
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
				throw agentError(
					"UNAUTHORIZED",
					AGENT_AUTH_ERROR_CODES.AUTONOMOUS_OWNER_REQUIRED,
					"Could not resolve a session user for this agent.",
				);
			}

			const now = new Date();
			const activeGrants = grants.filter(
				(g) =>
					g.status === "active" &&
					(!g.expiresAt || new Date(g.expiresAt) > now),
			);

			// Intersect with JWT's capabilities claim (§5.3)
			let effectiveGrants = activeGrants;
			const jwtCaps = payload.capabilities;
			if (jwtCaps && Array.isArray(jwtCaps)) {
				const jwtCapSet = new Set(jwtCaps as string[]);
				effectiveGrants = activeGrants.filter((g) =>
					jwtCapSet.has(g.capability),
				);
			}

			const agentSession: AgentSession = {
				type: agent.mode,
				agent: {
					id: agent.id,
					name: agent.name,
					mode: agent.mode,
					capabilityGrants: effectiveGrants.map((g) => ({
						capability: g.capability,
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
					.catch(logBackgroundError("agent-heartbeat")),
			);
			}

			if (ctx.path === "/agent/session") {
				return agentSession;
			}

			return { context: ctx };
		} catch (e) {
			if (e instanceof APIError && (e.statusCode === 401 || e.status === "UNAUTHORIZED")) {
				Object.assign(e.headers, challenge);
			}
			throw e;
		}
		}),
	};
}

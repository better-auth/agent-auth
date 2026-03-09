import { createAuthEndpoint } from "@better-auth/core/api";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { hasCapability, parseCapabilityIds } from "../utils/capabilities";
import { verifyAgentJWT } from "../utils/crypto";
import type { JwksCacheStore } from "../utils/jwks-cache";
import { MemoryJwksCache } from "../utils/jwks-cache";
import type { JtiCacheStore } from "../utils/jti-cache";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	AgentJWK,
	ResolvedAgentAuthOptions,
} from "../types";
import {
	buildApprovalInfo,
	createGrantRows,
	findHostByKey,
	formatGrantsResponse,
	isDynamicHostAllowed,
	resolveDynamicHostDefaultCapabilities,
	validateCapabilityIds,
	validateCapabilitiesExist,
	validateKeyAlgorithm,
	verifyAudience,
} from "./_helpers";

const registerBodySchema = z.object({
	name: z.string().min(1),
	capabilities: z.array(z.string()).optional(),
	reason: z.string().optional(),
	mode: z.enum(["delegated", "autonomous"]).optional(),
	preferred_method: z.enum(["device_authorization", "ciba"]).optional(),
});

export function register(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
	jwksCache?: JwksCacheStore,
) {
	const cache = jwksCache ?? new MemoryJwksCache();
	return createAuthEndpoint(
		"/agent/register",
		{
			method: "POST",
			body: registerBodySchema,
			metadata: {
				openapi: {
					description:
						"Register a new agent (§6.3). Requires host JWT in the Authorization header.",
				},
			},
		},
		async (ctx) => {
		const {
			name,
			capabilities: requestedCapIds,
			reason,
			mode: rawMode,
			preferred_method: preferredMethod,
		} = ctx.body;

			// ---------- Require host JWT ----------
			const authHeader = ctx.headers?.get("authorization");
			const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");
			const hostJWT =
				bearerToken &&
				bearerToken !== authHeader &&
				bearerToken.split(".").length === 3
					? bearerToken
					: null;

			if (!hostJWT) {
				throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			const mode = rawMode ?? "delegated";

			if (!opts.modes.includes(mode)) {
				throw agentError("BAD_REQUEST", ERR.UNSUPPORTED_MODE);
			}

			// ---------- Decode host JWT ----------
			let decoded: Record<string, unknown>;
			let hostIdFromJwt: string | null = null;

			try {
				decoded = decodeJwt(hostJWT);
				if (decoded.sub) hostIdFromJwt = String(decoded.sub);
			} catch {
				throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			let agentPublicKey: Record<string, unknown> | null = null;
			let agentJwksUrl: string | null = null;

			if (
				decoded.agent_public_key &&
				typeof decoded.agent_public_key === "object"
			) {
				agentPublicKey = decoded.agent_public_key as Record<
					string,
					unknown
				>;
			}
			if (
				decoded.agent_jwks_url &&
				typeof decoded.agent_jwks_url === "string"
			) {
				agentJwksUrl = decoded.agent_jwks_url;
			}

			const hostJwksUrl =
				decoded.host_jwks_url &&
				typeof decoded.host_jwks_url === "string"
					? decoded.host_jwks_url
					: null;
			const hostInlinePubKey =
				decoded.host_public_key &&
				typeof decoded.host_public_key === "object"
					? (decoded.host_public_key as AgentJWK)
					: null;

			// ---------- Resolve host ----------
			let userId: string | null = null;
			let hostId: string | null = null;
			let hostDefaultCaps: string[] | null = null;
			let hostRecord: AgentHost | null = null;

			if (hostIdFromJwt) {
				hostRecord = await ctx.context.adapter.findOne<AgentHost>({
					model: TABLE.host,
					where: [{ field: "id", value: hostIdFromJwt }],
				});
			}

			if (hostRecord) {
				// ---- Known host ----
				if (hostRecord.status === "revoked") {
					throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
				}

				if (
					hostRecord.status !== "active" &&
					hostRecord.status !== "pending"
				) {
					throw agentError("FORBIDDEN", ERR.HOST_EXPIRED);
				}

				if (!hostRecord.publicKey && !hostRecord.jwksUrl) {
					throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
				}

				let hostPubKey: AgentJWK;
				if (hostRecord.jwksUrl) {
					const header = await decodeProtectedHeader(hostJWT);
					if (!header.kid) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.INVALID_JWT,
						);
					}
					const key = await cache.getKeyByKid(
						hostRecord.jwksUrl,
						header.kid,
					);
					if (!key) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.INVALID_PUBLIC_KEY,
						);
					}
					hostPubKey = key;
				} else {
					try {
						hostPubKey = JSON.parse(
							hostRecord.publicKey!,
						) as AgentJWK;
					} catch {
						throw agentError(
							"FORBIDDEN",
							ERR.INVALID_PUBLIC_KEY,
						);
					}
				}

				const payload = await verifyAgentJWT({
					jwt: hostJWT,
					publicKey: hostPubKey,
					maxAge: opts.jwtMaxAge,
				});

				if (!payload || payload.sub !== hostRecord.id) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				if (payload.aud) {
					if (
						!verifyAudience(
							payload.aud,
							ctx.context.baseURL,
							ctx.headers,
						)
					) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.INVALID_JWT,
						);
					}
				}

				// JTI replay (§5.6)
				if (!opts.dangerouslySkipJtiCheck) {
					if (!payload.jti) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.INVALID_JWT,
						);
					}
					if (jtiCache && (await jtiCache.has(String(payload.jti)))) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.JWT_REPLAY,
						);
					}
					if (jtiCache) {
						await jtiCache.add(String(payload.jti), opts.jwtMaxAge);
					}
				}

				userId = hostRecord.userId ?? null;
				hostId = hostRecord.id;
				hostDefaultCaps = parseCapabilityIds(
					hostRecord.defaultCapabilities,
				);

				const bgUpdates: Record<string, unknown> = {};
				if (hostJwksUrl && !hostRecord.jwksUrl) {
					bgUpdates.jwksUrl = hostJwksUrl;
				}
				const jwtHostName =
					typeof decoded.host_name === "string"
						? decoded.host_name
						: null;
				if (jwtHostName && jwtHostName !== hostRecord.name) {
					bgUpdates.name = jwtHostName;
				}
				if (Object.keys(bgUpdates).length > 0) {
					ctx.context.runInBackground(
						ctx.context.adapter
							.update({
								model: TABLE.host,
								where: [
									{ field: "id", value: hostRecord.id },
								],
								update: bgUpdates,
							})
							.catch(() => {}),
					);
				}

				const heartbeat: Record<string, unknown> = {
					lastUsedAt: new Date(),
				};
				if (opts.agentSessionTTL > 0) {
					heartbeat.expiresAt = new Date(
						Date.now() + opts.agentSessionTTL * 1000,
					);
				}
				ctx.context.runInBackground(
					ctx.context.adapter
						.update({
							model: TABLE.host,
							where: [
								{ field: "id", value: hostRecord.id },
							],
							update: heartbeat,
						})
						.catch(() => {}),
				);
			} else {
				// ---- Unknown host — dynamic registration ----
				if (!(await isDynamicHostAllowed(opts, ctx))) {
					throw agentError(
						"FORBIDDEN",
						ERR.DYNAMIC_HOST_REGISTRATION_DISABLED,
					);
				}

				let resolvedHostPubKey: AgentJWK | null = null;

				if (hostJwksUrl) {
					const header = decodeProtectedHeader(hostJWT);
					if (header.kid) {
						const key = await cache.getKeyByKid(
							hostJwksUrl,
							header.kid,
						);
						if (key) resolvedHostPubKey = key;
					}
				}

				if (!resolvedHostPubKey && hostInlinePubKey) {
					resolvedHostPubKey = hostInlinePubKey;
				}

				if (!resolvedHostPubKey) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				const payload = await verifyAgentJWT({
					jwt: hostJWT,
					publicKey: resolvedHostPubKey,
					maxAge: opts.jwtMaxAge,
				});

				if (!payload) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				if (payload.aud) {
					if (
						!verifyAudience(
							payload.aud,
							ctx.context.baseURL,
							ctx.headers,
						)
					) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.INVALID_JWT,
						);
					}
				}

				// JTI replay (§5.6)
				if (!opts.dangerouslySkipJtiCheck) {
					if (!payload.jti) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.INVALID_JWT,
						);
					}
					if (jtiCache && (await jtiCache.has(String(payload.jti)))) {
						throw agentError(
							"UNAUTHORIZED",
							ERR.JWT_REPLAY,
						);
					}
					if (jtiCache) {
						await jtiCache.add(String(payload.jti), opts.jwtMaxAge);
					}
				}

				const existingHost = await findHostByKey(
					ctx.context.adapter,
					resolvedHostPubKey,
				);
				if (existingHost) {
					if (
						payload.sub &&
						payload.sub !== existingHost.id
					) {
						throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
					}
					hostRecord = existingHost;
					hostId = existingHost.id;
					userId = existingHost.userId ?? null;
					hostDefaultCaps = parseCapabilityIds(
						existingHost.defaultCapabilities,
					);
				} else {
					const isAutonomous = mode === "autonomous";
					const hostNow = new Date();
					const hostKid = resolvedHostPubKey.kid ?? null;
					const jwtHostName =
						typeof decoded.host_name === "string"
							? decoded.host_name
							: null;
					const dynCaps =
						await resolveDynamicHostDefaultCapabilities(
							opts,
							{
								ctx,
								mode,
								userId: null,
								hostId: null,
								hostName: jwtHostName,
							},
						);
					const newHost = await ctx.context.adapter.create<
						Record<string, unknown>,
						AgentHost
					>({
						model: TABLE.host,
						data: {
							name: jwtHostName,
							userId: null,
							publicKey: JSON.stringify(resolvedHostPubKey),
							kid: hostKid,
							jwksUrl: hostJwksUrl,
							enrollmentTokenHash: null,
							enrollmentTokenExpiresAt: null,
							defaultCapabilities: dynCaps,
							status: isAutonomous ? "active" : "pending",
							activatedAt: isAutonomous ? hostNow : null,
							expiresAt: null,
							lastUsedAt: null,
							createdAt: hostNow,
							updatedAt: hostNow,
						},
					});

					hostRecord = newHost;
					hostId = newHost.id;
					userId = null;
					hostDefaultCaps = dynCaps;
				}
			}

			if (mode === "autonomous" && userId) {
				throw agentError("BAD_REQUEST", ERR.UNSUPPORTED_MODE);
			}

			const publicKey = agentPublicKey;
			if (agentJwksUrl && !publicKey) {
				// Key resolved from JWKS at verification time
			} else if (
				!publicKey ||
				!publicKey.kty ||
				!publicKey.x
			) {
				throw agentError("BAD_REQUEST", ERR.INVALID_PUBLIC_KEY);
			}

			if (publicKey) {
				validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);
			}

			// ---------- Agent limit ----------
			if (opts.maxAgentsPerUser > 0 && userId) {
				const activeCount = await ctx.context.adapter.count({
					model: TABLE.agent,
					where: [
						{ field: "userId", value: userId },
						{ field: "status", value: "active" },
					],
				});
				if (activeCount >= opts.maxAgentsPerUser) {
					throw agentError(
						"BAD_REQUEST",
						ERR.AGENT_LIMIT_REACHED,
					);
				}
			}

			// ---------- Resolve capabilities ----------
			const isHostPending = hostRecord?.status === "pending";

			let resolvedCaps: string[];
			let pendingCaps: string[] = [];

			if (hostDefaultCaps !== null && hostDefaultCaps.length > 0) {
				const budget = hostDefaultCaps;
				if (requestedCapIds && requestedCapIds.length > 0) {
					resolvedCaps = requestedCapIds.filter((c) =>
						hasCapability(budget, c),
					);
					pendingCaps = requestedCapIds.filter(
						(c) => !hasCapability(budget, c),
					);
				} else {
					resolvedCaps = budget;
				}
			} else if (requestedCapIds && requestedCapIds.length > 0) {
				if (
					hostId &&
					hostDefaultCaps !== null &&
					(hostRecord?.status === "active" || isHostPending)
				) {
					resolvedCaps = [];
					pendingCaps = requestedCapIds;
				} else {
					resolvedCaps = requestedCapIds;
				}
			} else {
				resolvedCaps = [];
			}

			if (pendingCaps.length > 0 && !userId && mode === "autonomous") {
				throw agentError(
					"FORBIDDEN",
					ERR.CAPABILITY_DENIED,
					"Requested capabilities are not pre-authorized for this autonomous host.",
				);
			}

			validateCapabilityIds(resolvedCaps, opts);
			await validateCapabilitiesExist(resolvedCaps, opts);

			// ---------- Create agent ----------
			const now = new Date();
			const kid = publicKey
				? ((publicKey.kid as string | undefined) ?? null)
				: null;
			const needsApproval = isHostPending || pendingCaps.length > 0;
			const agentStatus = needsApproval ? "pending" : "active";
			const expiresAt =
				!needsApproval && opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			const agent = await ctx.context.adapter.create<
				Record<string, unknown>,
				Agent
			>({
				model: TABLE.agent,
				data: {
					name,
					userId: userId ?? null,
					hostId,
					status: agentStatus,
					mode,
					publicKey: publicKey ? JSON.stringify(publicKey) : "",
					kid,
					jwksUrl: agentJwksUrl,
					lastUsedAt: null,
					activatedAt: needsApproval ? null : now,
					expiresAt,
					metadata: null,
					createdAt: now,
					updatedAt: now,
				},
			});

			await createGrantRows(
				ctx.context.adapter,
				agent.id,
				resolvedCaps,
				userId,
				{ reason: reason ?? null },
				{ pluginOpts: opts, hostId, userId },
			);

			if (pendingCaps.length > 0) {
				await createGrantRows(
					ctx.context.adapter,
					agent.id,
					pendingCaps,
					userId,
					{
						status: "pending",
						reason:
							reason ?? "Capability not pre-authorized by host",
					},
				);
			}

			const allGrants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [{ field: "agentId", value: agent.id }],
				});

			const response: Record<string, unknown> = {
				agent_id: agent.id,
				host_id: hostId,
				name: agent.name,
				mode: agent.mode,
				status: agentStatus,
				agent_capability_grants: formatGrantsResponse(allGrants),
			};

			if (pendingCaps.length > 0 || isHostPending) {
				const origin = new URL(ctx.context.baseURL).origin;
				response.approval = await buildApprovalInfo(
					opts,
					ctx.context.adapter,
					ctx.context.internalAdapter,
					{
						origin,
						agentId: agent.id,
						userId,
						agentName: name,
						hostId,
						capabilities: [...resolvedCaps, ...pendingCaps],
						preferredMethod,
					},
				);
			}

			emit(opts, {
				type: "agent.created",
				actorId: userId ?? undefined,
				agentId: agent.id,
				hostId: hostId ?? undefined,
				metadata: {
					name,
					mode,
					capabilities: resolvedCaps,
					pendingCapabilities: pendingCaps,
				},
			}, ctx);

			return ctx.json(response);
		},
	);
}

import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import { TABLE } from "../constants";
import { emit } from "../emit";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	AgentJWK,
	Constraints,
	ResolvedAgentAuthOptions,
} from "../types";
import { normalizeCapabilityRequests } from "../types";
import { hasCapability, parseCapabilityIds } from "../utils/capabilities";
import { verifyJWT } from "../utils/crypto";
import type { JtiCacheStore } from "../utils/jti-cache";
import type { JwksCacheStore } from "../utils/jwks-cache";
import { MemoryJwksCache } from "../utils/jwks-cache";
import {
	buildApprovalInfo,
	capabilityItemZ,
	createGrantRows,
	findHostByKey,
	formatGrantsResponse,
	isDynamicHostAllowed,
	resolveDefaultHostCapabilities,
	validateCapabilitiesExist,
	validateCapabilityIds,
	validateKeyAlgorithm,
	verifyAudience,
} from "./_helpers";

const _capabilityRequestItem = z.union([
	z.string(),
	z.object({
		name: z.string(),
		constraints: z.record(z.string(), z.unknown()).optional(),
	}),
]);

const registerBodySchema = z.object({
	name: z.string().min(1),
	capabilities: z.array(capabilityItemZ).optional(),
	reason: z.string().optional(),
	mode: z.enum(["delegated", "autonomous"]).optional(),
	preferred_method: z.string().optional(),
	host_name: z.string().optional(),
	login_hint: z.string().optional(),
	binding_message: z.string().optional(),
	force_approval: z.boolean().optional(),
});

export function register(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
	jwksCache?: JwksCacheStore
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
				capabilities: rawCapabilities,
				reason,
				mode: rawMode,
				preferred_method: preferredMethod,
				host_name: bodyHostName,
				login_hint: loginHint,
				binding_message: bindingMessage,
				force_approval: forceApproval,
			} = ctx.body;

			const normalizedCaps = rawCapabilities
				? normalizeCapabilityRequests(
						rawCapabilities as Array<
							string | { name: string; constraints?: Constraints }
						>
					)
				: null;
			const requestedCapIds = normalizedCaps?.map((c) => c.name) ?? null;
			const constraintsMap = new Map<string, Constraints | null>();
			if (normalizedCaps) {
				for (const c of normalizedCaps) {
					constraintsMap.set(c.name, c.constraints);
				}
			}

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
				const regHeader = decodeProtectedHeader(hostJWT);
				// §4.2: Host JWTs MUST have typ: "host+jwt"
				if (regHeader.typ !== "host+jwt") {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}
				// §4.2: iss = JWK thumbprint is the host identifier
				if (typeof decoded.iss === "string") {
					hostIdFromJwt = decoded.iss;
				}
			} catch (e) {
				if (e instanceof APIError) {
					throw e;
				}
				throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			let agentPublicKey: Record<string, unknown> | null = null;
			let agentJwksUrl: string | null = null;

			if (
				decoded.agent_public_key &&
				typeof decoded.agent_public_key === "object"
			) {
				agentPublicKey = decoded.agent_public_key as Record<string, unknown>;
			}
			if (
				decoded.agent_jwks_url &&
				typeof decoded.agent_jwks_url === "string"
			) {
				agentJwksUrl = decoded.agent_jwks_url;
			}

			const hostJwksUrl =
				decoded.host_jwks_url && typeof decoded.host_jwks_url === "string"
					? decoded.host_jwks_url
					: null;
			const hostInlinePubKey =
				decoded.host_public_key && typeof decoded.host_public_key === "object"
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

				if (hostRecord.status !== "active" && hostRecord.status !== "pending") {
					throw agentError("FORBIDDEN", ERR.HOST_EXPIRED);
				}

				if (!(hostRecord.publicKey || hostRecord.jwksUrl)) {
					throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
				}

				let hostPubKey: AgentJWK;
				if (hostRecord.jwksUrl) {
					const header = await decodeProtectedHeader(hostJWT);
					if (!header.kid) {
						throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
					}
					const key = await cache.getKeyByKid(hostRecord.jwksUrl, header.kid);
					if (!key) {
						throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
					}
					hostPubKey = key;
				} else {
					try {
						hostPubKey = JSON.parse(hostRecord.publicKey!) as AgentJWK;
					} catch {
						throw agentError("FORBIDDEN", ERR.INVALID_PUBLIC_KEY);
					}
				}

				const payload = await verifyJWT({
					jwt: hostJWT,
					publicKey: hostPubKey,
					maxAge: opts.jwtMaxAge,
				});

				// §4.2: iss identifies the host
				if (!payload || payload.iss !== hostRecord.id) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				if (
					payload.aud &&
					!verifyAudience(
						payload.aud,
						ctx.context.baseURL,
						ctx.headers,
						opts.trustProxy
					)
				) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				// JTI replay (§5.6) — partitioned by host identity
				if (!opts.dangerouslySkipJtiCheck) {
					if (!payload.jti) {
						throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
					}
					const jtiKey = `host:${hostRecord.id}:${payload.jti}`;
					if (jtiCache && (await jtiCache.has(jtiKey))) {
						throw agentError("UNAUTHORIZED", ERR.JWT_REPLAY);
					}
					if (jtiCache) {
						await jtiCache.add(jtiKey, opts.jwtMaxAge);
					}
				}

				userId = hostRecord.userId ?? null;
				hostId = hostRecord.id;
				hostDefaultCaps = parseCapabilityIds(hostRecord.defaultCapabilities);

				const bgUpdates: Record<string, unknown> = {};
				if (hostJwksUrl && !hostRecord.jwksUrl) {
					bgUpdates.jwksUrl = hostJwksUrl;
				}
				const jwtHostName =
					typeof decoded.host_name === "string" ? decoded.host_name : null;
				const resolvedHostName = jwtHostName ?? bodyHostName ?? null;
				if (resolvedHostName && resolvedHostName !== hostRecord.name) {
					bgUpdates.name = resolvedHostName;
				}
				if (
					mode === "autonomous" &&
					!hostRecord.userId &&
					hostRecord.status === "pending"
				) {
					bgUpdates.status = "active";
					bgUpdates.activatedAt = new Date();
					hostRecord = {
						...hostRecord,
						status: "active",
						activatedAt: bgUpdates.activatedAt,
					} as AgentHost;

					const dynCaps = await resolveDefaultHostCapabilities(opts, {
						ctx,
						mode,
						userId: null,
						hostId: hostRecord.id,
						hostName: resolvedHostName ?? hostRecord.name,
					});
					if (dynCaps.length > 0) {
						bgUpdates.defaultCapabilities = dynCaps;
						hostDefaultCaps = dynCaps;
						hostRecord = {
							...hostRecord,
							defaultCapabilities: dynCaps,
						} as AgentHost;
					}
				}
				if (Object.keys(bgUpdates).length > 0) {
					ctx.context.runInBackground(
						ctx.context.adapter
							.update({
								model: TABLE.host,
								where: [{ field: "id", value: hostRecord.id }],
								update: bgUpdates,
							})
							.catch((err) => {
								console.error(
									"[agent-auth] background host-update failed:",
									err
								);
							})
					);
				}

				const heartbeat: Record<string, unknown> = {
					lastUsedAt: new Date(),
				};
				if (opts.agentSessionTTL > 0) {
					heartbeat.expiresAt = new Date(
						Date.now() + opts.agentSessionTTL * 1000
					);
				}
				ctx.context.runInBackground(
					ctx.context.adapter
						.update({
							model: TABLE.host,
							where: [{ field: "id", value: hostRecord.id }],
							update: heartbeat,
						})
						.catch((err) => {
							console.error(
								"[agent-auth] background host-heartbeat failed:",
								err
							);
						})
				);
			} else {
				// ---- Unknown host — dynamic registration ----
				if (!(await isDynamicHostAllowed(opts, ctx))) {
					throw agentError("FORBIDDEN", ERR.DYNAMIC_HOST_REGISTRATION_DISABLED);
				}

				let resolvedHostPubKey: AgentJWK | null = null;

				if (hostJwksUrl) {
					const header = decodeProtectedHeader(hostJWT);
					if (header.kid) {
						const key = await cache.getKeyByKid(hostJwksUrl, header.kid);
						if (key) {
							resolvedHostPubKey = key;
						}
					}
				}

				if (!resolvedHostPubKey && hostInlinePubKey) {
					resolvedHostPubKey = hostInlinePubKey;
				}

				if (!resolvedHostPubKey) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				const payload = await verifyJWT({
					jwt: hostJWT,
					publicKey: resolvedHostPubKey,
					maxAge: opts.jwtMaxAge,
				});

				if (!payload) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				if (
					payload.aud &&
					!verifyAudience(
						payload.aud,
						ctx.context.baseURL,
						ctx.headers,
						opts.trustProxy
					)
				) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}

				// JTI replay (§5.6) — partitioned by sub (host identity)
				if (!opts.dangerouslySkipJtiCheck) {
					if (!payload.jti) {
						throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
					}
					const jtiKey = `host:${payload.iss ?? "dynamic"}:${payload.jti}`;
					if (jtiCache && (await jtiCache.has(jtiKey))) {
						throw agentError("UNAUTHORIZED", ERR.JWT_REPLAY);
					}
					if (jtiCache) {
						await jtiCache.add(jtiKey, opts.jwtMaxAge);
					}
				}

				const existingHost = await findHostByKey(
					ctx.context.adapter,
					resolvedHostPubKey
				);
				if (existingHost) {
					hostRecord = existingHost;
					hostId = existingHost.id;
					userId = existingHost.userId ?? null;
					hostDefaultCaps = parseCapabilityIds(
						existingHost.defaultCapabilities
					);

					const jwtHostName =
						typeof decoded.host_name === "string" ? decoded.host_name : null;
					const resolvedName = jwtHostName ?? bodyHostName ?? null;
					const bgUpdates: Record<string, unknown> = {};
					if (resolvedName && resolvedName !== existingHost.name) {
						bgUpdates.name = resolvedName;
					}
					if (hostJwksUrl && !existingHost.jwksUrl) {
						bgUpdates.jwksUrl = hostJwksUrl;
					}
					if (
						mode === "autonomous" &&
						!existingHost.userId &&
						existingHost.status === "pending"
					) {
						bgUpdates.status = "active";
						bgUpdates.activatedAt = new Date();
						hostRecord = {
							...hostRecord,
							status: "active",
							activatedAt: bgUpdates.activatedAt,
						} as AgentHost;

						const dynCaps = await resolveDefaultHostCapabilities(opts, {
							ctx,
							mode,
							userId: null,
							hostId: existingHost.id,
							hostName: resolvedName ?? existingHost.name,
						});
						if (dynCaps.length > 0) {
							bgUpdates.defaultCapabilities = dynCaps;
							hostDefaultCaps = dynCaps;
							hostRecord = {
								...hostRecord,
								defaultCapabilities: dynCaps,
							} as AgentHost;
						}
					}
					if (Object.keys(bgUpdates).length > 0) {
						bgUpdates.updatedAt = new Date();
						hostRecord = { ...hostRecord, ...bgUpdates } as AgentHost;
						ctx.context.runInBackground(
							ctx.context.adapter
								.update({
									model: TABLE.host,
									where: [{ field: "id", value: existingHost.id }],
									update: bgUpdates,
								})
								.catch(() => {})
						);
					}
				} else {
					const isAutonomous = mode === "autonomous";
					const hostNow = new Date();
					const hostKid = resolvedHostPubKey.kid ?? null;
					const jwtHostName =
						typeof decoded.host_name === "string" ? decoded.host_name : null;
					const resolvedDynHostName = jwtHostName ?? bodyHostName ?? null;
					const dynCaps = await resolveDefaultHostCapabilities(opts, {
						ctx,
						mode,
						userId: null,
						hostId: null,
						hostName: resolvedDynHostName,
					});
					const newHost = await ctx.context.adapter.create<
						Record<string, unknown>,
						AgentHost
					>({
						model: TABLE.host,
						data: {
							name: resolvedDynHostName,
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
			} else if (!(publicKey?.kty && publicKey.x)) {
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
					throw agentError("BAD_REQUEST", ERR.AGENT_LIMIT_REACHED);
				}
			}

			// ---------- Resolve capabilities ----------
			const isHostPending = hostRecord?.status === "pending";

			let resolvedCapNames: string[];
			let pendingCapNames: string[] = [];

			if (hostDefaultCaps !== null && hostDefaultCaps.length > 0) {
				const budget = hostDefaultCaps;
				if (requestedCapIds && requestedCapIds.length > 0) {
					resolvedCapNames = requestedCapIds.filter((c) =>
						hasCapability(budget, c)
					);
					pendingCapNames = requestedCapIds.filter(
						(c) => !hasCapability(budget, c)
					);
				} else {
					resolvedCapNames = budget;
				}
			} else if (requestedCapIds && requestedCapIds.length > 0) {
				if (
					hostId &&
					hostDefaultCaps !== null &&
					(hostRecord?.status === "active" || isHostPending)
				) {
					resolvedCapNames = [];
					pendingCapNames = requestedCapIds;
				} else {
					resolvedCapNames = requestedCapIds;
				}
			} else {
				resolvedCapNames = [];
			}

			if (pendingCapNames.length > 0 && mode === "autonomous" && !userId) {
				pendingCapNames = [];
			}

			const allRequestedCaps = [...resolvedCapNames, ...pendingCapNames];
			validateCapabilityIds(allRequestedCaps, opts);
			await validateCapabilitiesExist(allRequestedCaps, opts);

			// ---------- force_approval: move all resolved caps to pending ----------
			if (forceApproval && resolvedCapNames.length > 0) {
				pendingCapNames = [...resolvedCapNames, ...pendingCapNames];
				resolvedCapNames = [];
			}

			const agentUserId = forceApproval ? null : userId;

			// ---------- Idempotency check (§6.3) ----------
			const agentPubKeyStr = publicKey ? JSON.stringify(publicKey) : "";
			if (hostId && agentPubKeyStr) {
				const existingAgents = await ctx.context.adapter.findMany<Agent>({
					model: TABLE.agent,
					where: [
						{ field: "hostId", value: hostId },
						{ field: "publicKey", value: agentPubKeyStr },
					],
				});
				const existing = existingAgents[0];
				if (existing) {
					if (existing.status === "pending") {
						const existingGrants =
							await ctx.context.adapter.findMany<AgentCapabilityGrant>({
								model: TABLE.grant,
								where: [{ field: "agentId", value: existing.id }],
							});
						const response: Record<string, unknown> = {
							agent_id: existing.id,
							host_id: hostId,
							name: existing.name,
							mode: existing.mode,
							status: "pending",
							agent_capability_grants: formatGrantsResponse(
								existingGrants,
								opts.capabilities
							),
						};
						const origin = new URL(ctx.context.baseURL).origin;
						response.approval = await buildApprovalInfo(
							opts,
							ctx.context.adapter,
							ctx.context.internalAdapter,
							{
								origin,
								agentId: existing.id,
								userId,
								agentName: existing.name,
								hostId,
								capabilities: allRequestedCaps,
								preferredMethod,
								loginHint,
								bindingMessage,
							}
						);
						return ctx.json(response);
					}
					throw agentError("CONFLICT", ERR.AGENT_EXISTS);
				}
			}

			// ---------- Create agent ----------
			const now = new Date();
			const kid = publicKey
				? ((publicKey.kid as string | undefined) ?? null)
				: null;
			const needsApproval =
				forceApproval || isHostPending || pendingCapNames.length > 0;
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
					userId: agentUserId ?? null,
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
				resolvedCapNames,
				agentUserId,
				{
					reason: reason ?? null,
					...(isHostPending ? { status: "pending" } : {}),
					constraintsMap,
				},
				isHostPending
					? undefined
					: { pluginOpts: opts, hostId, userId: agentUserId }
			);

			if (pendingCapNames.length > 0) {
				await createGrantRows(
					ctx.context.adapter,
					agent.id,
					pendingCapNames,
					agentUserId,
					{
						status: "pending",
						reason:
							reason ??
							(forceApproval
								? "Approval requested by agent"
								: "Capability not pre-authorized by host"),
						constraintsMap,
					}
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
				agent_capability_grants: formatGrantsResponse(
					allGrants,
					opts.capabilities
				),
			};

			if (needsApproval) {
				const origin = new URL(ctx.context.baseURL).origin;
				response.approval = await buildApprovalInfo(
					opts,
					ctx.context.adapter,
					ctx.context.internalAdapter,
					{
						origin,
						agentId: agent.id,
						userId: agentUserId,
						agentName: name,
						hostId,
						capabilities: [...resolvedCapNames, ...pendingCapNames],
						preferredMethod,
						loginHint,
						bindingMessage,
					}
				);
			}

			emit(
				opts,
				{
					type: "agent.created",
					actorId: agentUserId ?? undefined,
					agentId: agent.id,
					hostId: hostId ?? undefined,
					metadata: {
						name,
						mode,
						capabilities: resolvedCapNames,
						pendingCapabilities: pendingCapNames,
						...(forceApproval ? { forceApproval: true } : {}),
					},
				},
				ctx
			);

			return ctx.json(response);
		}
	);
}

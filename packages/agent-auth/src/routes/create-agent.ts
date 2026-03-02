import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { JtiReplayCache } from "../jti-cache";
import { JWKSCache } from "../jwks-cache";
import { findBlockedScopes, hasScope } from "../scopes";
import type {
	Agent,
	AgentHost,
	CibaAuthRequest,
	ResolvedAgentAuthOptions,
} from "../types";

const jwksCache = new JWKSCache();

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";
const CIBA_TABLE = "cibaAuthRequest";
const CIBA_DEFAULT_INTERVAL = 5;
const CIBA_DEFAULT_EXPIRES_IN = 300;

function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		if (i === 4) code += "-";
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

const createAgentBodySchema = z.object({
	name: z.string().min(1).meta({ description: "Friendly name for the agent" }),
	publicKey: z
		.record(
			z.string(),
			z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
		)
		.meta({ description: "Agent's Ed25519 public key as JWK" })
		.optional(),
	scopes: z
		.array(z.string())
		.meta({
			description:
				"Scope strings the agent is granted. When used with hostJWT, must be a subset of the host's scopes.",
		})
		.optional(),
	reason: z
		.string()
		.meta({
			description:
				"Human-readable reason for the request. Displayed to the user on the approval screen (§2.2).",
		})
		.optional(),
	hostJWT: z
		.string()
		.meta({
			description:
				"A JWT signed by the host's private key. Contains host_public_key/host_jwks_url and agent_public_key/agent_jwks_url (§2.2).",
		})
		.optional(),
	hostPublicKey: z
		.record(
			z.string(),
			z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
		)
		.meta({
			description:
				"Host's public key for dynamic host registration. When provided with a user session (no hostJWT), the server registers the host automatically.",
		})
		.optional(),
	mode: z
		.enum(["behalf_of", "autonomous"])
		.meta({
			description:
				'Agent operating mode. "behalf_of" (default) acts on behalf of a user; "autonomous" operates independently.',
		})
		.optional(),
	metadata: z
		.record(
			z.string(),
			z.union([z.string(), z.number(), z.boolean(), z.null()]),
		)
		.meta({ description: "Optional metadata" })
		.optional(),
});

async function createPermissionRows(
	adapter: {
		create: (args: {
			model: string;
			data: Record<string, unknown>;
		}) => Promise<unknown>;
		delete: (args: {
			model: string;
			where: { field: string; value: string }[];
		}) => Promise<unknown>;
		findMany: <T>(args: {
			model: string;
			where: { field: string; value: string }[];
		}) => Promise<T[]>;
	},
	agentId: string,
	scopes: string[],
	grantedBy: string | null,
	opts?: {
		clearExisting?: boolean;
		status?: "active" | "pending";
		reason?: string | null;
	},
) {
	if (opts?.clearExisting) {
		const existing = await adapter.findMany<{ id: string }>({
			model: PERMISSION_TABLE,
			where: [{ field: "agentId", value: agentId }],
		});
		for (const perm of existing) {
			await adapter.delete({
				model: PERMISSION_TABLE,
				where: [{ field: "id", value: perm.id }],
			});
		}
	}

	const now = new Date();
	for (const scope of scopes) {
		await adapter.create({
			model: PERMISSION_TABLE,
			data: {
				agentId,
				scope,
				referenceId: null,
				grantedBy,
				expiresAt: null,
				status: opts?.status ?? "active",
				reason: opts?.reason ?? null,
				createdAt: now,
				updatedAt: now,
			},
		});
	}
}

async function buildApprovalInfo(
	opts: ResolvedAgentAuthOptions,
	adapter: {
		create: (args: {
			model: string;
			data: Record<string, unknown>;
		}) => Promise<unknown>;
	},
	internalAdapter: {
		findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
	},
	context: {
		origin: string;
		agentId: string;
		userId: string | null;
		agentName: string;
		hostId: string | null;
		scopes: string[];
	},
): Promise<Record<string, unknown>> {
	const method = await opts.resolveApprovalMethod({
		userId: context.userId,
		agentName: context.agentName,
		hostId: context.hostId,
		scopes: context.scopes,
	});

	if (method === "ciba" && context.userId) {
		const user = await internalAdapter.findUserById(context.userId);
		if (user) {
			const now = new Date();
			const expiresAt = new Date(
				now.getTime() + CIBA_DEFAULT_EXPIRES_IN * 1000,
			);
			const cibaRequest = (await adapter.create({
				model: CIBA_TABLE,
				data: {
					clientId: "agent-auth",
					loginHint: user.email,
					userId: context.userId,
					scope: context.scopes.join(" "),
					bindingMessage: `Agent "${context.agentName}" requesting approval`,
					clientNotificationToken: null,
					clientNotificationEndpoint: null,
					deliveryMode: "poll",
					status: "pending",
					accessToken: null,
					interval: CIBA_DEFAULT_INTERVAL,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			})) as CibaAuthRequest;
			return {
				method: "ciba",
				auth_req_id: cibaRequest.id,
				expires_in: CIBA_DEFAULT_EXPIRES_IN,
				interval: CIBA_DEFAULT_INTERVAL,
				ciba_token_endpoint: `${context.origin}/api/auth/agent/ciba/token`,
			};
		}
	}

	const userCode = generateUserCode();
	return {
		method: "device_authorization",
		verification_uri: `${context.origin}/device/scopes`,
		verification_uri_complete: `${context.origin}/device/scopes?agent_id=${context.agentId}&code=${userCode}`,
		user_code: userCode,
		device_code: context.agentId,
		expires_in: 300,
		interval: 5,
	};
}

export function createAgent(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/register",
		{
			method: "POST",
			body: createAgentBodySchema,
			metadata: {
				openapi: {
					description:
						"Register a new agent with its public key. Supports session-based or host-based (silent) creation via signed JWT.",
					responses: {
						"200": {
							description: "Agent created successfully",
						},
					},
				},
			},
		},
		async (ctx) => {
			const {
				name,
				publicKey: bodyPublicKey,
				scopes,
				hostJWT: bodyHostJWT,
				hostPublicKey,
				mode: rawMode,
				metadata,
			} = ctx.body;

			const authHeader = ctx.headers?.get("authorization");
			const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");
			const headerHostJWT =
				bearerToken &&
				bearerToken !== authHeader &&
				bearerToken.split(".").length === 3
					? bearerToken
					: null;
			const hostJWT = headerHostJWT ?? bodyHostJWT;
			const mode = rawMode ?? "behalf_of";

			if (!opts.modes.includes(mode)) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.UNSUPPORTED_MODE);
			}

			let userId: string | null;
			let hostId: string | null = null;
			let hostBaseScopes: string[] | null = null;
			let deviceApprovedScopes: string[] | null = null;
			let agentPublicKey = bodyPublicKey ?? null;
			let agentJwksUrl: string | null = null;

			if (hostJWT) {
				let decoded: Record<string, unknown>;
				let hostIdFromJwt: string | null = null;

				try {
					decoded = decodeJwt(hostJWT) as Record<string, unknown>;
					if (decoded.sub) {
						hostIdFromJwt = decoded.sub as string;
					}
				} catch {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
				}

				if (
					decoded.agent_public_key &&
					typeof decoded.agent_public_key === "object" &&
					!agentPublicKey
				) {
					agentPublicKey = decoded.agent_public_key as Record<
						string,
						string | boolean | string[] | undefined
					>;
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

				let host: AgentHost | null = null;

				if (hostIdFromJwt) {
					host = await ctx.context.adapter.findOne<AgentHost>({
						model: HOST_TABLE,
						where: [{ field: "id", value: hostIdFromJwt }],
					});
				}

				if (host) {
					if (host.status === "revoked") {
						throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
					}

					if (opts.absoluteLifetime > 0 && host.createdAt) {
						const absoluteExpiry =
							new Date(host.createdAt).getTime() + opts.absoluteLifetime * 1000;
						if (Date.now() >= absoluteExpiry) {
							await ctx.context.adapter.update({
								model: HOST_TABLE,
								where: [{ field: "id", value: host.id }],
								update: {
									status: "revoked",
									publicKey: "",
									kid: null,
									updatedAt: new Date(),
								},
							});
							throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
						}
					}

					if (opts.agentMaxLifetime > 0) {
						const anchor = host.activatedAt ?? host.createdAt;
						if (anchor) {
							const maxExpiry =
								new Date(anchor).getTime() + opts.agentMaxLifetime * 1000;
							if (Date.now() >= maxExpiry) {
								await ctx.context.adapter.update({
									model: HOST_TABLE,
									where: [{ field: "id", value: host.id }],
									update: { status: "expired", updatedAt: new Date() },
								});
								throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_EXPIRED);
							}
						}
					}

					if (
						host.status === "active" &&
						host.expiresAt &&
						new Date(host.expiresAt) <= new Date()
					) {
						await ctx.context.adapter.update({
							model: HOST_TABLE,
							where: [{ field: "id", value: host.id }],
							update: { status: "expired", updatedAt: new Date() },
						});
						throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_EXPIRED);
					}

					if (host.status === "expired") {
						throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_EXPIRED);
					}

					if (!host.publicKey && !host.jwksUrl) {
						throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
					}

					let hostPubKey: AgentJWK;
					if (host.jwksUrl) {
						const header = await decodeProtectedHeader(hostJWT);
						if (!header.kid) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
						}
						const key = await jwksCache.getKeyByKid(host.jwksUrl, header.kid);
						if (!key) {
							throw APIError.from(
								"UNAUTHORIZED",
								ERROR_CODES.INVALID_PUBLIC_KEY,
							);
						}
						hostPubKey = key as AgentJWK;
					} else {
						try {
							hostPubKey = JSON.parse(host.publicKey);
						} catch {
							throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
						}
					}

					const payload = await verifyAgentJWT({
						jwt: hostJWT,
						publicKey: hostPubKey,
						maxAge: opts.jwtMaxAge,
					});

					if (!payload || payload.sub !== host.id) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}

					// §3.4 step 2: Verify aud matches the server's issuer URL
					if (payload.aud) {
						const configuredOrigin = new URL(ctx.context.baseURL).origin;
						const acceptedOrigins = new Set([configuredOrigin]);
						const reqHost = ctx.headers?.get("host");
						const reqProto =
							ctx.headers?.get("x-forwarded-proto") ?? "http";
						if (reqHost) {
							acceptedOrigins.add(`${reqProto}://${reqHost}`);
						}
						const audValues = Array.isArray(payload.aud)
							? payload.aud
							: [payload.aud];
						if (!audValues.some((a) => acceptedOrigins.has(String(a)))) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
						}
					}

					if (jtiCache && payload.jti) {
						if (jtiCache.has(payload.jti)) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.JWT_REPLAY);
						}
						jtiCache.add(payload.jti, opts.jwtMaxAge);
					}

					userId = host.userId ?? null;
					hostId = host.id;
					hostBaseScopes =
						typeof host.scopes === "string"
							? JSON.parse(host.scopes)
							: host.scopes;

					if (hostJwksUrl && !host.jwksUrl) {
						ctx.context.runInBackground(
							ctx.context.adapter
								.update({
									model: HOST_TABLE,
									where: [{ field: "id", value: host.id }],
									update: { jwksUrl: hostJwksUrl },
								})
								.catch(() => {}),
						);
					}

					const heartbeatUpdate: Record<string, Date> = {
						lastUsedAt: new Date(),
					};
					if (opts.agentSessionTTL > 0) {
						heartbeatUpdate.expiresAt = new Date(
							Date.now() + opts.agentSessionTTL * 1000,
						);
					}
					ctx.context.runInBackground(
						ctx.context.adapter
							.update({
								model: HOST_TABLE,
								where: [{ field: "id", value: host.id }],
								update: heartbeatUpdate,
							})
							.catch(() => {}),
					);
				} else {
					// §2.2 step 6: Unknown host — bootstrap from JWT payload
					let resolvedHostPubKey: AgentJWK | null = null;

					if (hostJwksUrl) {
						const header = await decodeProtectedHeader(hostJWT);
						if (header.kid) {
							const key = await jwksCache.getKeyByKid(hostJwksUrl, header.kid);
							if (key) resolvedHostPubKey = key as AgentJWK;
						}
					}

					if (!resolvedHostPubKey && hostInlinePubKey) {
						resolvedHostPubKey = hostInlinePubKey;
					}

					if (!resolvedHostPubKey) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}

					const payload = await verifyAgentJWT({
						jwt: hostJWT,
						publicKey: resolvedHostPubKey,
						maxAge: opts.jwtMaxAge,
					});

					if (!payload) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}

					// §3.4 step 2: Verify aud matches the server's issuer URL
					if (payload.aud) {
						const configuredOrigin = new URL(ctx.context.baseURL).origin;
						const acceptedOrigins = new Set([configuredOrigin]);
						const reqHost = ctx.headers?.get("host");
						const reqProto =
							ctx.headers?.get("x-forwarded-proto") ?? "http";
						if (reqHost) {
							acceptedOrigins.add(`${reqProto}://${reqHost}`);
						}
						const audValues = Array.isArray(payload.aud)
							? payload.aud
							: [payload.aud];
						if (!audValues.some((a) => acceptedOrigins.has(String(a)))) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
						}
					}

					if (jtiCache && payload.jti) {
						if (jtiCache.has(payload.jti)) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.JWT_REPLAY);
						}
						jtiCache.add(payload.jti, opts.jwtMaxAge);
					}

					// Unknown host — bootstrap from JWT payload.
					// Autonomous agents: host + agent are created active immediately
					// with no user association (§2, Use Case C). Linking to a user
					// happens later via connect_account (§2, Use Case F).
					// behalf_of agents: both stay pending until user approval (§2, Use Case B).
					const isAutonomousMode = mode === "autonomous";
					const hostNow = new Date();
					const hostKid = resolvedHostPubKey.kid
						? String(resolvedHostPubKey.kid)
						: null;
					const newHost = await ctx.context.adapter.create<
						Record<string, string | Date | null>,
						AgentHost
					>({
						model: HOST_TABLE,
						data: {
							userId: null,
							referenceId: null,
							publicKey: JSON.stringify(resolvedHostPubKey),
							kid: hostKid,
							jwksUrl: hostJwksUrl,
							scopes: JSON.stringify([]),
							status: isAutonomousMode ? "active" : "pending",
							activatedAt: isAutonomousMode ? hostNow : null,
							expiresAt: null,
							lastUsedAt: null,
							createdAt: hostNow,
							updatedAt: hostNow,
						},
					});

					hostId = newHost.id;
					userId = null;
					hostBaseScopes = [];
				}
			} else {
				const cookieSession = await getSessionFromCtx(ctx);

				if (cookieSession) {
					userId = cookieSession.user.id;
				} else {
					const authHeader = ctx.headers?.get("authorization");
					const token = authHeader?.replace(/^Bearer\s+/i, "");
					if (!token || token === authHeader) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.UNAUTHORIZED_SESSION,
						);
					}
					const dbSession =
						await ctx.context.internalAdapter.findSession(token);
					if (
						!dbSession ||
						new Date(dbSession.session.expiresAt) <= new Date()
					) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.UNAUTHORIZED_SESSION,
						);
					}
					userId = dbSession.user.id;

					try {
						const deviceCodes = await ctx.context.adapter.findMany<{
							scope: string | null;
							status: string;
						}>({
							model: "deviceCode",
							where: [
								{ field: "userId", value: userId },
								{ field: "status", value: "approved" },
							],
							sortBy: { field: "createdAt", direction: "desc" },
							limit: 1,
						});
						const latestCode = deviceCodes[0];
						if (deviceCodes.length > 0 && latestCode?.scope) {
							deviceApprovedScopes = latestCode.scope
								.split(" ")
								.filter(Boolean);
						}
					} catch {
						// device code lookup is best-effort
					}
				}

				if (hostPublicKey) {
					const hostKid = (hostPublicKey.kid as string) ?? null;
					let existingHost: AgentHost | null = null;
					if (hostKid) {
						existingHost = await ctx.context.adapter.findOne<AgentHost>({
							model: HOST_TABLE,
							where: [
								{ field: "kid", value: hostKid },
								{ field: "userId", value: userId },
							],
						});
					}
					if (existingHost) {
						hostId = existingHost.id;
						hostBaseScopes =
							typeof existingHost.scopes === "string"
								? JSON.parse(existingHost.scopes)
								: existingHost.scopes;
					} else {
						const hostNow = new Date();
						const newHost = await ctx.context.adapter.create<
							Record<string, string | Date | null>,
							AgentHost
						>({
							model: HOST_TABLE,
							data: {
								userId,
								referenceId: null,
								publicKey: JSON.stringify(hostPublicKey),
								kid: hostKid,
								jwksUrl: null,
								scopes: JSON.stringify([]),
								status: "active",
								activatedAt: hostNow,
								expiresAt: null,
								lastUsedAt: null,
								createdAt: hostNow,
								updatedAt: hostNow,
							},
						});
						hostId = newHost.id;
						hostBaseScopes = [];
					}
				} else {
					try {
						const hosts = await ctx.context.adapter.findMany<AgentHost>({
							model: HOST_TABLE,
							where: [
								{ field: "userId", value: userId },
								{ field: "status", value: "active" },
							],
							sortBy: { field: "createdAt", direction: "desc" },
							limit: 1,
						});
						if (hosts.length > 0 && hosts[0]) {
							hostId = hosts[0].id;
							hostBaseScopes =
								typeof hosts[0].scopes === "string"
									? JSON.parse(hosts[0].scopes)
									: hosts[0].scopes;
						}
					} catch {
						// host lookup is best-effort
					}
					if (!hostId) {
						// Auto-create a default host for the user
						const autoHostNow = new Date();
						const autoHost = await ctx.context.adapter.create<
							Record<string, string | Date | null>,
							AgentHost
						>({
							model: HOST_TABLE,
							data: {
								userId,
								referenceId: null,
								publicKey: "",
								kid: null,
								jwksUrl: null,
								scopes: JSON.stringify([]),
								status: "active",
								activatedAt: autoHostNow,
								expiresAt: null,
								lastUsedAt: null,
								createdAt: autoHostNow,
								updatedAt: autoHostNow,
							},
						});
						hostId = autoHost.id;
						hostBaseScopes = [];
					}
				}
			}

			const publicKey = agentPublicKey;

			if (agentJwksUrl && !publicKey) {
				// Agent key will be resolved from JWKS URL at verification time
			} else if (!publicKey || !publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			if (publicKey) {
				const kty = publicKey.kty as string;
				const crv = (publicKey.crv as string) ?? null;
				const keyAlg = crv ? `${crv}` : kty;
				if (!opts.allowedKeyAlgorithms.includes(keyAlg)) {
					throw new APIError("BAD_REQUEST", {
						message: `Key algorithm "${keyAlg}" is not allowed. Accepted: ${opts.allowedKeyAlgorithms.join(", ")}`,
					});
				}
			}

			if (opts.maxAgentsPerUser > 0 && userId) {
				const activeCount = await ctx.context.adapter.count({
					model: AGENT_TABLE,
					where: [
						{ field: "userId", value: userId },
						{ field: "status", value: "active" },
					],
				});
				if (activeCount >= opts.maxAgentsPerUser) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.AGENT_LIMIT_REACHED);
				}
			}

			let resolvedScopes: string[];
			let pendingScopes: string[] = [];

			if (hostBaseScopes !== null && hostBaseScopes.length > 0) {
				const budget = hostBaseScopes;
				if (scopes && scopes.length > 0) {
					resolvedScopes = scopes.filter((s: string) => hasScope(budget, s));
					pendingScopes = scopes.filter((s: string) => !hasScope(budget, s));
				} else {
					resolvedScopes = budget;
				}
			} else if (scopes && scopes.length > 0) {
				resolvedScopes = scopes;
			} else {
				resolvedScopes = [];
			}

			if (resolvedScopes.length > 0 && opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(resolvedScopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
					});
				}
			}

			if (resolvedScopes.length > 0 && opts.validateScopes) {
				const valid = await opts.validateScopes(resolvedScopes);
				if (!valid) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
				}
			}

			if (deviceApprovedScopes !== null && deviceApprovedScopes.length > 0) {
				resolvedScopes = deviceApprovedScopes;
				pendingScopes = [];
			}

			const now = new Date();
			const kid = publicKey ? ((publicKey.kid as string) ?? null) : null;

			// If the host is pending (unknown host bootstrap), agent must also be pending
			let hostRecord: AgentHost | null = null;
			if (hostId) {
				hostRecord = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [{ field: "id", value: hostId }],
				});
			}
			const isHostPending = hostRecord?.status === "pending";
			const agentStatus = isHostPending ? "pending" : "active";

			const expiresAt =
				!isHostPending && opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			if (kid && userId) {
				const existing = await ctx.context.adapter.findOne<Agent>({
					model: AGENT_TABLE,
					where: [
						{ field: "kid", value: kid },
						{ field: "userId", value: userId },
					],
				});

				if (existing) {
					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: existing.id }],
						update: {
							name,
							status: agentStatus,
							mode,
							publicKey: publicKey ? JSON.stringify(publicKey) : "",
							jwksUrl: agentJwksUrl,
							hostId,
							activatedAt: isHostPending ? null : now,
							metadata: metadata ? JSON.stringify(metadata) : null,
							expiresAt,
							updatedAt: now,
						},
					});

					const grantedBy = userId || null;
					await createPermissionRows(
						ctx.context.adapter,
						existing.id,
						resolvedScopes,
						grantedBy,
						{ clearExisting: true },
					);

					if (pendingScopes.length > 0) {
						await createPermissionRows(
							ctx.context.adapter,
							existing.id,
							pendingScopes,
							grantedBy,
							{
								status: "pending",
								reason: "Scope not pre-authorized by host",
							},
						);
					}

					if (
						hostId &&
						agentStatus === "active" &&
						resolvedScopes.length > 0 &&
						hostBaseScopes !== null &&
						hostBaseScopes.length === 0
					) {
						ctx.context.runInBackground(
							ctx.context.adapter
								.update({
									model: HOST_TABLE,
									where: [{ field: "id", value: hostId }],
									update: {
										scopes: JSON.stringify(resolvedScopes),
										updatedAt: new Date(),
									},
								})
								.catch(() => {}),
						);
					}

					const response: Record<string, unknown> = {
						agent_id: existing.id,
						host_id: hostId,
						name,
						mode,
						status: agentStatus,
						scopes: resolvedScopes,
					};
					if (pendingScopes.length > 0) {
						const origin = new URL(ctx.context.baseURL).origin;
						response.pending_scopes = pendingScopes;
						response.approval = await buildApprovalInfo(
							opts,
							ctx.context.adapter,
							ctx.context.internalAdapter,
							{
								origin,
								agentId: existing.id,
								userId,
								agentName: name,
								hostId,
								scopes: [...resolvedScopes, ...pendingScopes],
							},
						);
					}
					return ctx.json(response);
				}
			}

			const grantedBy = userId || null;

			const agent = await ctx.context.adapter.create<
				Record<string, string | Date | null>,
				Agent
			>({
				model: AGENT_TABLE,
				data: {
					name,
					userId: userId || null,
					hostId,
					status: agentStatus,
					mode,
					publicKey: publicKey ? JSON.stringify(publicKey) : "",
					kid,
					jwksUrl: agentJwksUrl,
					lastUsedAt: null,
					activatedAt: isHostPending ? null : now,
					expiresAt,
					metadata: metadata ? JSON.stringify(metadata) : null,
					createdAt: now,
					updatedAt: now,
				},
			});

			await createPermissionRows(
				ctx.context.adapter,
				agent.id,
				resolvedScopes,
				grantedBy,
			);

			if (pendingScopes.length > 0) {
				await createPermissionRows(
					ctx.context.adapter,
					agent.id,
					pendingScopes,
					grantedBy,
					{
						status: "pending",
						reason: "Scope not pre-authorized by host",
					},
				);
			}

			// §4.3: Update the host's pre-authorized scopes so future agents
			// through this host auto-approve for the same scopes.
			if (
				hostId &&
				agentStatus === "active" &&
				resolvedScopes.length > 0 &&
				hostBaseScopes !== null &&
				hostBaseScopes.length === 0
			) {
				ctx.context.runInBackground(
					ctx.context.adapter
						.update({
							model: HOST_TABLE,
							where: [{ field: "id", value: hostId }],
							update: {
								scopes: JSON.stringify(resolvedScopes),
								updatedAt: new Date(),
							},
						})
						.catch(() => {}),
				);
			}

			const response: Record<string, unknown> = {
				agent_id: agent.id,
				host_id: hostId,
				name: agent.name,
				mode: agent.mode,
				status: agentStatus,
				scopes: resolvedScopes,
			};
			if (pendingScopes.length > 0 || isHostPending) {
				const origin = new URL(ctx.context.baseURL).origin;
				response.pending_scopes = pendingScopes;
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
						scopes: [...resolvedScopes, ...pendingScopes],
					},
				);
			}
			return ctx.json(response);
		},
	);
}

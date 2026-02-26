import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { decodeJwt } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { JtiReplayCache } from "../jti-cache";
import { findBlockedScopes, isSubsetOf } from "../scopes";
import type { Agent, AgentHost, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";

const createAgentBodySchema = z.object({
	name: z.string().min(1).meta({ description: "Friendly name for the agent" }),
	publicKey: z
		.record(
			z.string(),
			z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
		)
		.meta({ description: "Agent's Ed25519 public key as JWK" }),
	scopes: z
		.array(z.string())
		.meta({
			description:
				"Scope strings the agent is granted. When used with hostJWT, must be a subset of the host's scopes.",
		})
		.optional(),
	role: z
		.string()
		.meta({ description: "Role name to resolve scopes from" })
		.optional(),
	hostJWT: z
		.string()
		.meta({
			description:
				"A JWT signed by the host's private key (sub = hostId). Enables silent agent creation without user session (§6).",
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
	grantedBy: string,
	opts?: { clearExisting?: boolean },
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
				status: "active",
				reason: null,
				createdAt: now,
				updatedAt: now,
			},
		});
	}
}

export function createAgent(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/create",
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
			const { name, publicKey, scopes, role, hostJWT, metadata } = ctx.body;

			let userId: string;
			let hostId: string | null = null;
			let hostBaseScopes: string[] | null = null;
			let deviceApprovedScopes: string[] | null = null;

			if (hostJWT) {
				let hostIdFromJwt: string;
				try {
					const decoded = decodeJwt(hostJWT);
					if (!decoded.sub) {
						throw new Error("Missing sub");
					}
					hostIdFromJwt = decoded.sub;
				} catch {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
				}

				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [{ field: "id", value: hostIdFromJwt }],
				});

				if (!host) {
					throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
				}
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

				if (!host.publicKey) {
					throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
				}

				let hostPubKey: AgentJWK;
				try {
					hostPubKey = JSON.parse(host.publicKey);
				} catch {
					throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
				}

				const payload = await verifyAgentJWT({
					jwt: hostJWT,
					publicKey: hostPubKey,
					maxAge: opts.jwtMaxAge,
				});

				if (!payload || payload.sub !== host.id) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
				}

				if (jtiCache && payload.jti) {
					if (jtiCache.has(payload.jti)) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.JWT_REPLAY);
					}
					jtiCache.add(payload.jti, opts.jwtMaxAge);
				}

				userId = host.userId;
				hostId = host.id;
				hostBaseScopes =
					typeof host.scopes === "string"
						? JSON.parse(host.scopes)
						: host.scopes;

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
			}

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const kty = publicKey.kty as string;
			const crv = (publicKey.crv as string) ?? null;
			const keyAlg = crv ? `${crv}` : kty;
			if (!opts.allowedKeyAlgorithms.includes(keyAlg)) {
				throw new APIError("BAD_REQUEST", {
					message: `Key algorithm "${keyAlg}" is not allowed. Accepted: ${opts.allowedKeyAlgorithms.join(", ")}`,
				});
			}

			if (opts.maxAgentsPerUser > 0) {
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

			const roleScopes = role && opts.roles?.[role] ? opts.roles[role] : [];

			let resolvedScopes: string[];

			if (hostBaseScopes !== null) {
				if (scopes && scopes.length > 0) {
					if (!isSubsetOf(scopes, hostBaseScopes)) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Requested scopes must be a subset of the host's scopes.",
						});
					}
					resolvedScopes = scopes;
				} else {
					resolvedScopes = hostBaseScopes;
				}
			} else {
				resolvedScopes = scopes ?? roleScopes;
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
				if (typeof opts.validateScopes === "function") {
					const valid = await opts.validateScopes(resolvedScopes);
					if (!valid) {
						throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
					}
				} else {
					const knownScopes = new Set(Object.values(opts.roles ?? {}).flat());
					const invalid = resolvedScopes.filter(
						(s: string) => !knownScopes.has(s),
					);
					if (invalid.length > 0) {
						throw new APIError("BAD_REQUEST", {
							message: `${ERROR_CODES.UNKNOWN_SCOPES} Unrecognized: ${invalid.join(", ")}.`,
						});
					}
				}
			}

			if (deviceApprovedScopes !== null && deviceApprovedScopes.length > 0) {
				resolvedScopes = deviceApprovedScopes;
			}

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			if (kid) {
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
							status: "active",
							publicKey: JSON.stringify(publicKey),
							hostId,
							activatedAt: now,
							metadata: metadata ? JSON.stringify(metadata) : null,
							expiresAt,
							updatedAt: now,
						},
					});

					await createPermissionRows(
						ctx.context.adapter,
						existing.id,
						resolvedScopes,
						userId,
						{ clearExisting: true },
					);

					return ctx.json({
						agentId: existing.id,
						name,
						scopes: resolvedScopes,
						hostId,
					});
				}
			}

			const agent = await ctx.context.adapter.create<
				Record<string, string | Date | null>,
				Agent
			>({
				model: AGENT_TABLE,
				data: {
					name,
					userId,
					hostId,
					status: "active",
					publicKey: JSON.stringify(publicKey),
					kid,
					lastUsedAt: null,
					activatedAt: now,
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
				userId,
			);

			return ctx.json({
				agentId: agent.id,
				name: agent.name,
				scopes: resolvedScopes,
				hostId,
			});
		},
	);
}

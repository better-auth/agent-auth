import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { JWKSCache } from "../jwks-cache";
import type { Agent, AgentHost, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";

const jwksCache = new JWKSCache();

/**
 * POST /agent/revoke
 *
 * Revoke an agent permanently (§2.7). Supports three auth paths:
 * 1. Agent JWT (Bearer) — agent self-revokes
 * 2. Host JWT — host revokes one of its agents
 * 3. User session — owner revokes by agentId
 */
export function revokeAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/revoke",
		{
			method: "POST",
			body: z.object({
				agentId: z.string().optional().meta({
					description:
						"Agent ID to revoke. Required for host JWT and user session. Optional for agent JWT (uses sub claim).",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Revoke an agent (§2.7). Supports agent JWT, host JWT, or user session.",
				},
			},
		},
		async (ctx) => {
			let agentId = ctx.body.agentId ?? "";
			let ownerUserId: string | null = null;

			const session = await getSessionFromCtx(ctx);
			if (session) {
				ownerUserId = session.user.id;
			} else {
				const authHeader = ctx.headers?.get("authorization");
				const bearer = authHeader?.replace(/^Bearer\s+/i, "");
				if (bearer && bearer !== authHeader && bearer.split(".").length === 3) {
					let decoded: Record<string, unknown>;
					try {
						decoded = decodeJwt(bearer) as Record<string, unknown>;
					} catch {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}
					if (!decoded.sub) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}

					// Determine if this is an agent JWT or host JWT
					const subId = decoded.sub as string;

					// Try agent first
					const maybeAgent = await ctx.context.adapter.findOne<Agent>({
						model: AGENT_TABLE,
						where: [{ field: "id", value: subId }],
					});

					if (maybeAgent && maybeAgent.publicKey) {
						// Agent JWT — self-revoke
						let publicKey: AgentJWK;
						try {
							publicKey = JSON.parse(maybeAgent.publicKey);
						} catch {
							throw APIError.from(
								"UNAUTHORIZED",
								ERROR_CODES.INVALID_PUBLIC_KEY,
							);
						}

						const payload = await verifyAgentJWT({
							jwt: bearer,
							publicKey,
							maxAge: opts.jwtMaxAge,
						});
						if (!payload || payload.sub !== maybeAgent.id) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
						}

						agentId = maybeAgent.id;
						ownerUserId = maybeAgent.userId;
					} else {
						// Try host JWT
						const maybeHost = await ctx.context.adapter.findOne<AgentHost>({
							model: HOST_TABLE,
							where: [{ field: "id", value: subId }],
						});

						if (!maybeHost) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
						}

						let hostPubKey: AgentJWK;
						if (maybeHost.jwksUrl) {
							const header = await decodeProtectedHeader(bearer);
							if (!header.kid) {
								throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
							}
							const key = await jwksCache.getKeyByKid(
								maybeHost.jwksUrl,
								header.kid,
							);
							if (!key) {
								throw APIError.from(
									"UNAUTHORIZED",
									ERROR_CODES.INVALID_PUBLIC_KEY,
								);
							}
							hostPubKey = key as AgentJWK;
						} else if (maybeHost.publicKey) {
							try {
								hostPubKey = JSON.parse(maybeHost.publicKey);
							} catch {
								throw APIError.from(
									"UNAUTHORIZED",
									ERROR_CODES.INVALID_PUBLIC_KEY,
								);
							}
						} else {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.HOST_REVOKED);
						}

						const payload = await verifyAgentJWT({
							jwt: bearer,
							publicKey: hostPubKey,
							maxAge: opts.jwtMaxAge,
						});
						if (!payload || payload.sub !== maybeHost.id) {
							throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
						}

						if (!agentId) {
							throw APIError.from("BAD_REQUEST", ERROR_CODES.AGENT_NOT_FOUND);
						}

						// Verify the agent belongs to this host
						const targetAgent = await ctx.context.adapter.findOne<Agent>({
							model: AGENT_TABLE,
							where: [{ field: "id", value: agentId }],
						});
						if (!targetAgent || targetAgent.hostId !== maybeHost.id) {
							throw APIError.from("FORBIDDEN", ERROR_CODES.UNAUTHORIZED);
						}

						ownerUserId = targetAgent.userId;
					}
				}
			}

			if (!ownerUserId) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (agent.userId !== ownerUserId && agent.hostId) {
				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [{ field: "id", value: agent.hostId }],
				});
				if (!host || host.userId !== ownerUserId) {
					throw APIError.from("FORBIDDEN", ERROR_CODES.UNAUTHORIZED);
				}
			}

			await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
				update: {
					status: "revoked",
					publicKey: "",
					kid: null,
					updatedAt: new Date(),
				},
			});

			emit(opts, {
				type: "agent.revoked",
				actorId: ownerUserId ?? undefined,
				agentId: agent.id,
				hostId: agent.hostId ?? undefined,
			});

			return ctx.json({
				success: true,
				agent_id: agent.id,
				status: "revoked",
			});
		},
	);
}

import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { decodeJwt } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";

/**
 * POST /agent/revoke
 *
 * Revoke an agent. Supports two auth paths:
 * 1. User session — owner revokes by agentId
 * 2. Agent JWT (Bearer) — agent self-revokes (§17.2)
 */
export function revokeAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/revoke",
		{
			method: "POST",
			body: z.object({
				agentId: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Revoke an agent. Supports user session (owner) or agent JWT (self-revocation §17.2).",
				},
			},
		},
		async (ctx) => {
			let agentId = ctx.body.agentId;
			let ownerUserId: string | null = null;

			const session = await getSessionFromCtx(ctx);
			if (session) {
				ownerUserId = session.user.id;
			} else {
				const authHeader = ctx.headers?.get("authorization");
				const bearer = authHeader?.replace(/^Bearer\s+/i, "");
				if (bearer && bearer !== authHeader && bearer.split(".").length === 3) {
					let decoded: { sub?: string };
					try {
						decoded = decodeJwt(bearer);
					} catch {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}
					if (!decoded.sub) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}

					const agent = await ctx.context.adapter.findOne<Agent>({
						model: AGENT_TABLE,
						where: [{ field: "id", value: decoded.sub }],
					});
					if (!agent || !agent.publicKey) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.AGENT_NOT_FOUND);
					}

					let publicKey: AgentJWK;
					try {
						publicKey = JSON.parse(agent.publicKey);
					} catch {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_PUBLIC_KEY);
					}

					const payload = await verifyAgentJWT({
						jwt: bearer,
						publicKey,
						maxAge: opts.jwtMaxAge,
					});
					if (!payload || payload.sub !== agent.id) {
						throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
					}

					agentId = agent.id;
					ownerUserId = agent.userId;
				}
			}

			if (!ownerUserId) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "id", value: agentId },
					{ field: "userId", value: ownerUserId },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
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

			return ctx.json({ success: true });
		},
	);
}

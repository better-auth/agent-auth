import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { JtiReplayCache } from "../jti-cache";
import type { Agent, Enrollment, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";
const ENROLLMENT_TABLE = "agentEnrollment";

/**
 * POST /agent/reactivate
 *
 * Reactivate an expired agent via proof-of-possession (§7).
 * The agent must be in "expired" state (public key retained).
 * Scopes reset to the enrollment's baseScopes (scope decay §7.3).
 * `activatedAt` and `maxLifetime` clock reset.
 */
export function reactivateAgent(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/reactivate",
		{
			method: "POST",
			body: z.object({
				agentId: z.string(),
				proof: z.string().meta({
					description:
						"A signed JWT from the agent's existing keypair proving possession.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Reactivate an expired agent via proof-of-possession. Scopes decay to enrollment baseScopes.",
				},
			},
		},
		async (ctx) => {
			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: ctx.body.agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (agent.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
			}

			if (agent.status === "active") {
				return ctx.json({
					status: "active",
					message: "Agent is already active.",
				});
			}

			// §7.2 absoluteLifetime — cannot reactivate past absolute lifetime
			if (opts.absoluteLifetime > 0 && agent.createdAt) {
				const absoluteExpiry =
					new Date(agent.createdAt).getTime() + opts.absoluteLifetime * 1000;
				if (Date.now() >= absoluteExpiry) {
					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: agent.id }],
						update: {
							status: "revoked",
							publicKey: "",
							kid: null,
							updatedAt: new Date(),
						},
					});
					throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
				}
			}

			if (!agent.publicKey) {
				throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
			}

			let publicKey: AgentJWK;
			try {
				publicKey = JSON.parse(agent.publicKey);
			} catch {
				throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const payload = await verifyAgentJWT({
				jwt: ctx.body.proof,
				publicKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload || payload.sub !== agent.id) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
			}

			// §15.5 JTI replay detection
			if (jtiCache && payload.jti) {
				if (jtiCache.has(payload.jti)) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.JWT_REPLAY);
				}
				jtiCache.add(payload.jti, opts.jwtMaxAge);
			}

			let baseScopes: string[] = [];
			if (agent.enrollmentId) {
				const enrollment = await ctx.context.adapter.findOne<Enrollment>({
					model: ENROLLMENT_TABLE,
					where: [{ field: "id", value: agent.enrollmentId }],
				});

				if (!enrollment || enrollment.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERROR_CODES.ENROLLMENT_REVOKED);
				}

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

			await ctx.context.adapter.update({
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

			return ctx.json({
				status: "active",
				agentId: agent.id,
				scopes: baseScopes,
				activatedAt: now,
			});
		},
	);
}

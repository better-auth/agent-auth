import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { verifyAgentJWT } from "../utils/crypto";
import type { JtiCacheStore } from "../utils/jti-cache";
import { parseCapabilityIds } from "../utils/capabilities";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	AgentJWK,
	ResolvedAgentAuthOptions,
} from "../types";
import { createGrantRows, formatGrantsResponse } from "./_helpers";

export function reactivateAgent(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
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
						"Reactivate an expired agent via proof-of-possession (§2.5). Capabilities decay to host defaults.",
				},
			},
		},
		async (ctx) => {
			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: ctx.body.agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERR.AGENT_REVOKED);
			}

			if (agent.status === "active") {
				return ctx.json({
					status: "active",
					message: "Agent is already active.",
				});
			}

			if (opts.absoluteLifetime > 0 && agent.createdAt) {
				const absoluteExpiry =
					new Date(agent.createdAt).getTime() +
					opts.absoluteLifetime * 1000;
				if (Date.now() >= absoluteExpiry) {
					await ctx.context.adapter.update({
						model: TABLE.agent,
						where: [{ field: "id", value: agent.id }],
						update: {
							status: "revoked",
							publicKey: "",
							kid: null,
							updatedAt: new Date(),
						},
					});
					throw APIError.from(
						"FORBIDDEN",
						ERR.ABSOLUTE_LIFETIME_EXCEEDED,
					);
				}
			}

			if (!agent.publicKey) {
				throw APIError.from("FORBIDDEN", ERR.AGENT_REVOKED);
			}

			let publicKey: AgentJWK;
			try {
				publicKey = JSON.parse(agent.publicKey) as AgentJWK;
			} catch {
				throw APIError.from("FORBIDDEN", ERR.INVALID_PUBLIC_KEY);
			}

			const payload = await verifyAgentJWT({
				jwt: ctx.body.proof,
				publicKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload || payload.sub !== agent.id) {
				throw APIError.from("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			if (jtiCache && payload.jti) {
				if (await jtiCache.has(String(payload.jti))) {
					throw APIError.from("UNAUTHORIZED", ERR.JWT_REPLAY);
				}
				await jtiCache.add(String(payload.jti), opts.jwtMaxAge);
			}

			const now = new Date();

			if (agent.hostId) {
				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: TABLE.host,
					where: [{ field: "id", value: agent.hostId }],
				});

				if (!host || host.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
				}

				const baseCapabilityIds = parseCapabilityIds(
					host.defaultCapabilityIds,
				);

				await createGrantRows(
					ctx.context.adapter,
					agent.id,
					baseCapabilityIds,
					agent.userId,
					{ clearExisting: true },
					{
						pluginOpts: opts,
						hostId: agent.hostId,
						userId: agent.userId,
					},
				);
			}

			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			await ctx.context.adapter.update({
				model: TABLE.agent,
				where: [{ field: "id", value: agent.id }],
				update: {
					status: "active",
					activatedAt: now,
					expiresAt,
					lastUsedAt: now,
					updatedAt: now,
				},
			});

			const grants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [{ field: "agentId", value: agent.id }],
				});

			const activeGrants = grants.filter((g) => g.status === "active");

			emit(opts, {
				type: "agent.reactivated",
				actorType: "agent",
				agentId: agent.id,
				hostId: agent.hostId ?? undefined,
				metadata: {
					capabilityIds: activeGrants.map((g) => g.capabilityId),
				},
			}, ctx);

			return ctx.json({
				status: "active" as const,
				agentId: agent.id,
				agent_capability_grants: formatGrantsResponse(activeGrants),
				activatedAt: now,
			});
		},
	);
}

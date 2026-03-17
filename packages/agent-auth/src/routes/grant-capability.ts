import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { emit } from "../emit";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	ResolvedAgentAuthOptions,
} from "../types";
import { resolveGrantExpiresAt } from "../utils/grant-ttl";
import { validateCapabilitiesExist, validateCapabilityIds } from "./_helpers";

export function grantCapability(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/grant-capability",
		{
			method: "POST",
			body: z.object({
				agent_id: z
					.string()
					.meta({ description: "Agent to grant capabilities to" }),
				capabilities: z
					.array(z.string())
					.min(1)
					.meta({ description: "Capability names to grant" }),
				ttl: z.number().positive().optional().meta({
					description:
						"Grant TTL in seconds. Overrides the plugin-level resolveGrantTTL.",
				}),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Grant additional capabilities to an agent (§4). Requires user session.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const {
				agent_id: agentId,
				capabilities: capabilityIds,
				ttl: explicitTTL,
			} = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.status === "revoked") {
				throw agentError("FORBIDDEN", ERR.AGENT_REVOKED);
			}

			if (agent.userId && agent.userId !== session.user.id) {
				if (agent.hostId) {
					const host = await ctx.context.adapter.findOne<AgentHost>({
						model: TABLE.host,
						where: [{ field: "id", value: agent.hostId }],
					});
					if (!host || host.userId !== session.user.id) {
						throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
					}
				} else {
					throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
				}
			}

			validateCapabilityIds(capabilityIds, opts);
			await validateCapabilitiesExist(capabilityIds, opts);

			const existing = await ctx.context.adapter.findMany<AgentCapabilityGrant>(
				{
					model: TABLE.grant,
					where: [{ field: "agentId", value: agentId }],
				}
			);

			const now = new Date();
			const grantIds: string[] = [];
			const added: string[] = [];

			for (const capabilityId of capabilityIds) {
				const pendingGrant = existing.find(
					(g) => g.capability === capabilityId && g.status === "pending"
				);

				const expiresAt = await resolveGrantExpiresAt(
					opts,
					capabilityId,
					{
						agentId,
						hostId: agent.hostId,
						userId: agent.userId,
					},
					explicitTTL
				);

				if (pendingGrant) {
					await ctx.context.adapter.update({
						model: TABLE.grant,
						where: [{ field: "id", value: pendingGrant.id }],
						update: {
							status: "active",
							grantedBy: session.user.id,
							expiresAt,
							updatedAt: now,
						},
					});
					grantIds.push(pendingGrant.id);
				} else {
					const alreadyActive = existing.find(
						(g) => g.capability === capabilityId && g.status === "active"
					);
					if (alreadyActive) {
						continue;
					}

					const grant = await ctx.context.adapter.create<
						Record<string, unknown>,
						AgentCapabilityGrant
					>({
						model: TABLE.grant,
						data: {
							agentId,
							capability: capabilityId,
							constraints: null,
							grantedBy: session.user.id,
							deniedBy: null,
							expiresAt,
							status: "active",
							reason: null,
							createdAt: now,
							updatedAt: now,
						},
					});
					grantIds.push(grant.id);
				}
				added.push(capabilityId);
			}

			emit(
				opts,
				{
					type: "capability.granted",
					actorId: session.user.id,
					agentId,
					metadata: { capabilities: added },
				},
				ctx
			);

			return ctx.json({ agent_id: agentId, grant_ids: grantIds, added });
		}
	);
}

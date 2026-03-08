import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import type { Agent, AgentCapabilityGrant } from "../types";
import { formatGrantsResponse } from "./_helpers";

/**
 * GET /agent/list
 *
 * List agents for the current user.
 */
export function listAgents() {
	return createAuthEndpoint(
		"/agent/list",
		{
			method: "GET",
			query: z
				.object({
					status: z
						.enum([
							"active",
							"pending",
							"expired",
							"revoked",
							"rejected",
							"claimed",
						])
						.optional(),
					mode: z.enum(["delegated", "autonomous"]).optional(),
					host_id: z.string().optional(),
					limit: z.coerce.number().positive().optional(),
					offset: z.coerce.number().nonnegative().optional(),
				})
				.optional(),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"List agents for the current user with filtering and pagination (§8).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const limit = Math.min(ctx.query?.limit ?? 50, 200);
			const offset = ctx.query?.offset ?? 0;

			const where: Array<{ field: string; value: string }> = [
				{ field: "userId", value: session.user.id },
			];

			if (ctx.query?.status) {
				where.push({ field: "status", value: ctx.query.status });
			}
			if (ctx.query?.mode) {
				where.push({ field: "mode", value: ctx.query.mode });
			}
			if (ctx.query?.host_id) {
				where.push({ field: "hostId", value: ctx.query.host_id });
			}

			const allAgents = await ctx.context.adapter.findMany<Agent>({
				model: TABLE.agent,
				where,
				sortBy: { field: "createdAt", direction: "desc" },
				limit: offset + limit,
			});

			const agents = allAgents.slice(offset, offset + limit);

			const agentsWithGrants = await Promise.all(
				agents.map(async (agent) => {
					const grants =
						await ctx.context.adapter.findMany<AgentCapabilityGrant>({
							model: TABLE.grant,
							where: [{ field: "agentId", value: agent.id }],
						});
					return {
						agent_id: agent.id,
						name: agent.name,
						status: agent.status,
						mode: agent.mode,
						host_id: agent.hostId,
						agent_capability_grants: formatGrantsResponse(grants),
						created_at: agent.createdAt,
						last_used_at: agent.lastUsedAt,
						expires_at: agent.expiresAt,
					};
				}),
			);

			return ctx.json({ agents: agentsWithGrants });
		},
	);
}

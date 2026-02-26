import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

export function listAgents() {
	return createAuthEndpoint(
		"/agent/list",
		{
			method: "GET",
			query: z
				.object({
					orgId: z.string().optional(),
					workgroupId: z
						.string()
						.meta({ description: "Filter by workgroup" })
						.optional(),
					status: z
						.enum(["active", "expired", "revoked"])
						.meta({ description: "Filter by status (default: all)" })
						.optional(),
					limit: z
						.string()
						.meta({
							description:
								"Maximum number of agents to return (default 50, max 200)",
						})
						.optional(),
					offset: z
						.string()
						.meta({ description: "Number of agents to skip (default 0)" })
						.optional(),
					sortBy: z
						.enum(["createdAt", "lastUsedAt", "name"])
						.meta({ description: "Sort field (default: createdAt)" })
						.optional(),
					sortDirection: z
						.enum(["asc", "desc"])
						.meta({ description: "Sort direction (default: desc)" })
						.optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description:
						"List agents for the current user with pagination and filtering.",
					responses: {
						"200": {
							description: "Paginated list of agents with total count",
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const limit = Math.min(Number(ctx.query?.limit) || 50, 200);
			const offset = Number(ctx.query?.offset) || 0;
			const sortField = ctx.query?.sortBy ?? "createdAt";
			const sortDirection = ctx.query?.sortDirection ?? "desc";

			const where: Array<{ field: string; value: string }> = [
				{ field: "userId", value: session.user.id },
			];

			if (ctx.query?.orgId) {
				where.push({ field: "orgId", value: ctx.query.orgId });
			}

			if (ctx.query?.workgroupId) {
				where.push({ field: "workgroupId", value: ctx.query.workgroupId });
			}

			if (ctx.query?.status) {
				where.push({ field: "status", value: ctx.query.status });
			}

			const [agents, total] = await Promise.all([
				ctx.context.adapter.findMany<Agent>({
					model: AGENT_TABLE,
					where,
					limit,
					offset,
					sortBy: { field: sortField, direction: sortDirection },
				}),
				ctx.context.adapter.count({
					model: AGENT_TABLE,
					where,
				}),
			]);

			return ctx.json({
				agents: agents.map((agent) => ({
					id: agent.id,
					name: agent.name,
					status: agent.status,
					scopes:
						typeof agent.scopes === "string"
							? JSON.parse(agent.scopes)
							: agent.scopes,
					role: agent.role,
					orgId: agent.orgId,
					workgroupId: agent.workgroupId,
					lastUsedAt: agent.lastUsedAt,
					createdAt: agent.createdAt,
					updatedAt: agent.updatedAt,
					metadata:
						typeof agent.metadata === "string"
							? JSON.parse(agent.metadata)
							: agent.metadata,
				})),
				total,
				limit,
				offset,
			});
		},
	);
}

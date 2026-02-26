import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, AgentPermission } from "../types";

const AGENT_TABLE = "agent";
const PERMISSION_TABLE = "agentPermission";

export function getAgent() {
	return createAuthEndpoint(
		"/agent/get",
		{
			method: "GET",
			query: z.object({
				agentId: z.string(),
			}),
			metadata: {
				openapi: {
					description: "Get details for a single agent (no secrets returned)",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "id", value: ctx.query.agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			const permissions = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agent.id }],
			});

			return ctx.json({
				id: agent.id,
				name: agent.name,
				status: agent.status,
				permissions: permissions.map((p) => ({
					id: p.id,
					scope: p.scope,
					referenceId: p.referenceId,
					grantedBy: p.grantedBy,
					status: p.status,
					expiresAt: p.expiresAt,
				})),
				hostId: agent.hostId,
				lastUsedAt: agent.lastUsedAt,
				activatedAt: agent.activatedAt ?? null,
				createdAt: agent.createdAt,
				updatedAt: agent.updatedAt,
				metadata:
					typeof agent.metadata === "string"
						? JSON.parse(agent.metadata)
						: agent.metadata,
			});
		},
	);
}

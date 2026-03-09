import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentMetadata,
} from "../types";
import { sessionMiddleware } from "better-auth/api";
import { formatGrantsResponse } from "./_helpers";

function parseMetadata(
	metadata: AgentMetadata | string | null,
): AgentMetadata | null {
	if (metadata === null || metadata === undefined) return null;
	if (typeof metadata === "string") {
		try {
			return JSON.parse(metadata) as AgentMetadata;
		} catch {
			return null;
		}
	}
	return metadata;
}

/**
 * GET /agent/get
 *
 * Get details for a single agent. Auth: user session.
 */
export function getAgent() {
	return createAuthEndpoint(
		"/agent/get",
		{
			method: "GET",
			query: z.object({
				agent_id: z.string(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Get details for a single agent (§8). No secrets returned.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [
					{ field: "id", value: ctx.query.agent_id },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			const grants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [{ field: "agentId", value: agent.id }],
				});

			return ctx.json({
				agent_id: agent.id,
				name: agent.name,
				status: agent.status,
				mode: agent.mode,
				host_id: agent.hostId,
				user_id: agent.userId,
				agent_capability_grants: formatGrantsResponse(grants),
				metadata: parseMetadata(agent.metadata),
				created_at: agent.createdAt,
				activated_at: agent.activatedAt,
				last_used_at: agent.lastUsedAt,
				expires_at: agent.expiresAt,
			});
		},
	);
}

import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentSession,
	HostSession,
} from "../types";
import { formatGrantsResponse } from "./_helpers";

/**
 * GET /agent/status
 *
 * Returns the current status of an agent and its capability grants (§6.5).
 * Supports agent JWT (self-query) or host JWT (requires ?agentId=...).
 */
export function agentStatus() {
	return createAuthEndpoint(
		"/agent/status",
		{
			method: "GET",
			query: z
				.object({
					agent_id: z.string().optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description:
						"Returns the current status of an agent and its capability grants (§6.5).",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;
			const hostSession = (ctx.context as Record<string, unknown>)
				.hostSession as HostSession | undefined;

			let targetAgentId: string;

			if (agentSession) {
				targetAgentId = ctx.query?.agent_id ?? agentSession.agent.id;
			} else if (hostSession) {
				if (!ctx.query?.agent_id) {
				throw agentError(
					"BAD_REQUEST",
					ERR.INVALID_REQUEST,
					"agent_id query parameter is required when using host JWT.",
				);
				}
				targetAgentId = ctx.query.agent_id;
			} else {
				throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: targetAgentId }],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (hostSession && agent.hostId !== hostSession.host.id) {
				throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
			}

			const grants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [{ field: "agentId", value: agent.id }],
				});

			return ctx.json({
				agent_id: agent.id,
				host_id: agent.hostId,
				status: agent.status,
				agent_capability_grants: formatGrantsResponse(grants),
				mode: agent.mode,
				user_id: agent.userId,
				created_at: agent.createdAt,
				last_used_at: agent.lastUsedAt,
				expires_at: agent.expiresAt,
			});
		},
	);
}

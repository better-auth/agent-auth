import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentSession,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../types";
import { formatGrantsResponse } from "./_helpers";

/**
 * GET /agent/status (§5.5).
 *
 * Returns the current status of an agent and its capability grants.
 * Supports agent JWT (self-query) or host JWT (requires ?agent_id=...).
 */
export function agentStatus(opts: ResolvedAgentAuthOptions) {
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
				targetAgentId = agentSession.agent.id;
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

			// §5.5: all datetime fields as ISO 8601 strings
			return ctx.json({
				agent_id: agent.id,
				name: agent.name,
				host_id: agent.hostId,
				status: agent.status,
				agent_capability_grants: formatGrantsResponse(grants, opts.capabilities),
				mode: agent.mode,
				user_id: agent.userId,
				activated_at: agent.activatedAt
					? new Date(agent.activatedAt).toISOString()
					: null,
				created_at: agent.createdAt
					? new Date(agent.createdAt).toISOString()
					: null,
				last_used_at: agent.lastUsedAt
					? new Date(agent.lastUsedAt).toISOString()
					: null,
				expires_at: agent.expiresAt
					? new Date(agent.expiresAt).toISOString()
					: null,
			});
		},
	);
}

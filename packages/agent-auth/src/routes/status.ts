import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type {
	Agent,
	AgentPermission,
	AgentSession,
	HostSession,
} from "../types";

const AGENT_TABLE = "agent";
const PERMISSION_TABLE = "agentPermission";

/**
 * GET /agent/status
 *
 * Returns the current status of an agent and its granted scopes (§2.8).
 * Supports agent JWT (self-query) or host JWT (requires ?agentId=...).
 */
export function agentStatus() {
	return createAuthEndpoint(
		"/agent/status",
		{
			method: "GET",
			query: z
				.object({
					agentId: z.string().optional().meta({
						description:
							"Agent ID to query. Required for host JWT, optional for agent JWT.",
					}),
				})
				.optional(),
			metadata: {
				openapi: {
					description:
						"Returns the current status of an agent and its granted scopes (§2.8).",
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
				targetAgentId = ctx.query?.agentId ?? agentSession.agent.id;
			} else if (hostSession) {
				if (!ctx.query?.agentId) {
					throw APIError.from("BAD_REQUEST", {
						message: "agentId query parameter is required when using host JWT.",
						code: ERROR_CODES.AGENT_NOT_FOUND.code,
					});
				}
				targetAgentId = ctx.query.agentId;
			} else {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: targetAgentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (hostSession && agent.hostId !== hostSession.host.id) {
				throw APIError.from("FORBIDDEN", ERROR_CODES.UNAUTHORIZED);
			}

			const permissions = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agent.id }],
			});

			const activeScopes = permissions
				.filter(
					(p) =>
						p.status === "active" &&
						(!p.expiresAt || new Date(p.expiresAt) > new Date()),
				)
				.map((p) => p.scope);

			const pendingScopes = permissions
				.filter((p) => p.status === "pending")
				.map((p) => p.scope);

			return ctx.json({
				agent_id: agent.id,
				host_id: agent.hostId,
				status: agent.status,
				scopes: activeScopes,
				pending_scopes: pendingScopes,
				mode: agent.mode,
				user_id: agent.userId,
				created_at: agent.createdAt,
				last_used_at: agent.lastUsedAt,
				expires_at: agent.expiresAt,
			});
		},
	);
}

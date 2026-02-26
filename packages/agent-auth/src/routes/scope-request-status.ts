import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { AgentPermission } from "../types";

const PERMISSION_TABLE = "agentPermission";
const AGENT_TABLE = "agent";

/**
 * GET /agent/scope-request-status
 *
 * Poll the status of pending permission requests for an agent.
 * Used by the CLI / MCP server to wait for user approval.
 * The requestId is the agent ID.
 */
export function scopeRequestStatus() {
	return createAuthEndpoint(
		"/agent/scope-request-status",
		{
			method: "GET",
			query: z.object({
				requestId: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Check the status of pending permission requests for an agent.",
				},
			},
		},
		async (ctx) => {
			const { requestId: agentId } = ctx.query;

			const agent = await ctx.context.adapter.findOne<{
				id: string;
				name: string;
			}>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.SCOPE_REQUEST_NOT_FOUND);
			}

			const allPerms = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agentId }],
			});

			const activePerms = allPerms.filter((p) => p.status === "active");
			const pendingPerms = allPerms.filter((p) => p.status === "pending");

			const hasPending = pendingPerms.length > 0;
			const status = hasPending ? "pending" : "approved";

			return ctx.json({
				requestId: agentId,
				status,
				agentId,
				agentName: agent.name,
				existingScopes: activePerms.map((p) => p.scope),
				requestedScopes: pendingPerms.map((p) => p.scope),
				scopes: !hasPending ? activePerms.map((p) => p.scope) : undefined,
				added: !hasPending ? [] : undefined,
			});
		},
	);
}

import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import type { AgentHost } from "../../types";
import { parseCapabilityIds } from "../../utils/capabilities";

export function getHost() {
	return createAuthEndpoint(
		"/host/get",
		{
			method: "GET",
			query: z.object({
				host_id: z.string(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Get a specific agent host by ID (§3).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const { host_id: hostId } = ctx.query;

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [
					{ field: "id", value: hostId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!host) {
				throw agentError("NOT_FOUND", ERR.HOST_NOT_FOUND);
			}

			return ctx.json({
				id: host.id,
				name: host.name ?? null,
				default_capabilities: parseCapabilityIds(host.defaultCapabilities),
				status: host.status,
				activated_at: host.activatedAt,
				expires_at: host.expiresAt,
				last_used_at: host.lastUsedAt,
				created_at: host.createdAt,
				updated_at: host.updatedAt,
			});
		}
	);
}

import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import { parseCapabilityIds } from "../../utils/capabilities";
import type { AgentHost } from "../../types";
import { sessionMiddleware } from "better-auth/api";

export function listHosts() {
	return createAuthEndpoint(
		"/host/list",
		{
			method: "GET",
			query: z
				.object({
					status: z
						.enum([
							"active",
							"pending",
							"pending_enrollment",
							"revoked",
							"rejected",
						])
						.optional(),
				})
				.optional(),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "List agent hosts for the current user (§3).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const where: Array<{ field: string; value: string }> = [
				{ field: "userId", value: session.user.id },
			];
			if (ctx.query?.status) {
				where.push({ field: "status", value: ctx.query.status });
			}

			const hosts = await ctx.context.adapter.findMany<AgentHost>({
				model: TABLE.host,
				where,
				sortBy: { field: "createdAt", direction: "desc" },
			});

			return ctx.json({
				hosts: hosts.map((h) => ({
					id: h.id,
					name: h.name ?? null,
					default_capabilities: parseCapabilityIds(h.defaultCapabilities),
					status: h.status,
					activated_at: h.activatedAt,
					expires_at: h.expiresAt,
					last_used_at: h.lastUsedAt,
					created_at: h.createdAt,
					updated_at: h.updatedAt,
				})),
			});
		},
	);
}

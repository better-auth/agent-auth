import { createAuthEndpoint } from "@better-auth/core/api";
import { TABLE } from "../../constants";
import type { Agent, CibaAuthRequest } from "../../types";
import { sessionMiddleware } from "better-auth/api";

export function cibaPending() {
	return createAuthEndpoint(
		"/agent/ciba/pending",
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"List pending CIBA authentication requests for the current user (§9.2).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const requests = await ctx.context.adapter.findMany<CibaAuthRequest>({
				model: TABLE.ciba,
				where: [
					{ field: "userId", value: session.user.id },
					{ field: "status", value: "pending" },
				],
				sortBy: { field: "createdAt", direction: "desc" },
			});

			const now = new Date();
			const active = requests.filter((r) => new Date(r.expiresAt) > now);

			const results = await Promise.all(
				active.map(async (r) => {
					let agentName: string | null = null;
					if (r.agentId) {
						const agent = await ctx.context.adapter.findOne<Agent>({
							model: TABLE.agent,
							where: [{ field: "id", value: r.agentId }],
						});
						agentName = agent?.name ?? null;
					}
					return {
						auth_req_id: r.id,
						client_id: r.clientId,
						agent_id: r.agentId ?? null,
						agent_name: agentName,
						binding_message: r.bindingMessage,
						capability_ids: r.capabilityIds
							? r.capabilityIds.split(/\s+/).filter(Boolean)
							: [],
						delivery_mode: r.deliveryMode,
						expires_in: Math.max(
							0,
							Math.floor(
								(new Date(r.expiresAt).getTime() - now.getTime()) / 1000,
							),
						),
						created_at: r.createdAt,
					};
				}),
			);

			return ctx.json({ requests: results });
		},
	);
}

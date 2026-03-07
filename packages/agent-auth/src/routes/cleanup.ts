import { createAuthEndpoint } from "@better-auth/core/api";
import { TABLE } from "../constants";
import { emit } from "../emit";
import type { Agent, CibaAuthRequest, ResolvedAgentAuthOptions } from "../types";
import { sessionMiddleware } from "better-auth/api";

export function cleanupAgents(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/cleanup",
		{
			method: "POST",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Expire all overdue agents for the current user (§2.4). Returns the count of agents expired.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const now = new Date();

			const activeAgents = await ctx.context.adapter.findMany<Agent>({
				model: TABLE.agent,
				where: [
					{ field: "userId", value: session.user.id },
					{ field: "status", value: "active" },
				],
			});

			const expired = activeAgents.filter(
				(a) => a.expiresAt && new Date(a.expiresAt) <= now,
			);

			await Promise.all(
				expired.map((agent) =>
					ctx.context.adapter.update({
						model: TABLE.agent,
						where: [{ field: "id", value: agent.id }],
						update: { status: "expired", updatedAt: now },
					}),
				),
			);

			const pendingCibas =
				await ctx.context.adapter.findMany<CibaAuthRequest>({
					model: TABLE.ciba,
					where: [
						{ field: "userId", value: session.user.id },
						{ field: "status", value: "pending" },
					],
				});

			const expiredCibas = pendingCibas.filter(
				(r) => new Date(r.expiresAt) <= now,
			);

			await Promise.all(
				expiredCibas.map((r) =>
					ctx.context.adapter.update({
						model: TABLE.ciba,
						where: [{ field: "id", value: r.id }],
						update: { status: "expired", updatedAt: now },
					}),
				),
			);

			if (expired.length > 0) {
				emit(opts, {
					type: "agent.cleanup",
					actorId: session.user.id,
					metadata: {
						count: expired.length,
						agentIds: expired.map((a) => a.id),
						cibaExpired: expiredCibas.length,
					},
				}, ctx);
			}

			return ctx.json({
				expired: expired.length,
				ciba_expired: expiredCibas.length,
			});
		},
	);
}

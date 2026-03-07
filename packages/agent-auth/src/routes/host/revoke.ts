import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import type { Agent, AgentCapabilityGrant, AgentHost, ResolvedAgentAuthOptions } from "../../types";
import { sessionMiddleware } from "better-auth/api";
import { checkSharedOrg } from "../_helpers";

export function revokeHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/revoke",
		{
			method: "POST",
			body: z.object({
				hostId: z.string(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Revoke an agent host and cascade to all agents under it (§6.9).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "id", value: ctx.body.hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
			}

			if (host.userId !== session.user.id && host.userId !== null) {
				const sameOrg = await checkSharedOrg(
					ctx.context.adapter,
					session.user.id,
					host.userId,
				);
				if (!sameOrg) {
					throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
				}
			}

			if (host.status === "revoked") {
				return ctx.json({
					host_id: host.id,
					status: "revoked" as const,
					agents_revoked: 0,
				});
			}

			const now = new Date();

			await ctx.context.adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update: {
					status: "revoked",
					publicKey: "",
					kid: null,
					updatedAt: now,
				},
			});

			const allAgents = await ctx.context.adapter.findMany<Agent>({
				model: TABLE.agent,
				where: [{ field: "hostId", value: host.id }],
			});

			const toRevoke = allAgents.filter(
				(a) => a.status !== "revoked" && a.status !== "rejected",
			);

			for (const agent of toRevoke) {
				await ctx.context.adapter.update({
					model: TABLE.agent,
					where: [{ field: "id", value: agent.id }],
					update: {
						status: "revoked",
						publicKey: "",
						kid: null,
						updatedAt: now,
					},
				});
				const grants =
					await ctx.context.adapter.findMany<AgentCapabilityGrant>({
						model: TABLE.grant,
						where: [{ field: "agentId", value: agent.id }],
					});
				for (const g of grants) {
					if (g.status === "active" || g.status === "pending") {
						await ctx.context.adapter.update({
							model: TABLE.grant,
							where: [{ field: "id", value: g.id }],
							update: { status: "denied", updatedAt: now },
						});
					}
				}
			}

			emit(opts, {
				type: "host.revoked",
				actorId: session.user.id,
				hostId: host.id,
				metadata: { agentsRevoked: toRevoke.length },
			}, ctx);

			return ctx.json({
				host_id: host.id,
				status: "revoked" as const,
				agents_revoked: toRevoke.length,
			});
		},
	);
}

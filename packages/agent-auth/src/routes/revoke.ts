import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /agent/revoke
 *
 * Revoke an agent. Accepts either:
 * - Host JWT: the host proves ownership via `agent.hostId`
 * - User session: the user proves ownership via `agent.userId`
 */
export function revokeAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/revoke",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Revoke an agent via host JWT or user session (§6.6).",
				},
			},
		},
		async (ctx) => {
			const hostSession = (ctx.context as Record<string, unknown>)
				.hostSession as HostSession | undefined;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const userSession = await getSessionFromCtx(ctx as any);

			if (!hostSession && !userSession) {
				throw APIError.from(
					"UNAUTHORIZED",
					ERR.UNAUTHORIZED_SESSION,
				);
			}

			const { agent_id: agentId } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (hostSession) {
				if (agent.hostId !== hostSession.host.id) {
					throw APIError.from("FORBIDDEN", ERR.UNAUTHORIZED);
				}
			} else if (userSession) {
				if (agent.userId !== userSession.user.id) {
					throw APIError.from("FORBIDDEN", ERR.UNAUTHORIZED);
				}
			}

			const now = new Date();
			await ctx.context.adapter.update({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
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
					where: [{ field: "agentId", value: agentId }],
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

			emit(opts, {
				type: "agent.revoked",
				actorId:
					userSession?.user.id ??
					hostSession?.host.userId ??
					undefined,
				agentId: agent.id,
				hostId: agent.hostId,
			}, ctx);

			return ctx.json({
				agent_id: agent.id,
				status: "revoked",
			});
		},
	);
}

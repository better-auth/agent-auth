import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import type {
	Agent,
	AgentHost,
	CibaAuthRequest,
	ResolvedAgentAuthOptions,
} from "../types";
import { sessionMiddleware } from "better-auth/api";

/**
 * POST /agent/approve-connect-account
 *
 * Approve or deny a connect-account request. Auth: user session.
 * On approve: link host to user, activate pending agents under host, claim autonomous agents.
 * On deny: update CIBA status.
 */
export function approveConnectAccount(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/approve-connect-account",
		{
			method: "POST",
			body: z.object({
				requestId: z.string(),
				action: z.enum(["approve", "deny"]),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Approve or deny a connect-account request (§3.4). Links the host to the user on approval.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const userId = session.user.id;
			const { requestId, action } = ctx.body;

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: TABLE.ciba,
				where: [{ field: "id", value: requestId }],
			});

			if (!request) {
				throw APIError.from("NOT_FOUND", ERR.CONNECT_REQUEST_NOT_FOUND);
			}

			if (request.status !== "pending") {
				return ctx.json({
					request_id: request.id,
					status: request.status,
				});
			}

			if (new Date(request.expiresAt) <= new Date()) {
				await ctx.context.adapter.update({
					model: TABLE.ciba,
					where: [{ field: "id", value: request.id }],
					update: { status: "expired", updatedAt: new Date() },
				});
				throw APIError.from("FORBIDDEN", ERR.CONNECT_REQUEST_EXPIRED);
			}

			const now = new Date();

			if (action === "deny") {
				await ctx.context.adapter.update({
					model: TABLE.ciba,
					where: [{ field: "id", value: request.id }],
					update: { status: "denied", updatedAt: now },
				});
				return ctx.json({
					request_id: request.id,
					status: "denied",
				});
			}

			await ctx.context.adapter.update({
				model: TABLE.ciba,
				where: [{ field: "id", value: request.id }],
				update: {
					status: "approved",
					userId,
					updatedAt: now,
				},
			});

			const hostId = request.clientId;
			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "id", value: hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
			}

			if (host.userId) {
				throw APIError.from("CONFLICT", ERR.ACCOUNT_ALREADY_CONNECTED);
			}

			await opts.onHostClaimed?.({
				ctx,
				hostId,
				userId,
				previousUserId: host.userId,
			});

			await ctx.context.adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: hostId }],
				update: { userId, updatedAt: now },
			});

			emit(opts, {
				type: "host.claimed",
				actorId: userId,
				hostId,
				metadata: { previousUserId: host.userId },
			}, ctx);

			const hostAgents = await ctx.context.adapter.findMany<Agent>({
				model: TABLE.agent,
				where: [{ field: "hostId", value: hostId }],
			});

			for (const agent of hostAgents) {
				const agentUpdate: Record<string, unknown> = {
					userId,
					updatedAt: now,
				};

				if (agent.status === "pending") {
					agentUpdate.status = "active";
					agentUpdate.activatedAt = now;
					if (opts.agentSessionTTL > 0) {
						agentUpdate.expiresAt = new Date(
							now.getTime() + opts.agentSessionTTL * 1000,
						);
					}
				} else if (agent.mode === "autonomous") {
					agentUpdate.status = "claimed";
				}

				await ctx.context.adapter.update({
					model: TABLE.agent,
					where: [{ field: "id", value: agent.id }],
					update: agentUpdate,
				});
			}

			return ctx.json({
				request_id: request.id,
				host_id: hostId,
				user_id: userId,
				status: "linked",
			});
		},
	);
}

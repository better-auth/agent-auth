import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, AgentHost, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";

/**
 * POST /agent/approve-connect-account
 *
 * Approves a connect-account request, linking the host to the
 * authenticated user. Requires a user session (cookie auth).
 *
 * The user visits `/device/connect?host_id=...&code=...` in their
 * browser, reviews the request, and calls this endpoint to approve.
 */
export function approveConnectAccount(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/approve-connect-account",
		{
			method: "POST",
			body: z.object({
				hostId: z.string().describe("Host ID to link"),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Approve a connect-account request. Links the host to the authenticated user.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			if (!session?.user?.id) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const userId = session.user.id;
			const { hostId } = ctx.body;

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			if (host.userId) {
				throw APIError.from("CONFLICT", ERROR_CODES.HOST_ALREADY_LINKED);
			}

			await opts.onHostClaimed?.({
				ctx,
				hostId,
				referenceId: host.referenceId,
				userId,
				previousUserId: host.userId,
			});

			await ctx.context.adapter.update({
				model: HOST_TABLE,
				where: [{ field: "id", value: hostId }],
				update: {
					userId,
					updatedAt: new Date(),
				},
			});

			const hostAgents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "hostId", value: hostId }],
			});
			for (const agent of hostAgents) {
				await ctx.context.adapter.update({
					model: AGENT_TABLE,
					where: [{ field: "id", value: agent.id }],
					update: {
						userId,
						updatedAt: new Date(),
					},
				});
			}

			return ctx.json({
				host_id: hostId,
				user_id: userId,
				status: "linked",
			});
		},
	);
}
